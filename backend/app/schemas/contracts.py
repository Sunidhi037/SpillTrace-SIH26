from datetime import datetime
from typing import Any, Optional, Literal

from pydantic import BaseModel, Field


class SpillUploadRequest(BaseModel):
    filename: str
    content_type: str
    source: Optional[str] = None


class SpillUploadResponse(BaseModel):
    spill_id: str
    filename: str
    content_type: str
    saved_path: str
    uploaded_at: datetime
    status: str


class SpillGeometry(BaseModel):
    type: str = "FeatureCollection"
    coordinates: list[Any] | None = None
    geojson: dict[str, Any] | None = None


class SpillResponse(BaseModel):
    spill_id: str
    status: str
    message: str
    geometry: Optional[SpillGeometry] = None
    area_sq_km: Optional[float] = None
    detected_at: Optional[datetime] = None


class SpillMetadataResponse(BaseModel):
    spill_id: str
    filename: str
    status: str
    uploaded_at: datetime
    source: Optional[str] = None
    # Populated once POST /spills/{spill_id}/detect (app/api/routes/spills.py)
    # has run against this spill -- it already writes all four of these onto
    # SPILL_STORE, but this schema wasn't exposing them, so a fresh page
    # load (no sessionStorage) couldn't recover a previous detection result.
    detected_at: Optional[datetime] = None
    geometry: Optional[SpillGeometry] = None
    area_sq_km: Optional[float] = None
    detector_name: Optional[str] = None


class SARSceneMetadata(BaseModel):
    scene_id: str
    source: str
    acquisition_start_utc: Optional[datetime] = None
    acquisition_end_utc: Optional[datetime] = None
    source_crs: Optional[str] = None
    output_crs: str = "EPSG:4326"
    georeferencing_method: Optional[str] = None
    georeferencing_confidence: Optional[str] = None


class CompatibilityStatus(BaseModel):
    compatible: bool
    reasons: list[str] = Field(default_factory=list)
    temporal_overlap: Optional[bool] = None
    geographic_overlap: Optional[bool] = None
    crs_valid: Optional[bool] = None
    environmental_coverage: Optional[bool] = None


class DetectionResult(BaseModel):
    spill_id: str
    detector_name: str
    model_name: Optional[str] = None
    fallback_used: bool = False
    fallback_reason: Optional[str] = None
    probability_threshold: Optional[float] = None
    mask_path: Optional[str] = None
    overlay_path: Optional[str] = None
    metadata_path: Optional[str] = None
    geometry: Optional[SpillGeometry] = None
    detected_at: Optional[datetime] = None


class DriftRun(BaseModel):
    run_id: str
    spill_id: str
    mode: Literal["hindcast", "forecast"]
    drift_data_mode: Literal["data-backed", "analyst-parameter-driven"]
    corridor_geojson: Optional[dict[str, Any]] = None
    centroid: Optional[dict[str, Any]] = None
    uncertainty_radius_m: Optional[float] = None
    time_window_start_utc: Optional[datetime] = None
    time_window_end_utc: Optional[datetime] = None
    assumptions: dict[str, Any] = Field(default_factory=dict)


class AISTrackResponse(BaseModel):
    vessel_count: int = 0
    tracks_geojson: Optional[dict[str, Any]] = None
    source_manifest: Optional[dict[str, Any]] = None


class CandidateResult(BaseModel):
    candidate_id: str
    vessel_name: Optional[str] = None
    mmsi: Optional[str] = None
    score: float
    score_contributions: dict[str, float] = Field(default_factory=dict)
    evidence_statements: list[str] = Field(default_factory=list)
    wording: str = "Highest-ranked candidate under available evidence"


class ReportResult(BaseModel):
    report_id: str
    spill_id: str
    status: str
    report_path: Optional[str] = None