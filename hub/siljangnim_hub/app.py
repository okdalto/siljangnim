"""HTTP surface of the hub.

The hub binds to 127.0.0.1 only and every request must carry the per-launch
token the desktop shell generated. The token is what keeps other local
processes and web pages from driving the hub; the Host check closes off DNS
rebinding as a second line.
"""

from __future__ import annotations

import hmac
import json
import math
import os
import shutil
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from . import __version__, system
from .osc import OscListener
from .recipes import Recipes
from .runtime import Job, Runtime, RuntimeErrorWithHint, programs

# Origins the desktop renderer runs under (packaged app / dev server). The
# MCP bridge adds its viewer origin through SILJANGNIM_HUB_ORIGINS.
RENDERER_ORIGINS = ["app://siljangnim", "http://localhost:5173", "http://127.0.0.1:5173"]

# Native tools the agent may use when they're installed (D grade).
KNOWN_PROGRAMS = ["ffmpeg", "ffprobe", "blender", "openscad", "magick", "inkscape", "vpype", "potrace"]

MAX_WAIT_S = 60
# The OSC stream sends a comment this often so a dead connection is noticed.
OSC_PING_S = 15


def create_app(token: str, port: int, runtime: Runtime | None = None, recipes: Recipes | None = None, osc: OscListener | None = None) -> FastAPI:
    if not token:
        raise ValueError("hub token must not be empty")
    if runtime is None:
        runtime = default_runtime()
    if recipes is None:
        recipes = default_recipes()
    if osc is None:
        osc = OscListener()

    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    app = FastAPI(title="siljangnim-hub", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def require_token(request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        if request.headers.get("host") not in allowed_hosts:
            return JSONResponse({"error": "forbidden host"}, status_code=403)
        auth = request.headers.get("authorization", "")
        supplied = auth.removeprefix("Bearer ").strip()
        if not hmac.compare_digest(supplied.encode(), token.encode()):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)

    # Added after the token middleware so it wraps it and answers preflights.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=RENDERER_ORIGINS + [o for o in os.environ.get("SILJANGNIM_HUB_ORIGINS", "").split(",") if o],
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health():
        return {"ok": True, "version": __version__}

    @app.get("/system")
    def system_info():
        return system.detect().to_dict()

    # --- runtime: environments and jobs (see runtime.py) ---

    def unavailable() -> JSONResponse:
        return JSONResponse({"error": "the runtime is unavailable: uv was not found (set SILJANGNIM_UV)"}, status_code=503)

    def find(job_id: str) -> Job | None:
        return runtime.jobs.get(job_id) if runtime else None

    @app.exception_handler(RuntimeErrorWithHint)
    async def hint(_request: Request, err: RuntimeErrorWithHint):
        return JSONResponse({"error": str(err)}, status_code=400)

    @app.get("/runtime")
    def runtime_info():
        if not runtime:
            return unavailable()
        return {"environments": runtime.environments(), "programs": programs(KNOWN_PROGRAMS)}

    @app.post("/jobs", status_code=201)
    async def create_job(request: Request):
        if not runtime:
            return unavailable()
        body = await request.json()
        job = runtime.create_job(
            body.get("kind", "python"),
            packages=body.get("packages") or [],
            code=body.get("code") or "",
            argv=body.get("argv") or [],
            timeout_s=body.get("timeout_s") or 120,
        )
        return job.to_dict()

    @app.put("/jobs/{job_id}/inputs/{name}")
    async def add_input(job_id: str, name: str, request: Request):
        job = find(job_id)
        if not job:
            return JSONResponse({"error": "no such job"}, status_code=404)
        runtime.add_input(job, name, await request.body())
        return {"ok": True}

    # async: the job queue lives on the server's event loop.
    @app.post("/jobs/{job_id}/start")
    async def start(job_id: str):
        job = find(job_id)
        if not job:
            return JSONResponse({"error": "no such job"}, status_code=404)
        runtime.start(job)
        return job.to_dict()

    @app.get("/jobs/{job_id}")
    async def get_job(job_id: str, wait: float = 0):
        job = find(job_id)
        if not job:
            return JSONResponse({"error": "no such job"}, status_code=404)
        if wait > 0:
            await runtime.wait(job, min(wait, MAX_WAIT_S))
        return job.to_dict()

    @app.post("/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        job = find(job_id)
        if not job:
            return JSONResponse({"error": "no such job"}, status_code=404)
        runtime.cancel(job)
        return job.to_dict()

    @app.get("/jobs/{job_id}/outputs/{name}")
    def output(job_id: str, name: str):
        job = find(job_id)
        if not job:
            return JSONResponse({"error": "no such job"}, status_code=404)
        return FileResponse(runtime.output_path(job, name))

    # --- recipes (see recipes.py) ---

    @app.get("/recipes")
    def recipe_search(q: str = ""):
        return {"platform": recipes.platform, "recipes": recipes.search(q)}

    @app.post("/recipes/import")
    async def recipe_import(request: Request):
        body = await request.json()
        recipe = recipes.import_text(str(body.get("text") or ""))
        return {"summary": recipe["summary"], "kept": recipe["kept"]}

    @app.get("/recipes/{recipe_id}")
    def recipe_get(recipe_id: str):
        recipe = recipes.get(recipe_id)
        return {k: recipe[k] for k in ("meta", "summary", "code", "argv", "setup", "verify", "notes", "text")}

    @app.put("/recipes/{recipe_id}")
    async def recipe_save(recipe_id: str, request: Request):
        fields = await request.json()
        recipe = recipes.save({**fields, "id": recipe_id})
        return {"summary": recipe["summary"], "text": recipe["text"]}

    @app.post("/recipes/{recipe_id}/status")
    async def recipe_status(recipe_id: str, request: Request):
        body = await request.json()
        return {"summary": recipes.set_status(recipe_id, body.get("status", ""), body.get("log", ""))["summary"]}

    # --- OSC input (see osc.py) ---

    @app.get("/osc")
    def osc_status():
        return osc.status()

    @app.post("/osc/listen")
    async def osc_listen(request: Request):
        body = await request.json()
        return await osc.listen(int(body.get("port") or 0))

    @app.post("/osc/stop")
    def osc_stop():
        osc.close()
        return osc.status()

    @app.get("/osc/stream")
    async def osc_stream():
        """Server-sent events: each data line is a JSON array of [address, args]."""
        queue = osc.subscribe()

        async def events():
            try:
                yield ": connected\n\n"
                while True:
                    batch = await osc.batch(queue, OSC_PING_S)
                    if not batch:
                        yield ": ping\n\n"
                        continue
                    yield f"data: {json.dumps([[a, [_finite(v) for v in args]] for a, args in batch], allow_nan=False)}\n\n"
            finally:
                osc.unsubscribe(queue)

        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    return app


def _finite(value):
    """JSON has no NaN or Infinity."""
    return None if isinstance(value, float) and not math.isfinite(value) else value


def default_recipes() -> Recipes:
    """Recipes under SILJANGNIM_RECIPES_DIR (default ~/Siljangnim/recipes), for this platform."""
    root = Path(os.environ.get("SILJANGNIM_RECIPES_DIR") or Path.home() / "Siljangnim" / "recipes")
    return Recipes(root, system.platform_key())


def default_runtime() -> Runtime | None:
    """Runtime under SILJANGNIM_RUNTIME_DIR using the uv at SILJANGNIM_UV (or on PATH)."""
    uv = os.environ.get("SILJANGNIM_UV") or shutil.which("uv")
    if not uv:
        return None
    root = Path(os.environ.get("SILJANGNIM_RUNTIME_DIR") or Path.home() / ".siljangnim" / "runtime")
    return Runtime(root, uv)
