import sys
from pathlib import Path
from typing import Any

from app.schemas.detection import CLASS_MAPPING

# `ml/` lives one level above `backend/` (project-root/ml, project-root/backend).
# Relying on the PYTHONPATH environment variable to include the project root
# is fragile -- it only applies to the exact terminal session where it was
# set, so `uvicorn` started from a different terminal silently loses it and
# process_sar_scene import fails again. Adding the project root to sys.path
# here, at import time, makes the `ml` package importable no matter which
# terminal/IDE run-config starts the app.
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

try:
    from ml.day1_inference import process_sar_scene
except ImportError:
    process_sar_scene = None

# Directory that main.py mounts at the "/artifacts" URL prefix via
# StaticFiles. ml/day1_inference.py writes files here (see main.py's mount
# comment for the exact path). Any artifact path returned by the detector
# gets rewritten to "/artifacts/<filename>" so the frontend can actually
# fetch it over HTTP instead of receiving a server-local filesystem path.
_ARTIFACTS_DIR_NAME = "day1_output_results"


def _to_artifact_url(path: str | None) -> str | None:
    """Convert a detector-returned filesystem path into a fetchable URL.

    ml/day1_inference.py returns paths like
    "./day1_output_results/<scene_id>_pytorch_mask.tif" (or an absolute/
    Windows-style equivalent). Since every artifact lands directly inside
    that one folder with no subfolders, taking just the filename and
    prefixing it with "/artifacts/" is enough to make it resolvable
    against the StaticFiles mount in main.py.
    """
    if not path:
        return None

    normalized = str(path).replace("\\", "/")
    filename = normalized.rsplit("/", 1)[-1]
    return f"/artifacts/{filename}" if filename else None


class DetectorService:
    def run(self, file_path: str, scene_id: str) -> dict[str, Any]:
        path = Path(file_path)

        if not path.exists():
            raise ValueError(("ERR_INVALID_FILE", "Input file does not exist."))

        if path.suffix.lower() not in {".tif", ".tiff"}:
            raise ValueError(("ERR_INVALID_FILE", "Expected a GeoTIFF input file."))

        if process_sar_scene is None:
            raise RuntimeError(("ERR_DETECTOR_IMPORT", "Could not import process_sar_scene from sar_inference.py."))

        result = process_sar_scene(file_path=str(path), scene_id=scene_id)

        if not isinstance(result, dict):
            raise RuntimeError(("ERR_DETECTOR_RESPONSE", "Detector returned a non-dictionary response."))

        return result

    def normalize(self, raw: dict[str, Any]) -> dict[str, Any]:
        artifacts = raw.get("artifacts", {}) or {}
        metadata = artifacts.get("metadata", {}) or raw.get("metadata", {}) or {}

        oil_mask_path = artifacts.get("oil_mask") or artifacts.get("final_oil_mask")
        probability_map_path = artifacts.get("probability_map") or artifacts.get("prob_heatmap")
        geojson_path = artifacts.get("geojson") or artifacts.get("slick_geojson")

        return {
            "status": str(raw.get("status", "COMPLETED")).upper(),
            "message": raw.get("message", "Detection completed."),
            "artifacts": {
                "oil_mask": _to_artifact_url(oil_mask_path),
                "probability_map": _to_artifact_url(probability_map_path),
                "geojson": _to_artifact_url(geojson_path),
                "metadata_path": _to_artifact_url(artifacts.get("metadata_path")),
            },
            # Kept alongside the web-facing artifacts above: some backend
            # routes (spills.py's demo /detect endpoint) need the real
            # on-disk path to open and read the file server-side, which
            # the "/artifacts/..." URL above can't be used for directly.
            "_artifact_paths": {
                "oil_mask": oil_mask_path,
                "probability_map": probability_map_path,
                "geojson": geojson_path,
            },
            "metadata": {
                "detector_name": metadata.get("detector_name", "SpillTrace DeepLabV3+ Engine"),
                "model_name": metadata.get("model_name", "ResNet-50 DeepLabV3+"),
                "checkpoint": metadata.get("checkpoint", "oil_spill_seg_resnet_50_deeplab_v3+_80.pt"),
                "class_mapping": CLASS_MAPPING,
                "oil_class_index": metadata.get("oil_class_index", 1),
                "probability_threshold": metadata.get("probability_threshold", 0.30),
                "output_crs": metadata.get("output_crs", "EPSG:4326"),
                "fallback_used": metadata.get("fallback_used", False),
                "fallback_reason": metadata.get("fallback_reason"),
                "total_slicks_detected": metadata.get("total_slicks_detected"),
                "pixel_count_after_cleanup": metadata.get("pixel_count_after_cleanup"),
                "centroid": metadata.get("centroid"),
                "extra": metadata,
            },
            "error": raw.get("error"),
        }


detector_service = DetectorService()
