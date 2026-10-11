"""Isolated environments and a job queue for running open-source tools.

C grade (Python packages): each distinct package set gets its own venv,
created with uv from a managed Python, so nothing touches the user's own
Python. D grade (native CLIs such as ffmpeg): programs already installed on
the machine, found on PATH.

Every job runs in its own directory: inputs are copied into ``in/``, the
program writes results into ``out/``, and the hub reports those files back.
Jobs run one at a time. This is isolation of files and dependencies, not an
OS sandbox; the app asks the person before code runs (see docs/runtime.md).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import shutil
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

# Plain requirement specifiers only: name, optional extras, optional version
# constraints. No URLs, paths or pip options, so a spec can't redirect the
# install or inject flags.
_SPEC = re.compile(
    r"^[A-Za-z0-9][A-Za-z0-9._-]*"  # name
    r"(\[[A-Za-z0-9._,-]+\])?"  # extras
    r"((==|>=|<=|~=|!=|>|<)[A-Za-z0-9.*+!-]+(,(==|>=|<=|~=|!=|>|<)[A-Za-z0-9.*+!-]+)*)?$"
)
_FILE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$")

MAX_PACKAGES = 30
MAX_LOG_CHARS = 20_000
MAX_OUTPUT_FILES = 50
MAX_OUTPUT_BYTES = 200 * 1024 * 1024
DEFAULT_TIMEOUT_S = 120
MAX_TIMEOUT_S = 1800
INSTALL_TIMEOUT_S = 900


class RuntimeErrorWithHint(Exception):
    """A failure whose message is meant for the agent as is."""


def validate_packages(packages: list[str]) -> list[str]:
    if len(packages) > MAX_PACKAGES:
        raise RuntimeErrorWithHint(f"at most {MAX_PACKAGES} packages per environment")
    cleaned = []
    for spec in packages:
        s = spec.strip().replace(" ", "")
        if not _SPEC.match(s):
            raise RuntimeErrorWithHint(
                f'"{spec}" is not a plain package spec; use names like "trimesh" or "trimesh==4.5.3" (no URLs, paths or options)'
            )
        cleaned.append(s)
    return sorted(set(cleaned), key=str.lower)


def validate_file_name(name: str) -> str:
    if not _FILE_NAME.match(name) or name in {".", ".."}:
        raise RuntimeErrorWithHint(f'"{name}" is not a plain file name')
    return name


def env_key(packages: list[str]) -> str:
    return hashlib.sha256("\n".join(packages).encode()).hexdigest()[:16]


def _venv_python(venv: Path) -> Path:
    return venv / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def _job_env() -> dict[str, str]:
    """A small environment for jobs: no hub token, no app secrets."""
    keep = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"]
    env = {k: os.environ[k] for k in keep if k in os.environ}
    env.update({"PYTHONUNBUFFERED": "1", "PYTHONDONTWRITEBYTECODE": "1", "MPLBACKEND": "Agg"})
    return env


LIST_LOG_CHARS = 2000


@dataclass
class Job:
    id: str
    kind: str  # "python" | "command"
    dir: Path
    packages: list[str] = field(default_factory=list)
    code: str = ""
    argv: list[str] = field(default_factory=list)
    timeout_s: int = DEFAULT_TIMEOUT_S
    # What the job is for, shown in the app's job list (e.g. "recipe trimesh.torus-knot").
    label: str = ""
    state: str = "created"  # created | queued | installing | running | done | failed | cancelled
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    exit_code: int | None = None
    error: str | None = None
    log: str = ""
    outputs: list[dict] = field(default_factory=list)
    resolved: list[str] = field(default_factory=list)
    process: asyncio.subprocess.Process | None = None
    done: asyncio.Event = field(default_factory=asyncio.Event)

    def append_log(self, text: str) -> None:
        self.log = (self.log + text)[-MAX_LOG_CHARS:]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "state": self.state,
            "packages": self.packages,
            "argv": self.argv,
            "exit_code": self.exit_code,
            "error": self.error,
            "log": self.log,
            "outputs": self.outputs,
            "resolved": self.resolved,
            "seconds": round((self.finished_at or time.time()) - self.created_at, 2),
            "label": self.label,
            "created_at": self.created_at,
        }


class Runtime:
    def __init__(self, root: Path, uv: str, python: str = "3.12"):
        self.root = root
        self.uv = uv
        self.python = python
        self.jobs: dict[str, Job] = {}
        self._env_locks: dict[str, asyncio.Lock] = {}
        self._queue: asyncio.Queue[Job] | None = None
        self._worker: asyncio.Task | None = None
        (root / "envs").mkdir(parents=True, exist_ok=True)
        (root / "jobs").mkdir(parents=True, exist_ok=True)

    # --- environments ---

    def environments(self) -> list[dict]:
        out = []
        for meta in sorted((self.root / "envs").glob("*/env.json")):
            try:
                out.append(json.loads(meta.read_text()))
            except (OSError, ValueError):
                continue
        return out

    async def ensure_env(self, packages: list[str], job: Job | None = None) -> Path:
        key = env_key(packages)
        venv = self.root / "envs" / key
        lock = self._env_locks.setdefault(key, asyncio.Lock())
        async with lock:
            if (venv / "env.json").exists():
                return venv
            if job:
                job.state = "installing"
            shutil.rmtree(venv, ignore_errors=True)
            env = {**os.environ, "UV_PYTHON_PREFERENCE": "only-managed"}
            await self._run_uv(["venv", "--python", self.python, "--quiet", str(venv)], env, job)
            if packages:
                await self._run_uv(["pip", "install", "--python", str(_venv_python(venv)), *packages], env, job)
            freeze = await self._capture([self.uv, "pip", "freeze", "--python", str(_venv_python(venv))], env)
            meta = {"key": key, "packages": packages, "resolved": freeze.split(), "created_at": time.time()}
            (venv / "env.json").write_text(json.dumps(meta, indent=2))
            return venv

    async def _run_uv(self, args: list[str], env: dict, job: Job | None) -> None:
        proc = await asyncio.create_subprocess_exec(
            self.uv, *args, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
        )
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), INSTALL_TIMEOUT_S)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeErrorWithHint(f"installing took longer than {INSTALL_TIMEOUT_S}s") from None
        text = out.decode(errors="replace")
        if job:
            job.append_log(text)
        if proc.returncode != 0:
            # uv explains resolution failures well; pass its last lines on.
            tail = "\n".join(text.strip().splitlines()[-15:])
            raise RuntimeErrorWithHint(f"installing failed:\n{tail}")

    async def _capture(self, argv: list[str], env: dict) -> str:
        proc = await asyncio.create_subprocess_exec(*argv, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        out, _ = await proc.communicate()
        return out.decode(errors="replace")

    # --- jobs ---

    def create_job(self, kind: str, *, packages: list[str] | None = None, code: str = "", argv: list[str] | None = None, timeout_s: int = DEFAULT_TIMEOUT_S, label: str = "") -> Job:
        if kind not in {"python", "command"}:
            raise RuntimeErrorWithHint(f'unknown job kind "{kind}"')
        timeout_s = max(1, min(int(timeout_s), MAX_TIMEOUT_S))
        job_id = uuid.uuid4().hex[:12]
        job_dir = self.root / "jobs" / job_id
        (job_dir / "in").mkdir(parents=True)
        (job_dir / "out").mkdir()
        job = Job(id=job_id, kind=kind, dir=job_dir, timeout_s=timeout_s, label=str(label)[:120])
        if kind == "python":
            job.packages = validate_packages(packages or [])
            if not code.strip():
                raise RuntimeErrorWithHint("code is empty")
            job.code = code
            (job_dir / "main.py").write_text(code, encoding="utf-8")
        else:
            if not argv:
                raise RuntimeErrorWithHint("argv is empty")
            program = shutil.which(argv[0])
            if not program:
                raise RuntimeErrorWithHint(f'"{argv[0]}" is not installed on this computer (not found on PATH). Ask the person to install it, or use a Python package that bundles it.')
            job.argv = [program, *argv[1:]]
        self.jobs[job_id] = job
        return job

    def list_jobs(self, limit: int = 50) -> list[dict]:
        """Newest first, with only the end of each log."""
        jobs = sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)[:limit]
        return [{**j.to_dict(), "log": j.log[-LIST_LOG_CHARS:]} for j in jobs]

    def add_input(self, job: Job, name: str, data: bytes) -> None:
        if job.state != "created":
            raise RuntimeErrorWithHint("inputs can only be added before the job starts")
        (job.dir / "in" / validate_file_name(name)).write_bytes(data)

    def start(self, job: Job) -> None:
        if job.state != "created":
            return
        if self._queue is None:
            self._queue = asyncio.Queue()
            self._worker = asyncio.create_task(self._work())
        job.state = "queued"
        self._queue.put_nowait(job)

    def cancel(self, job: Job) -> None:
        if job.state in {"created", "queued"}:
            self._finish(job, "cancelled", error="cancelled before it ran")
        elif job.process and job.process.returncode is None:
            job.error = "cancelled"
            job.process.kill()

    async def wait(self, job: Job, timeout_s: float) -> None:
        try:
            await asyncio.wait_for(job.done.wait(), timeout_s)
        except asyncio.TimeoutError:
            pass

    def output_path(self, job: Job, name: str) -> Path:
        path = job.dir / "out" / validate_file_name(name)
        if not path.is_file():
            raise RuntimeErrorWithHint(f'no output "{name}"')
        return path

    async def _work(self) -> None:
        assert self._queue is not None
        while True:
            job = await self._queue.get()
            if job.state == "queued":
                try:
                    await self._run(job)
                except RuntimeErrorWithHint as err:
                    self._finish(job, "failed", error=str(err))
                except Exception as err:  # noqa: BLE001 - reported to the agent, the worker keeps going
                    self._finish(job, "failed", error=f"{type(err).__name__}: {err}")
            self._queue.task_done()

    async def _run(self, job: Job) -> None:
        if job.kind == "python":
            venv = await self.ensure_env(job.packages, job)
            job.resolved = json.loads((venv / "env.json").read_text()).get("resolved", [])
            argv = [str(_venv_python(venv)), "-I", "main.py"]
        else:
            argv = job.argv
        if job.state == "cancelled":
            return
        job.state = "running"
        job.process = await asyncio.create_subprocess_exec(
            *argv, cwd=job.dir, env=_job_env(), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
        )

        async def pump() -> None:
            assert job.process and job.process.stdout
            while chunk := await job.process.stdout.read(4096):
                job.append_log(chunk.decode(errors="replace"))

        try:
            await asyncio.wait_for(asyncio.gather(pump(), job.process.wait()), job.timeout_s)
        except asyncio.TimeoutError:
            job.process.kill()
            await job.process.wait()
            self._finish(job, "failed", error=f"timed out after {job.timeout_s}s (pass a larger timeout_s if it needs longer)")
            return
        job.exit_code = job.process.returncode
        job.outputs = self._collect_outputs(job)
        if job.error == "cancelled":
            self._finish(job, "cancelled", error="cancelled")
        elif job.exit_code == 0:
            self._finish(job, "done")
        else:
            self._finish(job, "failed", error=f"exited with code {job.exit_code}")

    def _collect_outputs(self, job: Job) -> list[dict]:
        outputs = []
        for path in sorted((job.dir / "out").iterdir()):
            if not path.is_file() or not _FILE_NAME.match(path.name):
                continue
            size = path.stat().st_size
            if len(outputs) >= MAX_OUTPUT_FILES or size > MAX_OUTPUT_BYTES:
                job.append_log(f"\n[hub] skipped output {path.name} ({size} bytes; limit {MAX_OUTPUT_FILES} files, {MAX_OUTPUT_BYTES} bytes each)\n")
                continue
            outputs.append({"name": path.name, "size": size})
        return outputs

    def _finish(self, job: Job, state: str, error: str | None = None) -> None:
        job.state = state
        if error:
            job.error = error
        job.finished_at = time.time()
        job.done.set()


def programs(names: list[str]) -> dict[str, str | None]:
    """Where each CLI lives, or None when it's not installed."""
    return {name: shutil.which(name) for name in names}
