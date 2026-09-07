import json
import math
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas import SpillGeometry, SpillMetadataResponse, SpillResponse, SpillUploadResponse
from app.api.routes.store import SPILL_STORE
from app.services.detector_service import detector_service

router = APIRouter(prefix="/spills", tags=["spills"])

BASE_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BASE_DIR / "data" / "sar"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 1 degree of latitude is ~111.32 km everywhere; 1 degree of longitude
# shrinks with latitude by a factor of cos(latitude). The detector's
# GeoJSON is in EPSG:4326 (plain lat/lon degrees), so this gives a
# reasonable area estimate without pulling in a full projection library
# just for this one demo-endpoint calculation.
_KM_PER_DEGREE_LAT = 111.32


def _read_geojson(path: str | None) -> dict | None:
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _shoelace_area_deg2(coordinates: list) -> float:
    """Unsigned polygon area in square degrees (shoelace formula, outer ring only)."""
    ring = coordinates[0] if coordinates else []
    if len(ring) < 3:
        return 0.0
    area = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _estimate_area_sq_km(geojson: dict | None) -> float:
    if not geojson:
        return 0.0

    features = geojson.get("features", [])
    total_deg2 = 0.0
    lat_sum, lat_count = 0.0, 0

    for feature in features:
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates")
        if geom.get("type") == "Polygon" and coords:
            total_deg2 += _shoelace_area_deg2(coords)
            for lon, lat in coords[0]:
                lat_sum += lat
                lat_count += 1
        elif geom.get("type") == "MultiPolygon" and coords:
            for polygon in coords:
                total_deg2 += _shoelace_area_deg2(polygon)
                for lon, lat in polygon[0]:
                    lat_sum += lat
                    lat_count += 1

    if total_deg2 == 0.0 or lat_count == 0:
        return 0.0

    avg_lat_rad = math.radians(lat_sum / lat_count)
    km_per_degree_lon = _KM_PER_DEGREE_LAT * math.cos(avg_lat_rad)
    return round(total_deg2 * _KM_PER_DEGREE_LAT * km_per_degree_lon, 4)


def run_detector(saved_path: str, spill_id: str) -> dict:
    path = Path(saved_path)
    if not path.exists():
        raise FileNotFoundError(f"Uploaded file not found at {saved_path}")

    raw = detector_service.run(
        file_path=saved_path,
        scene_id=spill_id,
    )
    normalized = detector_service.normalize(raw)

    if normalized["status"] == "FAILED":
        error = normalized.get("error") or {}
        raise RuntimeError(error.get("message", "Detection failed."))

    # detector_service.normalize() keeps the real on-disk geojson path
    # under "_artifact_paths" (separate from the web-facing "/artifacts/..."
    # URL in "artifacts") specifically so this route can read it directly.
    geojson_path = normalized.get("_artifact_paths", {}).get("geojson")
    geojson_data = _read_geojson(geojson_path)

    if geojson_data:
        geometry = SpillGeometry(geojson=geojson_data)
        area_sq_km = _estimate_area_sq_km(geojson_data)
        message = normalized["message"]
    else:
        # A COMPLETED status with no geojson file means the detector ran
        # fine but found no oil-class pixels above threshold -- that is a
        # valid, non-error outcome, not something to fail the request over.
        geometry = SpillGeometry(geojson={"type": "FeatureCollection", "features": []})
        area_sq_km = 0.0
        message = "Detection completed: no oil slick above threshold was found."

    return {
        "message": message,
        "geometry": geometry,
        "area_sq_km": area_sq_km,
        "detector_name": normalized.get("metadata", {}).get("detector_name", "detector-service"),
    }


@router.post("/upload", response_model=SpillUploadResponse)
async def upload_spill(file: UploadFile = File(...)):
    spill_id = str(uuid4())
    uploaded_at = datetime.now(timezone.utc)

    original_name = file.filename or f"{spill_id}.bin"
    stored_name = f"{spill_id}_{original_name}"
    stored_path = DATA_DIR / stored_name

    content = await file.read()
    stored_path.write_bytes(content)

    SPILL_STORE[spill_id] = {
        "spill_id": spill_id,
        "filename": original_name,
        "content_type": file.content_type or "application/octet-stream",
        "saved_path": str(stored_path.resolve()),
        "uploaded_at": uploaded_at,
        "status": "uploaded",
        "source": "manual-upload",
    }

    return SpillUploadResponse(**SPILL_STORE[spill_id])


@router.post("/{spill_id}/detect", response_model=SpillResponse)
async def detect_spill(spill_id: str):
    spill = SPILL_STORE.get(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail="Spill not found")

    saved_path = spill["saved_path"]

    try:
        detection = run_detector(saved_path, spill_id)
    except FileNotFoundError as exc:
        spill["status"] = "detection_failed"
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        spill["status"] = "detection_failed"
        raise HTTPException(
            status_code=500,
            detail={
                "code": "DETECTION_FAILED",
                "message": "Detector execution failed",
                "details": {"spill_id": spill_id, "error": str(exc)},
            },
        )

    detected_at = datetime.now(timezone.utc)

    spill["status"] = "detected"
    spill["detected_at"] = detected_at
    spill["geometry"] = detection["geometry"].model_dump()
    spill["area_sq_km"] = detection["area_sq_km"]
    spill["detector_name"] = detection.get("detector_name")

    return SpillResponse(
        spill_id=spill_id,
        status="detected",
        message=detection["message"],
        geometry=detection["geometry"],
        area_sq_km=detection["area_sq_km"],
        detected_at=detected_at,
    )


@router.get("/{spill_id}", response_model=SpillMetadataResponse)
async def get_spill(spill_id: str):
    spill = SPILL_STORE.get(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail="Spill not found")

    return SpillMetadataResponse(**spill)
