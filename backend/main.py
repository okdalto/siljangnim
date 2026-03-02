"""
siljangnim Backend — FastAPI + WebSocket server.
Rendering is done client-side via WebGL2. Backend manages Claude Agent SDK agent and state.
"""

import base64
import json
import logging
import re
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import workspace
from workspace import DEFAULT_SCENE_JSON, DEFAULT_UI_CONFIG
import config
import agents
import projects
from ws_handlers import WsContext, HANDLERS


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    ctx.api_key = config.load_api_key()

    workspace.init_workspace()
    agents.load_conversations()

    existing = workspace.list_files()
    if "scene.json" not in existing:
        workspace.write_json("scene.json", DEFAULT_SCENE_JSON)
    if "ui_config.json" not in existing:
        workspace.write_json("ui_config.json", DEFAULT_UI_CONFIG)

    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="siljangnim", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Connection manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: dict):
        data = json.dumps(message)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)


manager = ConnectionManager()

# Shared WebSocket context (replaces module-level globals)
ctx = WsContext(manager=manager)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/workspace/files")
async def get_workspace_files():
    return {"files": workspace.list_files_detailed()}


@app.get("/api/workspace/{filename:path}")
async def get_workspace_file(filename: str):
    try:
        content = workspace.read_file(filename)
        try:
            return {"filename": filename, "content": json.loads(content)}
        except json.JSONDecodeError:
            return {"filename": filename, "content": content}
    except FileNotFoundError:
        return {"error": "not found"}, 404


@app.get("/api/projects/{name}/files")
async def project_files(name: str):
    """List all files inside a saved project."""
    try:
        files = projects.list_project_files(name)
        return {"files": files}
    except (PermissionError, FileNotFoundError):
        return Response(status_code=404)


@app.get("/api/projects/{name}/file/{filepath:path}")
async def project_file(name: str, filepath: str):
    """Serve a single file from a saved project (for preview/download)."""
    import mimetypes
    try:
        path = projects._safe_project_file_path(name, filepath)
        if not path.exists() or not path.is_file():
            return Response(status_code=404)
        mime, _ = mimetypes.guess_type(str(path))
        return Response(
            content=path.read_bytes(),
            media_type=mime or "application/octet-stream",
        )
    except (PermissionError, FileNotFoundError):
        return Response(status_code=404)


@app.delete("/api/workspace/files/{filepath:path}")
async def delete_workspace_file(filepath: str):
    """Delete a file from the workspace."""
    try:
        workspace.delete_file(filepath)
        return {"ok": True}
    except (PermissionError, FileNotFoundError) as e:
        return Response(status_code=404, content=str(e))


@app.get("/api/projects/{name}/thumbnail")
async def project_thumbnail(name: str):
    """Serve a project's saved thumbnail."""
    try:
        project_dir = projects._safe_project_path(name)
        thumb = project_dir / "thumbnail.jpg"
        if thumb.exists():
            return Response(content=thumb.read_bytes(), media_type="image/jpeg")
        return Response(status_code=404)
    except (PermissionError, FileNotFoundError):
        return Response(status_code=404)


@app.get("/api/projects/{name}/scene")
async def project_scene(name: str):
    """Peek at a project's scene.json without loading the project."""
    try:
        project_dir = projects._safe_project_path(name)
        scene_path = project_dir / "scene.json"
        if scene_path.exists():
            return json.loads(scene_path.read_text(encoding="utf-8"))
        return Response(status_code=404)
    except (PermissionError, FileNotFoundError):
        return Response(status_code=404)


# ---------------------------------------------------------------------------
# Debug / Admin endpoints
# ---------------------------------------------------------------------------

@app.get("/api/debug/state")
async def debug_state():
    """Server-wide state summary for debugging."""
    conversations = agents.get_debug_conversations()
    return {
        "api_key_set": ctx.api_key is not None,
        "global_agent_busy": ctx.agent_busy,
        "active_connections": len(manager.active),
        "agent_ws_id": ctx.AGENT_WS_ID,
        "chat_history_length": len(ctx.chat_history),
        "conversation_count": len(conversations),
        "conversation_lengths": {str(k): len(v) for k, v in conversations.items()},
        "workspace_files": workspace.list_files(),
        "uploads": workspace.list_uploads(),
    }


@app.get("/api/debug/chat-history")
async def debug_chat_history():
    """Return the full chat history."""
    return {
        "count": len(ctx.chat_history),
        "messages": ctx.chat_history,
    }


@app.get("/api/debug/conversations")
async def debug_conversations():
    """Return all agent conversation histories (truncated)."""
    conversations = agents.get_debug_conversations()
    return {
        "count": len(conversations),
        "conversations": {str(k): v for k, v in conversations.items()},
    }


@app.get("/api/debug/conversations/{ws_id}")
async def debug_conversation(ws_id: int):
    """Return a specific WebSocket's full conversation history."""
    convs = agents.get_debug_conversations(max_content_len=10000)
    if ws_id not in convs:
        return {"error": "not found", "available_ws_ids": [str(k) for k in convs]}
    return {
        "ws_id": str(ws_id),
        "message_count": len(convs[ws_id]),
        "messages": convs[ws_id],
    }


