from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]  # <repo>/backend
REPO_ROOT = BASE_DIR.parent

_override = os.environ.get("AIS_CLEANED_DIR_OVERRIDE")
AIS_CLEANED_DIR = Path(_override) if _override else REPO_ROOT / "data" / "ais" / "cleaned"
REAL_PARQUET_FILES = [
    AIS_CLEANED_DIR / "ais_phase3_fixture_003.parquet",
    AIS_CLEANED_DIR / "ais_phase3_fixture_001_broad.parquet",
]

# Synthetic AIS is available only through an explicit scenario_id. It is
# deliberately not a fallback for missing real AIS data.
SYNTHETIC_SCENARIOS_DIR = REPO_ROOT / "ml" / "synthetic_demo_outputs"
_SCENARIO_ID_RE = re.compile(r"^SPILL_SYNTHETIC_DEMO_[A-Z0-9_-]+$")


def _relative_path_label(path: Path) -> str:
    for anchor in (REPO_ROOT, BASE_DIR):
        try:
            return str(path.relative_to(anchor))
        except ValueError:
            pass
    return str(path)


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if value != value:  # NaN / pandas.NA
            return None
    except Exception:
        pass
    value = str(value).strip()
    return value or None


def _as_float(value: Any) -> float | None:
    try:
        if value is None or value != value:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_time(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * radius_m * math.asin(math.sqrt(a))


def _point_in_ring(lat: float, lon: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        crosses = ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if crosses:
            inside = not inside
        j = i
    return inside


def _point_in_geojson_polygon(lat: float, lon: float, geometry: dict[str, Any]) -> bool:
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "Polygon":
        return bool(coords) and _point_in_ring(lat, lon, coords[0])
    if kind == "MultiPolygon":
        return any(polygon and _point_in_ring(lat, lon, polygon[0]) for polygon in coords)
    return False


def _point_in_bbox(lat: float, lon: float, bbox: list[float]) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def _geometry_from_geojson(value: dict[str, Any]) -> dict[str, Any] | None:
    if value.get("type") == "Feature":
        return value.get("geometry")
    if value.get("type") == "FeatureCollection":
        features = value.get("features") or []
        return features[0].get("geometry") if features else None
    return value if value.get("type") in {"Polygon", "MultiPolygon"} else None


def _polygon_center(geometry: dict[str, Any]) -> tuple[float, float] | None:
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "Polygon":
        ring = coords[0] if coords else []
    elif geometry.get("type") == "MultiPolygon":
        ring = coords[0][0] if coords and coords[0] else []
    else:
        return None
    if not ring:
        return None
    points = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def _bearing_deg(from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> float:
    dlon = math.radians(to_lon - from_lon)
    lat1, lat2 = math.radians(from_lat), math.radians(to_lat)
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _heading_alignment(track_bearing: float | None, target_bearing: float | None) -> float:
    if track_bearing is None or target_bearing is None:
        return 0.5
    difference = abs((track_bearing - target_bearing + 180.0) % 360.0 - 180.0)
    return round(max(0.0, 1.0 - difference / 180.0), 6)


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _scenario_dir(scenario_id: str) -> Path | None:
    if not _SCENARIO_ID_RE.fullmatch(scenario_id):
        return None
    candidate = (SYNTHETIC_SCENARIOS_DIR / scenario_id).resolve()
    try:
        candidate.relative_to(SYNTHETIC_SCENARIOS_DIR.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_dir() else None


def _scenario_context(scenario_id: str, directory: Path) -> dict[str, Any] | None:
    corridor_payload = _read_json(directory / "origin_corridor.geojson")
    drift_metadata = _read_json(directory / "drift_metadata.json")
    if not corridor_payload or not drift_metadata:
        return None
    corridor = _geometry_from_geojson(corridor_payload)
    center = _polygon_center(corridor) if corridor else None
    origin_start = _parse_time(drift_metadata.get("origin_window_start_utc"))
    origin_end = _parse_time(drift_metadata.get("origin_window_end_utc"))
    if not corridor or not center or not origin_start or not origin_end:
        return None
    return {
        "scenario_id": scenario_id,
        "corridor": corridor,
        "center": center,
        "origin_time": origin_start + (origin_end - origin_start) / 2,
        "source_reference": (
            f"Synthetic AIS TEST_FIXTURE: {scenario_id}. "
            "For algorithm demonstration only; not real-world vessel attribution."
        ),
    }


def _candidate_input(
    *,
    scenario: dict[str, Any],
    mmsi: str,
    vessel_name: str | None,
    positions: list[dict[str, Any]],
) -> dict[str, Any]:
    center_lon, center_lat = scenario["center"]
    distances = [
        _haversine_m(position["latitude"], position["longitude"], center_lat, center_lon)
        for position in positions
    ]
    nearest_index = min(range(len(positions)), key=lambda index: distances[index])
    nearest = positions[nearest_index]
    distance_m = distances[nearest_index]
    intersects = any(
        _point_in_geojson_polygon(position["latitude"], position["longitude"], scenario["corridor"])
        for position in positions
    )
    nearest_time = _parse_time(nearest["timestamp_utc"]) or scenario["origin_time"]
    minutes_from_origin = (nearest_time - scenario["origin_time"]).total_seconds() / 60.0

    track_bearing = None
    if len(positions) >= 2:
        track_bearing = _bearing_deg(
            positions[0]["latitude"], positions[0]["longitude"],
            positions[-1]["latitude"], positions[-1]["longitude"],
        )
    target_bearing = _bearing_deg(
        nearest["latitude"], nearest["longitude"], center_lat, center_lon,
    ) if distance_m > 1 else track_bearing

    observed_times = [_parse_time(position["timestamp_utc"]) for position in positions]
    observed_times = [value for value in observed_times if value]
    gap_count = 0
    if len(observed_times) >= 3:
        gaps = [(later - earlier).total_seconds() / 60.0 for earlier, later in zip(observed_times, observed_times[1:])]
        nominal_gap = sorted(gaps)[len(gaps) // 2]
        gap_count = sum(gap > max(40.0, nominal_gap * 2.0) for gap in gaps)

    position_count = len(positions)
    completeness = round(min(1.0, position_count / 10.0), 6)
    continuity = round(max(0.0, 1.0 - gap_count / max(1, position_count - 1)), 6)
    spatial = round(1.0 if intersects else max(0.0, 1.0 - distance_m / 50_000.0), 6)
    temporal = round(max(0.0, 1.0 - abs(minutes_from_origin) / 360.0), 6)
    heading = _heading_alignment(track_bearing, target_bearing)
    quality = round((completeness + continuity) / 2.0, 6)

    return {
        "candidate_id": f"{scenario['scenario_id']}:{mmsi}",
        "mmsi": mmsi,
        "vessel_name": vessel_name,
        "spatial_score": spatial,
        "temporal_score": temporal,
        "heading_score": heading,
        "intersection_score": 1.0 if intersects else spatial,
        "continuity_score": continuity,
        "quality_score": quality,
        "distance_to_origin_m": round(distance_m, 3),
        "minutes_from_origin": round(minutes_from_origin, 3),
        "intersects_corridor": intersects,
        "ais_quality": {
            "track_continuity": continuity,
            "data_completeness": completeness,
            "position_count": position_count,
            "gap_count": gap_count,
            "source": "synthetic_test_fixture",
        },
        "source_reference": scenario["source_reference"],
        "track_reference": f"synthetic_ais_tracks.parquet#mmsi={mmsi}",
    }


def _load_one_parquet(path: Path, *, scenario: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    import pandas as pd

    frame = pd.read_parquet(path)
    required = {"mmsi", "observed_at", "latitude", "longitude"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"AIS parquet is missing required columns: {sorted(missing)}")
    if frame.empty:
        return []

    frame = frame.sort_values(["mmsi", "observed_at"])
    features: list[dict[str, Any]] = []
    for mmsi_value, group in frame.groupby("mmsi"):
        positions: list[dict[str, Any]] = []
        for _, row in group.iterrows():
            latitude = _as_float(row.get("latitude"))
            longitude = _as_float(row.get("longitude"))
            timestamp = _clean_str(row.get("observed_at"))
            if latitude is None or longitude is None or not timestamp:
                continue
            positions.append({
                "timestamp_utc": timestamp,
                "latitude": latitude,
                "longitude": longitude,
                "sog_knots": _as_float(row.get("sog_knots")),
                "cog_deg": _as_float(row.get("cog_degrees")),
                "heading_deg": _as_float(row.get("heading_degrees")),
            })
        if not positions:
            continue

        mmsi = _clean_str(mmsi_value) or "unknown"
        first_row = group.iloc[0]
        vessel_name = _clean_str(first_row.get("vessel_name"))
        coords = [[position["longitude"], position["latitude"]] for position in positions]
        geometry = {"type": "Point", "coordinates": coords[0]} if len(coords) == 1 else {"type": "LineString", "coordinates": coords}

        if scenario:
            quality = {
                "track_continuity": "synthetic_test_fixture",
                "gap_statistics": {"position_count": len(positions)},
                "completeness": min(1.0, len(positions) / 10.0),
                "source_file_provenance": scenario["source_reference"],
            }
            candidate = _candidate_input(scenario=scenario, mmsi=mmsi, vessel_name=vessel_name, positions=positions)
        else:
            quality = {
                "track_continuity": "continuous_enough" if len(positions) >= 2 else "fragmented_or_single",
                "gap_statistics": {"position_count": len(positions)},
                "completeness": None,
                "source_file_provenance": f"real cleaned AIS parquet: {_relative_path_label(path)}",
            }
            candidate = None

        properties: dict[str, Any] = {
            "mmsi": mmsi,
            "vessel_name": vessel_name,
            "imo": _clean_str(first_row.get("imo")),
            "callsign": _clean_str(first_row.get("call_sign")),
            "positions": positions,
            "quality": quality,
        }
        if scenario:
            properties.update({
                "scenario_id": scenario["scenario_id"],
                "data_mode": "TEST_FIXTURE",
                "ais_data_origin": "SYNTHETIC",
                "is_synthetic": True,
                "candidate_input": candidate,
            })
        features.append({"type": "Feature", "geometry": geometry, "properties": properties})
    return features


def _load_real_tracks() -> tuple[list[dict[str, Any]], str] | None:
    for path in REAL_PARQUET_FILES:
        if not path.exists():
            continue
        try:
            features = _load_one_parquet(path)
        except Exception:
            continue
        if features:
            return features, _relative_path_label(path)
    return None


def _load_synthetic_tracks(scenario_id: str) -> tuple[list[dict[str, Any]], str] | None:
    directory = _scenario_dir(scenario_id)
    if not directory:
        return None
    context = _scenario_context(scenario_id, directory)
    parquet_path = directory / "synthetic_ais_tracks.parquet"
    if not context or not parquet_path.is_file():
        return None
    try:
        features = _load_one_parquet(parquet_path, scenario=context)
    except Exception:
        return None
    if not features:
        return None
    return features, f"Synthetic AIS TEST_FIXTURE: {_relative_path_label(parquet_path)}"


def _feature_overlaps_time(feature: dict[str, Any], start_time: datetime, end_time: datetime) -> bool:
    for position in feature.get("properties", {}).get("positions", []):
        timestamp = _parse_time(position.get("timestamp_utc"))
        if timestamp and start_time <= timestamp <= end_time:
            return True
    return False


def _feature_matches(
    feature: dict[str, Any], *, bbox: list[float] | None, lat: float | None,
    lon: float | None, radius_km: float | None, corridor_geometry: dict[str, Any] | None,
    mmsi: str | None,
) -> bool:
    properties = feature.get("properties", {})
    if mmsi and str(properties.get("mmsi")) != str(mmsi):
        return False
    positions = properties.get("positions", [])
    if bbox:
        return any(_point_in_bbox(item["latitude"], item["longitude"], bbox) for item in positions)
    if lat is not None and lon is not None and radius_km is not None:
        return any(_haversine_m(lat, lon, item["latitude"], item["longitude"]) <= radius_km * 1000 for item in positions)
    if corridor_geometry:
        return any(_point_in_geojson_polygon(item["latitude"], item["longitude"], corridor_geometry) for item in positions)
    return True


class AISService:
    def query_tracks(
        self, start_time: datetime, end_time: datetime, bbox: list[float] | None = None,
        lat: float | None = None, lon: float | None = None, radius_km: float | None = None,
        corridor_geojson: str | None = None, mmsi: str | None = None, limit: int = 100,
        scenario_id: str | None = None,
    ) -> dict[str, Any]:
        start_time = start_time.replace(tzinfo=timezone.utc) if start_time.tzinfo is None else start_time.astimezone(timezone.utc)
        end_time = end_time.replace(tzinfo=timezone.utc) if end_time.tzinfo is None else end_time.astimezone(timezone.utc)
        corridor_geometry = None
        if corridor_geojson:
            try:
                corridor_geometry = _geometry_from_geojson(json.loads(corridor_geojson))
            except (json.JSONDecodeError, TypeError):
                corridor_geometry = None

        if scenario_id:
            loaded = _load_synthetic_tracks(scenario_id)
            source = "synthetic_test_fixture"
        else:
            loaded = _load_real_tracks()
            source = "real"
        if loaded is None:
            return {"available": False, "source": "unavailable", "provenance": None, "features": []}

        features, provenance = loaded
        filtered = [
            feature for feature in features
            if _feature_overlaps_time(feature, start_time, end_time)
            and _feature_matches(
                feature, bbox=bbox, lat=lat, lon=lon, radius_km=radius_km,
                corridor_geometry=corridor_geometry, mmsi=mmsi,
            )
        ]
        return {"available": True, "source": source, "provenance": provenance, "features": filtered[:limit]}


ais_service = AISService()
