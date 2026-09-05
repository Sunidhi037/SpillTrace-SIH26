from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_core_system_and_candidate_flow():
    health = client.get("/health")
    assert health.status_code == 200

    request = {
        "compatibility": {
            "compatible": True,
            "status": "passed",
            "temporal_overlap": True,
            "geographic_overlap": True,
            "crs_valid": True,
            "environmental_coverage": True,
            "reasons": [],
        },
        "drift_evidence": {
            "run_id": "hindcast_day8_001",
            "run_type": "hindcast",
            "mode": "data_backed",
            "corridor_reference": "origin_corridor.geojson",
            "uncertainty_radius_m": 800,
            "assumptions": [],
        },
        "candidates": [
            {
                "candidate_id": "candidate_day8_001",
                "mmsi": "419001234",
                "vessel_name": "Integration Test Vessel",
                "spatial_score": 0.90,
                "temporal_score": 0.90,
                "heading_score": 0.85,
                "intersection_score": 0.90,
                "continuity_score": 0.90,
                "quality_score": 0.90,
                "distance_to_origin_m": 400,
                "minutes_from_origin": 10,
                "intersects_corridor": True,
                "ais_quality": {
                    "track_continuity": 0.90,
                    "data_completeness": 0.90,
                    "position_count": 100,
                    "gap_count": 1,
                    "source": "integration_test_fixture",
                },
                "source_reference": "integration_test_fixture.json",
                "track_reference": "track_day8_001",
            }
        ],
        "limit": 10,
    }

    ranking = client.post(
        "/api/v1/spills/spill_day8_001/candidates/rank",
        json=request,
    )

    assert ranking.status_code == 200

    payload = ranking.json()
    assert payload["status"] == "completed"
    assert len(payload["candidates"]) == 1
    assert payload["candidates"][0]["mmsi"] == "419001234"


def test_incompatible_candidate_flow_is_blocked():
    request = {
        "compatibility": {
            "compatible": False,
            "status": "blocked",
            "temporal_overlap": False,
            "geographic_overlap": True,
            "crs_valid": True,
            "environmental_coverage": False,
            "reasons": ["Temporal and environmental compatibility failed."],
        },
        "drift_evidence": {
            "run_id": "hindcast_day8_002",
            "run_type": "hindcast",
            "mode": "data_backed",
            "corridor_reference": "origin_corridor.geojson",
            "uncertainty_radius_m": 800,
            "assumptions": [],
        },
        "candidates": [],
        "limit": 10,
    }

    response = client.post(
        "/api/v1/spills/spill_day8_002/candidates/rank",
        json=request,
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "COMPATIBILITY_FAILED"