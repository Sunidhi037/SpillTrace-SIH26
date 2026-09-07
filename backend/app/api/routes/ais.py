from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api/v1/ais", tags=["AIS"])


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: list[float]


class LineStringGeometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]


class AISQuality(BaseModel):
    track_continuity: str | None = None
    gap_statistics: dict[str, Any] = Field(default_factory=dict)
    completeness: float | None = None
    source_file_provenance: str | None = None


class AISPosition(BaseModel):
    timestamp_utc: datetime
    latitude: float
    longitude: float
    sog_knots: float | None = None
    cog_deg: float | None = None
    heading_deg: float | None = None


class AISTrackFeatureProperties(BaseModel):
    mmsi: str
    vessel_name: str | None = None
    imo: str | None = None
    callsign: str | None = None
    positions: list[AISPosition] = Field(default_factory=list)
    quality: AISQuality = Field(default_factory=AISQuality)


class AISTrackFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: LineStringGeometry | PointGeometry
    properties: AISTrackFeatureProperties


class AISTrackFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[AISTrackFeature]
    filters: dict[str, Any] = Field(default_factory=dict)
    # --- Added when wiring the real-parquet AIS adapter -------------------
    # These three fields let a caller (or a human reading a raw response)
    # tell real AIS data apart from an unavailable state WITHOUT having to
    # infer it from an empty features list (which is also a valid outcome
    # for a real query that legitimately matched nothing). They are
    # additive: existing code that only reads `.features` is unaffected.
    available: bool = True
    source: Literal["real", "unavailable"] = "real"
    provenance: str | None = None


def get_ais_service():
    """
    Replace this import with your real service wiring.
    Expected methods:
      - query_tracks(start_time, end_time, bbox=None, lat=None, lon=None, radius_km=None,
                     corridor_geojson=None, mmsi=None, limit=100)
    """
    try:
        from app.services.ais_service import ais_service
        return ais_service
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AIS service unavailable: {exc}") from exc


@router.get("/tracks", response_model=AISTrackFeatureCollection)
def get_ais_tracks(
    start_time: datetime = Query(..., description="UTC ISO timestamp"),
    end_time: datetime = Query(..., description="UTC ISO timestamp"),
    bbox: str | None = Query(None, description="minLon,minLat,maxLon,maxLat"),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_km: float | None = Query(None, gt=0),
    corridor_geojson: str | None = Query(None, description="GeoJSON string"),
    mmsi: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
):
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    if bbox and any(v is not None for v in [lat, lon, radius_km, corridor_geojson]):
        raise HTTPException(
            status_code=400,
            detail="Use bbox OR point/radius OR corridor_geojson, not multiple spatial filters"
        )

    if corridor_geojson and any(v is not None for v in [lat, lon, radius_km]):
        raise HTTPException(
            status_code=400,
            detail="Use corridor_geojson alone, not with point/radius"
        )

    if (lat is None) != (lon is None):
        raise HTTPException(status_code=400, detail="lat and lon must be provided together")

    if radius_km is not None and (lat is None or lon is None):
        raise HTTPException(status_code=400, detail="radius_km requires lat and lon")

    bbox_parsed = None
    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = [float(x.strip()) for x in bbox.split(",")]
            bbox_parsed = [min_lon, min_lat, max_lon, max_lat]
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid bbox format") from exc

    service = get_ais_service()
    result = service.query_tracks(
        start_time=start_time,
        end_time=end_time,
        bbox=bbox_parsed,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        corridor_geojson=corridor_geojson,
        mmsi=mmsi,
        limit=limit,
    )

    return AISTrackFeatureCollection(
        features=result.get("features", []),
        filters={
            "start_time": start_time,
            "end_time": end_time,
            "bbox": bbox_parsed,
            "lat": lat,
            "lon": lon,
            "radius_km": radius_km,
            "mmsi": mmsi,
            "limit": limit,
        },
        available=result.get("available", True),
        source=result.get("source", "real"),
        provenance=result.get("provenance"),
    )