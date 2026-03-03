"""
siljangnim Backend — FastAPI + WebSocket server.
Rendering is done client-side via WebGL2. Backend manages Claude Agent SDK agent and state.
"""

import json
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
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
    ctx.api_key = config.load_config()

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


@app.get("/api/projects/{name}/export")
async def export_project(name: str):
    """Export a project as a ZIP file download."""
    try:
        zip_bytes = projects.export_project_zip(name)
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{name}.zip"'},
        )
    except (PermissionError, FileNotFoundError):
        return Response(status_code=404)


@app.post("/api/projects/import")
async def import_project(file: UploadFile):
    """Import a project from an uploaded ZIP file."""
    try:
        zip_bytes = await file.read()
        meta = projects.import_project_zip(zip_bytes)
        return meta
    except ValueError as e:
        return Response(status_code=400, content=str(e))
    except Exception as e:
        logger.error("Import failed: %s", e)
        return Response(status_code=500, content=str(e))


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

    panels = workspace.ensure_default_panels(ui_config)

    # Resolve active project meta (null for _untitled)
    active_project_meta = None
    active_name = workspace.get_active_project_name()
    if active_name and active_name != "_untitled":
        try:
            meta_path = workspace.get_workspace_dir() / "meta.json"
            if meta_path.exists():
                active_project_meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    try:
        api_config = config.get_saved_config()
    except Exception:
        logger.exception("get_saved_config failed")
        api_config = None

    await ws.send_text(json.dumps({
        "type": "init",
        "scene_json": scene_json,
        "ui_config": ui_config,
        "projects": projects.list_projects(),
        "is_processing": ctx.agent_busy,
        "chat_history": ctx.chat_history,
        "workspace_state": workspace_state,
        "panels": panels,
        "active_project": active_project_meta,
        "api_config": api_config,
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
