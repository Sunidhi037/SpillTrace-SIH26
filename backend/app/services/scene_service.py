import json
from pathlib import Path

from app.schemas.contracts import SARSceneMetadata, CompatibilityStatus


TEST1_SCENE_ID = "SPILL_SYNTHETIC_DEMO_TEST1"
REPO_ROOT = Path(__file__).resolve().parents[3]
SYNTHETIC_SCENARIOS_DIR = REPO_ROOT / "ml" / "synthetic_demo_outputs"

# TEST1 is first so a new investigation opens the prepared demonstration
# fixture. It remains visibly labelled and is never represented as real AIS.
SCENE_STORE = {
    TEST1_SCENE_ID: SARSceneMetadata(
        scene_id=TEST1_SCENE_ID,
        source="Synthetic AIS Demonstration Scenario (TEST_FIXTURE)",
        acquisition_start_utc="2026-03-01T04:00:00Z",
        acquisition_end_utc="2026-03-01T14:00:00Z",
        source_crs="EPSG:4326",
        output_crs="EPSG:4326",
        georeferencing_method="synthetic-test-fixture",
        georeferencing_confidence="not independently verified",
    ),
    "scene_demo_001": SARSceneMetadata(
        scene_id="scene_demo_001",
        source="Sentinel-1",
        acquisition_start_utc="2026-09-01T00:00:00Z",
        acquisition_end_utc="2026-09-01T00:10:00Z",
        source_crs="EPSG:4326",
        output_crs="EPSG:4326",
        georeferencing_method="gcp",
        georeferencing_confidence="medium",
    ),
}


def list_scenes():
    scenes = list(SCENE_STORE.values())
    known_ids = {scene.scene_id for scene in scenes}
    for directory in sorted(SYNTHETIC_SCENARIOS_DIR.glob("SPILL_SYNTHETIC_DEMO_*")):
        if directory.name in known_ids or not directory.is_dir():
            continue
        scene = _synthetic_scene(directory.name)
        if scene:
            scenes.append(scene)
    return scenes


def _synthetic_scene(scenario_id: str):
    metadata_path = SYNTHETIC_SCENARIOS_DIR / scenario_id / "sar_input_metadata.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return SARSceneMetadata(
        scene_id=scenario_id,
        source="Synthetic AIS Demonstration Scenario (TEST_FIXTURE)",
        acquisition_start_utc="2026-03-01T04:00:00Z",
        acquisition_end_utc="2026-03-01T14:00:00Z",
        source_crs=metadata.get("raster_crs") or "EPSG:4326",
        output_crs="EPSG:4326",
        georeferencing_method="synthetic-test-fixture",
        georeferencing_confidence="not independently verified",
    )


def get_scene(scene_id: str):
    return SCENE_STORE.get(scene_id) or _synthetic_scene(scene_id)


def get_manifest(scene_id: str):
    scene = get_scene(scene_id)
    if not scene:
        return None

    if scene_id != TEST1_SCENE_ID:
        scenario_dir = SYNTHETIC_SCENARIOS_DIR / scene_id
        return {
            "scene_id": scene_id,
            "scenario_id": scene_id,
            "data_mode": "TEST_FIXTURE",
            "scenario_label": "Synthetic AIS Demonstration Scenario",
            "ais_data_origin": "SYNTHETIC",
            "available_artifacts": [
                f"ml/synthetic_demo_outputs/{scene_id}/slick_geometry.geojson",
                f"ml/synthetic_demo_outputs/{scene_id}/origin_corridor.geojson",
                f"ml/synthetic_demo_outputs/{scene_id}/synthetic_ais_tracks.parquet",
            ],
            "notes": (
                "Synthetic AIS test fixture for an explainable ranking demonstration. "
                "It must not be used to make real-world vessel-attribution claims."
            ),
            "real_world_attribution_claim_allowed": False,
        }

    if scene_id == TEST1_SCENE_ID:
        return {
            "scene_id": scene.scene_id,
            "scenario_id": TEST1_SCENE_ID,
            "data_mode": "TEST_FIXTURE",
            "scenario_label": "Synthetic AIS Demonstration Scenario",
            "ais_data_origin": "SYNTHETIC",
            "available_artifacts": [
                "ml/synthetic_demo_outputs/SPILL_SYNTHETIC_DEMO_TEST1/slick_geometry.geojson",
                "ml/synthetic_demo_outputs/SPILL_SYNTHETIC_DEMO_TEST1/origin_corridor.geojson",
                "ml/synthetic_demo_outputs/SPILL_SYNTHETIC_DEMO_TEST1/synthetic_ais_tracks.parquet",
            ],
            "notes": (
                "Synthetic AIS test fixture for an explainable ranking demonstration. "
                "It must not be used to make real-world vessel-attribution claims."
            ),
            "real_world_attribution_claim_allowed": False,
        }

    return {
        "scene_id": scene.scene_id,
        "available_artifacts": [],
        "notes": "Initial manifest placeholder",
    }


def check_compatibility(scene_id: str):
    scene = get_scene(scene_id)
    if not scene:
        return None

    if scene_id.startswith("SPILL_SYNTHETIC_DEMO_"):
        return CompatibilityStatus(
            compatible=True,
            reasons=[
                "Technical ranking demonstration is enabled for the explicitly selected TEST_FIXTURE.",
                "Synthetic AIS and analyst-parameter-driven drift must remain visibly labelled.",
                "Real-world attribution claims are not permitted for this scenario.",
            ],
            temporal_overlap=True,
            geographic_overlap=True,
            crs_valid=True,
            environmental_coverage=True,
        )

    return CompatibilityStatus(
        compatible=False,
        reasons=["Compatibility inputs not fully integrated yet"],
        temporal_overlap=None,
        geographic_overlap=None,
        crs_valid=True,
        environmental_coverage=None,
    )