@app.get("/api/debug/scene")
async def debug_scene():
    """Return the current scene.json content."""
    try:
        return workspace.read_json("scene.json")
    except FileNotFoundError:
        return {"error": "no scene.json"}


@app.get("/api/debug/ui-config")
async def debug_ui_config():
    """Return the current ui_config.json content."""
    try:
        return workspace.read_json("ui_config.json")
    except FileNotFoundError:
        return {"error": "no ui_config.json"}


@app.get("/api/uploads/{filename:path}")
async def get_upload(filename: str):
    """Serve an uploaded file (textures, models, etc.)."""
    try:
        data = workspace.read_upload(filename)
        info = workspace.get_upload_info(filename)
        return Response(content=data, media_type=info["mime_type"])
    except (FileNotFoundError, PermissionError):
        return Response(status_code=404)


# ---------------------------------------------------------------------------
# Upload helpers
# ---------------------------------------------------------------------------

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


def _sanitize_filename(name: str) -> str:
    """Sanitize a filename — keep alphanumeric, dots, hyphens, underscores."""
    name = name.strip().replace(" ", "_")
    name = re.sub(r"[^\w.\-]", "", name)
    return name or "unnamed"


def _process_uploads(raw_files: list[dict]) -> list[dict]:
    """Decode base64 file data, save to uploads dir, return saved file info."""
    saved = []
    for f in raw_files:
        name = _sanitize_filename(f.get("name", "unnamed"))
        mime = f.get("mime_type", "application/octet-stream")
        data_b64 = f.get("data_b64", "")
        size = f.get("size", 0)

        if size > MAX_UPLOAD_SIZE:
            raise ValueError(f"File '{name}' exceeds 10 MB limit ({size} bytes)")

        raw_bytes = base64.b64decode(data_b64)
        workspace.save_upload(name, raw_bytes)
        saved.append({
            "name": name,
            "mime_type": mime,
            "size": len(raw_bytes),
            "data_b64": data_b64,
        })
    return saved


# ---------------------------------------------------------------------------
# Asset processing pipeline
# ---------------------------------------------------------------------------

async def _process_uploaded_files(saved_files: list[dict], broadcast):
    """Run asset processing pipeline for uploaded files before agent starts."""
    from processors import run_pipeline

    for f in saved_files:
        source_path = workspace._safe_upload_path(f["name"])
        output_dir = workspace.get_processed_dir(f["name"])
        logger.info("[AssetPipeline] Processing %s → %s", f["name"], output_dir)

        async def on_status(status: str, detail: str, _fname=f["name"]):
            await broadcast({
                "type": "processing_status",
                "filename": _fname,
                "status": status,
                "detail": detail,
            })

        try:
            result = await run_pipeline(source_path, output_dir, f["name"], on_status)
            if result:
                logger.info("[AssetPipeline] %s → %s (outputs: %s, warnings: %s)",
                            f["name"], result.status,
                            [o.filename for o in result.outputs], result.warnings)
            else:
                logger.info("[AssetPipeline] %s → no matching processor", f["name"])
        except Exception as e:
            import traceback
            logger.error("[AssetPipeline] %s failed: %s", f["name"], e)
            traceback.print_exc()
            continue

        if result and result.status in ("success", "partial"):
            stem = workspace.get_processed_dir(f["name"]).name
            await broadcast({
                "type": "processing_complete",
                "filename": f["name"],
                "processor": result.processor_name,
                "outputs": [
                    {
                        "filename": o.filename,
                        "description": o.description,
                        "url": f"/api/uploads/processed/{stem}/{o.filename}",
                    }
                    for o in result.outputs
                ],
                "metadata": result.metadata,
            })


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)

    # Send initial state
    try:
        scene_json = workspace.read_json("scene.json")
    except FileNotFoundError:
        scene_json = DEFAULT_SCENE_JSON

    try:
        ui_config = workspace.read_json("ui_config.json")
    except FileNotFoundError:
        ui_config = DEFAULT_UI_CONFIG

    try:
        workspace_state = workspace.read_json("workspace_state.json")
    except FileNotFoundError:
        workspace_state = {}

    try:
        panels = workspace.read_json("panels.json")
    except FileNotFoundError:
        panels = {}

    await ws.send_text(json.dumps({
        "type": "init",
        "scene_json": scene_json,
        "ui_config": ui_config,
        "projects": projects.list_projects(),
        "is_processing": ctx.agent_busy,
        "chat_history": ctx.chat_history,
        "workspace_state": workspace_state,
        "panels": panels,
    }))

    if not ctx.api_key:
        await ws.send_text(json.dumps({"type": "api_key_required"}))

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            handler = HANDLERS.get(msg_type)
            if handler:
                await handler(ws, msg, ctx)

    except (WebSocketDisconnect, RuntimeError):
        try:
            manager.disconnect(ws)
        except ValueError:
            pass
