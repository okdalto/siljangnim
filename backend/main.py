"""
siljangnim Backend — FastAPI + WebSocket server.
Rendering is done client-side via WebGL2. Backend manages Claude Agent SDK agent and state.
"""

import json
import logging
import os
import re
import subprocess
import time as _time
from contextlib import asynccontextmanager
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------

def _get_allowed_origins() -> list[str]:
    """Return allowed CORS origins from env or sensible defaults."""
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    # Default: production + localhost dev origins
    return [
        "https://okdalto.github.io",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
    ]

_GIT_BRANCH_RE = re.compile(r"^[a-zA-Z0-9._\-/]+$")

def _is_debug_enabled() -> bool:
    """Debug endpoints are only available when DEBUG=1 is set."""
    return os.environ.get("DEBUG", "").strip() in ("1", "true", "yes")

# Root of the git repository (one level up from backend/)
REPO_ROOT = Path(__file__).resolve().parent.parent

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
    allow_origins=_get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-api-key", "anthropic-version"],
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
        return Response(status_code=404, content="not found")


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
    except (PermissionError, FileNotFoundError):
        return Response(status_code=404, content="File not found")


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
async def export_project(name: str, no_chat: int = 0):
    """Export a project as a ZIP file download."""
    try:
        zip_bytes = projects.export_project_zip(name, exclude_chat=bool(no_chat))
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="' + name.replace('"', '') + '.zip"'},
        )
    except (PermissionError, FileNotFoundError):
        return Response(status_code=404)


MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100MB

@app.post("/api/projects/import")
async def import_project(file: UploadFile):
    """Import a project from an uploaded ZIP file."""
    try:
        zip_bytes = await file.read()
        if len(zip_bytes) > MAX_UPLOAD_SIZE:
            return Response(status_code=413, content="File too large (max 100MB)")
        meta = projects.import_project_zip(zip_bytes)
        return meta
    except ValueError as e:
        logger.info("Import rejected: %s", e)
        return Response(status_code=400, content="Invalid project file")
    except Exception as e:
        logger.error("Import failed: %s", e)
        return Response(status_code=500, content="Import failed")


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
# Local Update endpoints
# ---------------------------------------------------------------------------

