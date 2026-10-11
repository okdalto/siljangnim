from fastapi.testclient import TestClient

from siljangnim_hub import system
from siljangnim_hub.app import create_app

TOKEN = "test-token"
PORT = 47001


def client() -> TestClient:
    return TestClient(create_app(token=TOKEN, port=PORT), base_url=f"http://127.0.0.1:{PORT}")


def auth(token: str = TOKEN) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health_requires_token():
    c = client()
    assert c.get("/health").status_code == 401
    assert c.get("/health", headers=auth("wrong")).status_code == 401
    res = c.get("/health", headers=auth())
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_foreign_host_rejected():
    c = client()
    res = c.get("/health", headers={**auth(), "Host": f"evil.example:{PORT}"})
    assert res.status_code == 403


def test_cors_preflight_allows_renderer_origin():
    c = client()
    res = c.options(
        "/system",
        headers={
            "Origin": "app://siljangnim",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "app://siljangnim"


def test_system_reports_platform_and_cpu_fallback():
    res = client().get("/system", headers=auth())
    assert res.status_code == 200
    info = res.json()
    assert info["platform"] == system.platform_key()
    assert info["accelerators"][-1] == "cpu"


def test_platform_key():
    assert system.platform_key("Darwin", "arm64") == "mac-arm64"
    assert system.platform_key("Windows", "AMD64") == "win-x64"
    assert system.platform_key("Linux", "x86_64") == "linux-x64"


def test_parse_nvidia_smi():
    out = "NVIDIA GeForce RTX 4090, 24564, 560.94\nbad line\n"
    gpus = system.parse_nvidia_smi(out)
    assert len(gpus) == 1
    assert gpus[0].name == "NVIDIA GeForce RTX 4090"
    assert gpus[0].memory_mb == 24564
    assert gpus[0].driver == "560.94"
