"""Runtime tests. They create real venvs with uv (no packages, so no network)."""

import os
import shutil
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from siljangnim_hub.app import create_app
from siljangnim_hub.recipes import Recipes
from siljangnim_hub.runtime import Runtime, RuntimeErrorWithHint, env_key, validate_file_name, validate_packages

TOKEN = "t"
PORT = 47002
UV = os.environ.get("SILJANGNIM_UV") or shutil.which("uv")
needs_uv = pytest.mark.skipif(not UV, reason="uv not available")
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def test_package_specs_are_plain_names():
    assert validate_packages(["Trimesh == 4.5.3", "numpy", "numpy"]) == ["numpy", "Trimesh==4.5.3"]
    assert validate_packages(["shapely[vectorized]>=2,<3"]) == ["shapely[vectorized]>=2,<3"]
    for bad in ["git+https://x/y", "../pkg", "-e .", "--index-url=http://evil", "pkg @ file:///x", "a;b"]:
        with pytest.raises(RuntimeErrorWithHint):
            validate_packages([bad])
    assert env_key(["a", "b"]) == env_key(["a", "b"]) != env_key(["a"])


def test_file_names_cannot_escape():
    assert validate_file_name("mesh 1.obj") == "mesh 1.obj"
    for bad in ["../x", "a/b", "..", ".hidden", "a\\b", ""]:
        with pytest.raises(RuntimeErrorWithHint):
            validate_file_name(bad)


@pytest.fixture
def client(tmp_path: Path):
    runtime = Runtime(tmp_path / "rt", UV)
    app = create_app(token=TOKEN, port=PORT, runtime=runtime, recipes=Recipes(tmp_path / "recipes", "test"))
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as c:
        yield c


def run_job(c: TestClient, body: dict, inputs: dict[str, bytes] | None = None) -> dict:
    res = c.post("/jobs", json=body, headers=AUTH)
    assert res.status_code == 201, res.text
    job = res.json()
    for name, data in (inputs or {}).items():
        assert c.put(f"/jobs/{job['id']}/inputs/{name}", content=data, headers=AUTH).status_code == 200
    c.post(f"/jobs/{job['id']}/start", headers=AUTH)
    deadline = time.time() + 120
    while time.time() < deadline:
        job = c.get(f"/jobs/{job['id']}?wait=10", headers=AUTH).json()
        if job["state"] in {"done", "failed", "cancelled"}:
            return job
    raise AssertionError(f"job did not finish: {job}")


@needs_uv
def test_python_job_reads_inputs_and_returns_outputs(client: TestClient):
    code = "import pathlib, sys\ntext = pathlib.Path('in/name.txt').read_text()\npathlib.Path('out/hello.txt').write_text('hello ' + text)\nprint('isolated', sys.flags.isolated)\n"
    job = run_job(client, {"kind": "python", "packages": [], "code": code}, {"name.txt": b"world"})
    assert job["state"] == "done", job
    assert job["outputs"] == [{"name": "hello.txt", "size": 11}]
    assert "isolated 1" in job["log"]
    assert client.get(f"/jobs/{job['id']}/outputs/hello.txt", headers=AUTH).content == b"hello world"
    envs = client.get("/runtime", headers=AUTH).json()["environments"]
    assert [e["packages"] for e in envs] == [[]]


@needs_uv
def test_failures_come_back_with_the_traceback(client: TestClient):
    job = run_job(client, {"kind": "python", "code": "x = 1\nraise ValueError('bad mesh')\n"})
    assert job["state"] == "failed"
    assert job["exit_code"] == 1
    assert "ValueError: bad mesh" in job["log"]
    assert 'line 2' in job["log"]


@needs_uv
def test_jobs_time_out(client: TestClient):
    job = run_job(client, {"kind": "python", "code": "import time\ntime.sleep(30)\n", "timeout_s": 1})
    assert job["state"] == "failed"
    assert "timed out after 1s" in job["error"]


@needs_uv
def test_jobs_do_not_see_the_hub_token(client: TestClient, monkeypatch):
    monkeypatch.setenv("SILJANGNIM_HUB_TOKEN", "secret-token")
    job = run_job(client, {"kind": "python", "code": "import os\nprint(sorted(k for k in os.environ if 'SILJANGNIM' in k))\n"})
    assert "[]" in job["log"]


def test_command_jobs_need_an_installed_program(client: TestClient):
    res = client.post("/jobs", json={"kind": "command", "argv": ["definitely-not-installed-xyz"]}, headers=AUTH)
    assert res.status_code == 400
    assert "not installed on this computer" in res.json()["error"]


def test_command_job_runs_a_program(client: TestClient):
    job = run_job(client, {"kind": "command", "argv": [Path(sys.executable).name, "-c", "open('out/x.txt','w').write('ok')"]})
    assert job["state"] == "done", job
    assert job["outputs"] == [{"name": "x.txt", "size": 2}]


def test_bad_input_names_and_unknown_jobs(client: TestClient):
    job = client.post("/jobs", json={"kind": "python", "code": "pass"}, headers=AUTH).json()
    assert client.put(f"/jobs/{job['id']}/inputs/..%2Fescape", content=b"x", headers=AUTH).status_code in {400, 404}
    assert client.get("/jobs/nope", headers=AUTH).status_code == 404
    assert client.post("/jobs", json={"kind": "python", "packages": ["git+https://x"], "code": "pass"}, headers=AUTH).status_code == 400


@needs_uv
def test_job_list_is_newest_first_with_labels_and_log_tails(client: TestClient):
    first = run_job(client, {"kind": "python", "code": "print('x' * 5000)", "label": "recipe demo.long"})
    second = run_job(client, {"kind": "python", "code": "print('second')"})
    jobs = client.get("/jobs", headers=AUTH).json()["jobs"]
    assert [j["id"] for j in jobs] == [second["id"], first["id"]]
    assert jobs[1]["label"] == "recipe demo.long"
    assert len(jobs[1]["log"]) <= 2000 and jobs[1]["created_at"] <= jobs[0]["created_at"]