def _git(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    """Run a git command in the repo root."""
    return subprocess.run(
        ["git"] + args,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


@app.get("/api/updates/check")
async def check_for_updates():
    """Compare local HEAD with remote origin and report update availability."""
    try:
        # Get local HEAD info
        local = _git(["rev-parse", "HEAD"])
        if local.returncode != 0:
            return {"error": "Not a git repository"}
        local_sha = local.stdout.strip()

        branch = _git(["rev-parse", "--abbrev-ref", "HEAD"])
        branch_name = branch.stdout.strip() if branch.returncode == 0 else "main"
        if not _GIT_BRANCH_RE.match(branch_name):
            return {"error": "Invalid branch name"}

        local_log = _git(["log", "-1", "--format=%H|%s|%ai"])
        parts = local_log.stdout.strip().split("|", 2) if local_log.returncode == 0 else []
        local_message = parts[1] if len(parts) > 1 else ""
        local_date = parts[2] if len(parts) > 2 else ""

        # Fetch remote (non-destructive)
        fetch = _git(["fetch", "origin", branch_name, "--no-tags"], timeout=15)
        if fetch.returncode != 0:
            return {"error": "Cannot reach remote"}

        # Get remote HEAD
        remote = _git(["rev-parse", f"origin/{branch_name}"])
        if remote.returncode != 0:
            return {"error": "Remote branch not found"}
        remote_sha = remote.stdout.strip()

        remote_log = _git(["log", "-1", "--format=%H|%s|%ai", f"origin/{branch_name}"])
        rparts = remote_log.stdout.strip().split("|", 2) if remote_log.returncode == 0 else []
        remote_message = rparts[1] if len(rparts) > 1 else ""
        remote_date = rparts[2] if len(rparts) > 2 else ""

        # Count commits behind/ahead
        behind_ahead = _git(["rev-list", "--left-right", "--count", f"HEAD...origin/{branch_name}"])
        ahead, behind = 0, 0
        if behind_ahead.returncode == 0:
            parts = behind_ahead.stdout.strip().split()
            ahead = int(parts[0]) if len(parts) > 0 else 0
            behind = int(parts[1]) if len(parts) > 1 else 0

        # Check for local changes
        status = _git(["status", "--porcelain"])
        has_local_changes = bool(status.stdout.strip()) if status.returncode == 0 else False

        # Check if fast-forward is possible
        can_ff = False
        if behind > 0 and ahead == 0:
            can_ff = True

        update_available = behind > 0

        return {
            "update_available": update_available,
            "can_fast_forward": can_ff,
            "has_local_changes": has_local_changes,
            "branch": branch_name,
            "local": {"sha": local_sha[:8], "message": local_message, "date": local_date},
            "remote": {"sha": remote_sha[:8], "message": remote_message, "date": remote_date},
            "commits_behind": behind,
            "commits_ahead": ahead,
        }
    except subprocess.TimeoutExpired:
        return {"error": "Network timeout while checking for updates"}
    except Exception as e:
        logger.error("Update check failed: %s", e)
        return {"error": "Failed to check for updates"}


@app.post("/api/updates/apply")
async def apply_update():
    """Perform a fast-forward only pull. Aborts if local changes or conflicts exist."""
    try:
        branch = _git(["rev-parse", "--abbrev-ref", "HEAD"])
        branch_name = branch.stdout.strip() if branch.returncode == 0 else "main"
        if not _GIT_BRANCH_RE.match(branch_name):
            return {"success": False, "error": "Invalid branch name"}

        # Pre-flight: check for local changes
        status = _git(["status", "--porcelain"])
        if status.returncode != 0:
            return {"success": False, "error": "Cannot read git status"}
        if status.stdout.strip():
            return {
                "success": False,
                "error": "Local changes detected. Please commit or stash your changes before updating.",
                "dirty_files": status.stdout.strip().split("\n"),
            }

        # Pre-flight: check if we can ff
        fetch = _git(["fetch", "origin", branch_name, "--no-tags"], timeout=15)
        if fetch.returncode != 0:
            return {"success": False, "error": "Cannot reach remote"}

        behind_ahead = _git(["rev-list", "--left-right", "--count", f"HEAD...origin/{branch_name}"])
        if behind_ahead.returncode == 0:
            parts = behind_ahead.stdout.strip().split()
            ahead = int(parts[0]) if len(parts) > 0 else 0
            if ahead > 0:
                return {
                    "success": False,
                    "error": f"Local branch has {ahead} unpushed commit(s). Cannot fast-forward. Please resolve manually.",
                }

        # Fast-forward only pull
        pull = _git(["pull", "--ff-only", "origin", branch_name], timeout=30)
        if pull.returncode != 0:
            return {
                "success": False,
                "error": "Fast-forward merge failed. Please resolve manually.",
            }

        new_sha = _git(["rev-parse", "--short", "HEAD"])
        new_sha_str = new_sha.stdout.strip() if new_sha.returncode == 0 else "unknown"

        # Check if dependencies changed
        deps_changed = False
        diff_names = _git(["diff", "--name-only", "HEAD~1", "HEAD"])
        changed_files = diff_names.stdout.strip().split("\n") if diff_names.returncode == 0 else []
        dep_files = {"package.json", "package-lock.json", "requirements.txt", "pyproject.toml",
                     "frontend/package.json", "frontend/package-lock.json",
                     "backend/requirements.txt", "backend/pyproject.toml"}
        deps_changed = bool(set(changed_files) & dep_files)

        return {
            "success": True,
            "new_sha": new_sha_str,
            "message": pull.stdout.strip(),
            "needs_dependency_sync": deps_changed,
            "needs_restart": True,
            "changed_files": changed_files,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Network timeout during update"}
    except Exception as e:
        logger.error("Update failed: %s", e)
        return {"success": False, "error": "Update failed"}


# ---------------------------------------------------------------------------
# Debug / Admin endpoints (only available when DEBUG=1)
# ---------------------------------------------------------------------------

@app.get("/api/debug/state")
async def debug_state():
    """Server-wide state summary for debugging."""
    if not _is_debug_enabled():
        return Response(status_code=404)
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
    if not _is_debug_enabled():
        return Response(status_code=404)
    return {
        "count": len(ctx.chat_history),
        "messages": ctx.chat_history,
    }


@app.get("/api/debug/conversations")
async def debug_conversations():
    """Return all agent conversation histories (truncated)."""
    if not _is_debug_enabled():
        return Response(status_code=404)
    conversations = agents.get_debug_conversations()
    return {
        "count": len(conversations),
        "conversations": {str(k): v for k, v in conversations.items()},
    }


@app.get("/api/debug/conversations/{ws_id}")
async def debug_conversation(ws_id: int):
    """Return a specific WebSocket's full conversation history."""
    if not _is_debug_enabled():
        return Response(status_code=404)
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
    if not _is_debug_enabled():
        return Response(status_code=404)
    try:
        return workspace.read_json("scene.json")
    except FileNotFoundError:
        return {"error": "no scene.json"}


@app.get("/api/debug/ui-config")
async def debug_ui_config():
    """Return the current ui_config.json content."""
    if not _is_debug_enabled():
        return Response(status_code=404)
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

MAX_WS_MESSAGE_SIZE = 5 * 1024 * 1024  # 5MB per message
WS_RATE_LIMIT_WINDOW = 1.0  # seconds
WS_RATE_LIMIT_MAX = 30  # max messages per window

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    _rate_ts: list[float] = []

    # Send initial state
    scene_json = workspace.read_json_safe("scene.json", DEFAULT_SCENE_JSON)
    ui_config = workspace.read_json_safe("ui_config.json", DEFAULT_UI_CONFIG)
    workspace_state = workspace.read_json_safe("workspace_state.json", {})

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

            # Message size limit
            if len(raw) > MAX_WS_MESSAGE_SIZE:
                await ws.send_text(json.dumps({
                    "type": "error",
                    "message": "Message too large",
                }))
                continue

            # Rate limiting
            now = _time.monotonic()
            _rate_ts[:] = [t for t in _rate_ts if now - t < WS_RATE_LIMIT_WINDOW]
            if len(_rate_ts) >= WS_RATE_LIMIT_MAX:
                await ws.send_text(json.dumps({
                    "type": "error",
                    "message": "Rate limit exceeded",
                }))
                continue
            _rate_ts.append(now)

            msg = json.loads(raw)
            msg_type = msg.get("type")

            handler = HANDLERS.get(msg_type)
            if handler:
                try:
                    await handler(ws, msg, ctx)
                except Exception:
                    logger.exception("Handler error for msg_type=%s", msg_type)
                    await ws.send_text(json.dumps({
                        "type": "error",
                        "message": f"Internal error handling '{msg_type}'",
                    }))

    except (WebSocketDisconnect, RuntimeError):
        try:
            manager.disconnect(ws)
        except ValueError:
            pass
