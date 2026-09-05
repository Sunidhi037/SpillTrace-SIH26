from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200

    payload = response.json()

    assert payload["status"] == "ok"
    assert payload["service"] == "spilltrace-backend"
    assert "timestamp_utc" in payload


def test_readiness_endpoint():
    response = client.get("/ready")

    assert response.status_code == 200

    payload = response.json()

    assert payload["status"] == "ready"
    assert payload["checks"]["application"] == "ok"


def test_request_id_is_returned():
    response = client.get(
        "/health",
        headers={"X-Request-ID": "req_day8_test"},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req_day8_test"


def test_unknown_route_returns_404():
    response = client.get("/route-that-does-not-exist")

    assert response.status_code == 404