"""
app/services/ais_service.py

Implements the `ais_service` object that app/api/routes/ais.py imports:

    from app.services.ais_service import ais_service
    ais_service.query_tracks(start_time, end_time, bbox=None, lat=None,
                              lon=None, radius_km=None, corridor_geojson=None,
                              mmsi=None, limit=100) -> {
        "available": bool,
        "source": "real" | "unavailable",
        "provenance": str | None,
        "features": [...],
    }

=== WHY THIS FILE WAS REWRITTEN ===

The previous version of this file fell back to `_generate_synthetic_tracks()`
-- six fabricated vessels with invented MMSIs, names, and positions --
whenever no `data/ais/*.json` file existed. That fallback was silently
reachable from the live API with no UI-visible warning, which is exactly
what this project's data-integrity rules forbid: synthetic data must never
be returned as if it were real, and must never be the default/primary path.

That fallback has been REMOVED. It is not present in this file in any form,
not even behind a flag. There is nothing in this module that invents a
vessel, an MMSI, or a coordinate.

=== WHAT THIS FILE DOES INSTEAD ===

It reads Pratyush's real, already-cleaned AIS parquet files directly:

    data/ais/cleaned/ais_phase3_fixture_003.parquet       (71 real vessels)
    data/ais/cleaned/ais_phase3_fixture_001_broad.parquet (990 real vessels)

These are the only two cleaned fixture files in the repository that
actually contain rows (ais_phase3_fixture_001.parquet and
ais_phase3_fixture_002.parquet are present but empty -- 0 rows -- verified
by inspection before writing this loader, so they are skipped rather than
silently producing zero-vessel responses that look like a bug).

Every row in these parquet files is real AIS data that already went
through Pratyush's cleaning pipeline (see data/ais/reports/day9_snapshot.json
and data/ais/reports/phase3_filtering_report_SPILL_TEST_FIXTURE_AIS_003.json
for its documented provenance and limitations) -- this loader does not
re-derive, filter, or score anything; it only reshapes already-cleaned rows
into the GeoJSON FeatureCollection shape app/api/routes/ais.py expects.

Grouping/shape logic:
  - Rows are grouped by mmsi (int64 in the parquet; cast to str for the
    API, matching AISTrackFeatureProperties.mmsi: str).
  - A group with 2+ positions becomes a LineString feature (matches
    real vessel movement across the cleaned rows).
  - A group with exactly 1 position becomes a Point feature (a track
    with a single real AIS ping -- do not fabricate a second point to
    force a line).
  - vessel_name / imo / call_sign come straight from the parquet columns
    when present and non-null; left as None otherwise (never invented).
  - properties.quality.source_file_provenance is always set to the
    on-disk parquet path actually read, so the frontend (and any human
    inspecting a raw API response) can see exactly which real file a
    given vessel's data came from.

=== IF NEITHER PARQUET FILE IS READABLE ===

query_tracks() returns:
    {"available": False, "source": "unavailable", "provenance": None,
     "features": []}

No exception is raised for this case (a missing/corrupt data file is an
expected "real data unavailable" business state, not a 500), and nothing
synthetic is substituted. app/api/routes/ais.py passes this straight
through to the client.

=== POSTGIS PATH ===

The real production path (`data/queries/export_vessel_tracks_geojson.py`
querying `ais_positions` in PostGIS, feeding `data/etl/build_frontend_tracks.py`)
is NOT implemented here and NOT removed from the repository -- those
scripts are untouched. This loader is the parquet-based equivalent of that
same real data for an environment where PostGIS isn't running. When
PostGIS is available, replace `_load_real_tracks()` below with a call
against `ais_positions` (or point it at the output of
`export_vessel_tracks_geojson.py` once that has been run) -- the rest of
this file (filtering, response shape, provenance handling) does not need
to change either way.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import os

BASE_DIR = Path(__file__).resolve().parents[2]  # .../backend

# IMPORTANT -- repo layout note:
# backend/data/ only holds this backend's own upload scratch space
# (backend/data/sar/, populated by app/api/routes/spills.py at runtime).
# Pratyush's real, already-cleaned AIS parquet output lives in the
# top-level data/ folder that is a SIBLING of backend/, i.e.
# <repo_root>/data/ais/cleaned/ -- NOT backend/data/ais/cleaned/. Those are
# two different directories that happen to share a name. This was verified
# by inspecting both zips directly: backend-integrated.zip's data/ only
# contains data/sar/, while the standalone data.zip's data/ais/cleaned/
# contains the real parquet files this loader needs.
#
# AIS_CLEANED_DIR_OVERRIDE lets you point this at wherever your actual
# checkout puts the top-level data/ folder relative to backend/, without
# editing code -- set it in your .env or shell before starting uvicorn if
# your layout differs from the sibling-folder assumption below.
_override = os.environ.get("AIS_CLEANED_DIR_OVERRIDE")
if _override:
    AIS_CLEANED_DIR = Path(_override)
else:
    # BASE_DIR.parent is <repo_root> when backend/ is a direct child of it.
    AIS_CLEANED_DIR = BASE_DIR.parent / "data" / "ais" / "cleaned"

# Only the fixture files verified (by direct inspection with pandas/pyarrow
# before writing this loader) to actually contain rows. The other two
# cleaned fixtures in this directory (ais_phase3_fixture_001.parquet,
# ais_phase3_fixture_002.parquet) are present on disk but have 0 rows --
# listing them here would silently produce an empty "available: true"
# response that looks like a bug rather than the honest empty inputs they
# are, so they are intentionally left out of this list rather than handled
# with special-case code.
REAL_PARQUET_FILES = [
    AIS_CLEANED_DIR / "ais_phase3_fixture_003.parquet",
    AIS_CLEANED_DIR / "ais_phase3_fixture_001_broad.parquet",
]


# ---------------------------------------------------------------------------
# Geo helpers (unchanged from the previous version -- still needed for
# filtering real positions against a caller-supplied bbox/point/corridor)
# ---------------------------------------------------------------------------


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _point_in_bbox(lat: float, lon: float, bbox: list[float]) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def _point_in_ring(lat: float, lon: float, ring: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon test against a single [lon, lat] ring."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def _point_in_geojson_polygon(lat: float, lon: float, geometry: dict) -> bool:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        return False

    if geom_type == "Polygon":
        return _point_in_ring(lat, lon, coords[0])
    if geom_type == "MultiPolygon":
        return any(_point_in_ring(lat, lon, polygon[0]) for polygon in coords)
    return False


# ---------------------------------------------------------------------------
# Real-data loading from Pratyush's cleaned parquet files
# ---------------------------------------------------------------------------


def _relative_path_label(path: Path) -> str:
    """Best-effort human-readable path for provenance strings. The real
    data file lives under <repo_root>/data/..., which is a SIBLING of
    backend/ (see AIS_CLEANED_DIR comment above), not a subpath of
    BASE_DIR -- so path.relative_to(BASE_DIR) raises ValueError there.
    Try repo root (BASE_DIR.parent) first, then BASE_DIR itself (covers
    an AIS_CLEANED_DIR_OVERRIDE pointed inside backend/), then fall back
    to the absolute path rather than letting a formatting nicety crash
    a real, successful data load."""
    for anchor in (BASE_DIR.parent, BASE_DIR):
        try:
            return str(path.relative_to(anchor))
        except ValueError:
            continue
    return str(path)


def _clean_str(value: Any) -> str | None:
    """pandas gives NaN/None/pd.NA for missing string columns -- normalize
    all of those to a real None rather than the string 'nan'."""
    if value is None:
        return None
    try:
        if value != value:  # NaN check without importing pandas/numpy here
            return None
    except Exception:
        pass
    text = str(value).strip()
    return text or None


def _load_one_parquet(path: Path) -> list[dict[str, Any]]:
    """Reads one cleaned AIS parquet file and returns it grouped into
    GeoJSON Feature dicts, one per MMSI, matching AISTrackFeature in
    app/api/routes/ais.py. Every value here is read from the file --
    nothing is generated or guessed."""
    import pandas as pd  # local import: keeps this optional dependency out
    # of modules that don't need it, and gives a clear ImportError (caught
    # by _load_real_tracks below) if pandas/pyarrow aren't installed yet.

    frame = pd.read_parquet(path)
    if frame.empty:
        return []

    frame = frame.sort_values(["mmsi", "observed_at"])

    features: list[dict[str, Any]] = []

    for mmsi, group in frame.groupby("mmsi"):
        positions = []
        for _, row in group.iterrows():
            observed_at = row["observed_at"]
            if hasattr(observed_at, "isoformat"):
                timestamp_utc = observed_at.isoformat()
            else:
                timestamp_utc = str(observed_at)

            positions.append(
                {
                    "timestamp_utc": timestamp_utc,
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "sog_knots": (
                        float(row["sog_knots"])
                        if row.get("sog_knots") == row.get("sog_knots")
                        else None
                    ),
                    "cog_deg": (
                        float(row["cog_degrees"])
                        if row.get("cog_degrees") == row.get("cog_degrees")
                        else None
                    ),
                    "heading_deg": (
                        float(row["heading_degrees"])
                        if row.get("heading_degrees") == row.get("heading_degrees")
                        else None
                    ),
                }
            )

        coords = [[p["longitude"], p["latitude"]] for p in positions]
        geometry = (
            {"type": "Point", "coordinates": coords[0]}
            if len(coords) == 1
            else {"type": "LineString", "coordinates": coords}
        )

        first_row = group.iloc[0]

        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "mmsi": str(int(mmsi)),
                    "vessel_name": _clean_str(first_row.get("vessel_name")),
                    "imo": _clean_str(first_row.get("imo")),
                    "callsign": _clean_str(first_row.get("call_sign")),
                    "positions": positions,
                    "quality": {
                        "track_continuity": (
                            "continuous_enough" if len(positions) >= 2 else "fragmented_or_single"
                        ),
                        "gap_statistics": {"position_count": len(positions)},
                        "completeness": None,
                        "source_file_provenance": (
                            f"real (Pratyush AIS ETL, cleaned parquet): "
                            f"{_relative_path_label(path)}"
                        ),
                    },
                },
            }
        )

    return features


def _load_real_tracks() -> tuple[list[dict[str, Any]], str] | None:
    """Tries each known real, non-empty cleaned parquet file in order and
    returns (features, provenance_string) for the first one that loads
    successfully with at least one vessel. Returns None if none of them
    are readable -- callers must treat that as "real AIS unavailable",
    never substitute anything else."""
    for path in REAL_PARQUET_FILES:
        if not path.exists():
            continue
        try:
            features = _load_one_parquet(path)
        except Exception:
            # A real file that exists but can't be read (missing pandas/
            # pyarrow, corrupt file, schema drift) is still "unavailable",
            # not a reason to fabricate a response -- try the next real
            # file, if any.
            continue

        if features:
            return features, _relative_path_label(path)

    return None


# ---------------------------------------------------------------------------
# Filtering (unchanged logic from the previous version)
# ---------------------------------------------------------------------------


def _feature_matches(
    feature: dict[str, Any],
    *,
    bbox: list[float] | None,
    lat: float | None,
    lon: float | None,
    radius_km: float | None,
    corridor_geometry: dict | None,
    mmsi: str | None,
) -> bool:
    properties = feature.get("properties", {})

    if mmsi and str(properties.get("mmsi")) != str(mmsi):
        return False

    positions = properties.get("positions", [])
    if not positions:
        return not (bbox or (lat is not None and lon is not None) or corridor_geometry)

    if bbox:
        return any(_point_in_bbox(p["latitude"], p["longitude"], bbox) for p in positions)

    if lat is not None and lon is not None and radius_km is not None:
        return any(
            _haversine_km(lat, lon, p["latitude"], p["longitude"]) <= radius_km
            for p in positions
        )

    if corridor_geometry:
        return any(
            _point_in_geojson_polygon(p["latitude"], p["longitude"], corridor_geometry)
            for p in positions
        )

    return True


class AISService:
    def query_tracks(
        self,
        start_time: datetime,
        end_time: datetime,
        bbox: list[float] | None = None,
        lat: float | None = None,
        lon: float | None = None,
        radius_km: float | None = None,
        corridor_geojson: str | None = None,
        mmsi: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        corridor_geometry = None
        if corridor_geojson:
            try:
                parsed = json.loads(corridor_geojson)
                corridor_geometry = (
                    parsed.get("geometry", parsed)
                    if parsed.get("type") == "Feature"
                    else parsed
                )
            except (json.JSONDecodeError, AttributeError):
                corridor_geometry = None

        loaded = _load_real_tracks()

        if loaded is None:
            # Honest empty state -- per project data-integrity rules, this
            # must NEVER fall back to generated/synthetic vessels.
            return {
                "available": False,
                "source": "unavailable",
                "provenance": None,
                "features": [],
            }

        features, provenance = loaded

        filtered = [
            feature
            for feature in features
            if _feature_matches(
                feature,
                bbox=bbox,
                lat=lat,
                lon=lon,
                radius_km=radius_km,
                corridor_geometry=corridor_geometry,
                mmsi=mmsi,
            )
        ]

        return {
            "available": True,
            "source": "real",
            "provenance": provenance,
            "features": filtered[:limit],
        }


ais_service = AISService()
