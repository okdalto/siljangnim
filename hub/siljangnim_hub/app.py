"""HTTP surface of the hub.

The hub binds to 127.0.0.1 only and every request must carry the per-launch
token the desktop shell generated. The token is what keeps other local
processes and web pages from driving the hub; the Host check closes off DNS
rebinding as a second line.
"""

from __future__ import annotations

import hmac

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__, system

# Origins the desktop renderer runs under (packaged app / dev server).
RENDERER_ORIGINS = ["app://siljangnim", "http://localhost:5173", "http://127.0.0.1:5173"]


def create_app(token: str, port: int) -> FastAPI:
    if not token:
        raise ValueError("hub token must not be empty")

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
        allow_origins=RENDERER_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health():
        return {"ok": True, "version": __version__}

    @app.get("/system")
    def system_info():
        return system.detect().to_dict()

    return app
