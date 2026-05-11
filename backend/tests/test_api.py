"""Basic test for health endpoint and app creation."""

from fastapi.testclient import TestClient

from graspmind.main import create_app


def test_health_check():
    """Health endpoint returns 200 with version info."""
    app = create_app()
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_docs_disabled_in_production(monkeypatch):
    """OpenAPI docs should be disabled when debug=False."""
    monkeypatch.setenv("DEBUG", "false")

    # Clear cached settings so it picks up new env
    from graspmind.config import get_settings
    get_settings.cache_clear()

    app = create_app()
    client = TestClient(app)
    response = client.get("/docs")
    # Should be 404 when debug is False
    assert response.status_code == 404

    # Restore
    get_settings.cache_clear()
