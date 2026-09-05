from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def valid_payload() -> dict:
    return {
        "report_id": "report-day9-001",
        "title": "SpillTrace Investigation Report",
        "status": "complete",
        "data_mode": "real",
        "spill_id": "spill-001",
        "scene_id": "sar-001",
        "detector": {
            "name": "DeepLabV3",
            "model_status": "verified",
            "oil_class_index": 1,
            "probability_threshold": 0.4,
            "fallback_used": False,
        },
        "geometry": {
            "geometry_type": "MultiPolygon",
            "centroid": [72.9, 19.1],
            "area_km2": 2.4,
            "perimeter_m": 8120.0,
            "polygon_count": 2,
        },
        "drift": {
            "mode": "data-backed",
            "run_id": "drift-001",
            "origin_time_window": "2026-08-01T00:00:00Z/2026-08-02T00:00:00Z",
            "forecast_horizon": "24h",
            "timestep_minutes": 30,
            "particle_count": 500,
            "uncertainty_radius_m": 1200.0,
            "assumptions": ["Wind direction is interpreted as direction FROM."],
        },
        "compatibility": {
            "compatible": True,
            "status_code": "COMPATIBLE",
            "reasons": ["SAR and AIS windows overlap."],
            "sar_time_window": "2026-08-01T00:00:00Z/2026-08-01T06:00:00Z",
            "ais_time_window": "2026-08-01T00:00:00Z/2026-08-01T12:00:00Z",
            "geographic_overlap": True,
            "crs_valid": True,
            "environmental_coverage": True,
        },
        "sources": [
            {
                "source_id": "sar-source-001",
                "source_type": "SAR",
                "label": "Selected Sentinel-1 scene",
                "provenance": "Local verified scene manifest",
            }
        ],
        "candidates": [
            {
                "candidate_id": "candidate-001",
                "vessel_name": "Example Vessel",
                "mmsi": "123456789",
                "rank": 1,
                "score": 0.81,
                "score_contributions": {
                    "spatial": 0.25,
                    "temporal": 0.20,
                    "continuity": 0.12,
                },
                "evidence": ["Track intersects the drift corridor."],
                "ais_quality": {"completeness": 0.92},
                "source_ids": ["ais-source-001"],
            }
        ],
        "limitations": [
            "The detector may confuse oil and look-alike signatures."
        ],
    }


def test_compact_investigation_report():
    response = client.post(
        "/api/v1/reports/investigation",
        json=valid_payload(),
    )

    assert response.status_code == 200
    body = response.json()

    assert body["report_id"] == "report-day9-001"
    assert body["status"] == "complete"
    assert body["compatibility"]["compatible"] is True
    assert len(body["candidates"]) == 1


def test_html_report_is_generated():
    response = client.post(
        "/api/v1/reports/investigation/html",
        json=valid_payload(),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "SpillTrace Investigation Report" in response.text
    assert "Example Vessel" in response.text
    assert "Candidate attribution blocked" not in response.text


def test_incompatible_report_blocks_candidates():
    payload = valid_payload()
    payload["compatibility"] = {
        "compatible": False,
        "status_code": "TEMPORAL_MISMATCH",
        "reasons": ["AIS records do not overlap the SAR time window."],
        "geographic_overlap": True,
        "crs_valid": True,
        "environmental_coverage": True,
    }

    response = client.post(
        "/api/v1/reports/investigation",
        json=payload,
    )

    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "blocked"
    assert body["candidates"] == []


def test_invalid_report_payload_returns_422():
    payload = valid_payload()
    del payload["compatibility"]

    response = client.post(
        "/api/v1/reports/investigation",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_REPORT_PAYLOAD"


def test_analyst_mode_is_visible():
    payload = valid_payload()
    payload["data_mode"] = "analyst_parameter_driven"

    response = client.post(
        "/api/v1/reports/investigation",
        json=payload,
    )

    assert response.status_code == 200
    body = response.json()

    assert any(
        "analyst-parameter-driven" in warning
        for warning in body["warnings"]
    )