"""
PromptGL Backend — FastAPI + WebSocket server.
Rendering is done client-side via WebGL2. Backend manages Claude Agent SDK agent and state.
"""

import asyncio
import base64
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import workspace
import config
import agents
import projects


# ---------------------------------------------------------------------------
# Default scene JSON (simple color gradient)
# ---------------------------------------------------------------------------

DEFAULT_SCENE_JSON = {
    "version": 1,
    "mode": "fullscreen",
    "clearColor": [0.08, 0.08, 0.12, 1.0],
    "buffers": {},
    "output": {
        "fragment": (
            "#version 300 es\n"
            "precision highp float;\n"
            "in vec2 v_uv;\n"
            "uniform float u_time;\n"
            "uniform vec2 u_resolution;\n"
            "out vec4 fragColor;\n"
            "void main() {\n"
            "  vec2 uv = v_uv;\n"
            "  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0.0, 2.0, 4.0));\n"
            "  fragColor = vec4(col, 1.0);\n"
            "}\n"
        ),
        "vertex": None,
        "geometry": "quad",
        "inputs": {},
    },
    "uniforms": {},
    "camera": None,
    "animation": None,
}

DEFAULT_UI_CONFIG = {"controls": [], "inspectable_buffers": []}


# ---------------------------------------------------------------------------
# API key state
# ---------------------------------------------------------------------------

_api_key: str | None = None
_chat_history: list[dict] = []
_agent_busy: dict[int, bool] = {}  # ws_id → busy flag


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _api_key
    _api_key = config.load_api_key()

    # Seed defaults
    existing = workspace.list_files()
    if "scene.json" not in existing:
        workspace.write_json("scene.json", DEFAULT_SCENE_JSON)
    if "ui_config.json" not in existing:
        workspace.write_json("ui_config.json", DEFAULT_UI_CONFIG)

    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="PromptGL", lifespan=lifespan)

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


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/workspace/files")
async def get_workspace_files():
    return {"files": workspace.list_files()}


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
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    global _api_key
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

    await ws.send_text(json.dumps({
        "type": "init",
        "scene_json": scene_json,
        "ui_config": ui_config,
        "projects": projects.list_projects(),
    }))

    if not _api_key:
        await ws.send_text(json.dumps({"type": "api_key_required"}))

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "set_api_key":
                key = msg.get("key", "").strip()
                valid, error = await config.validate_api_key(key)
                if valid:
                    config.save_api_key(key)
                    _api_key = key
                    await ws.send_text(json.dumps({"type": "api_key_valid"}))
                else:
                    await ws.send_text(json.dumps({
                        "type": "api_key_invalid",
                        "error": error,
                    }))

            elif msg_type == "prompt":
                if not _api_key:
                    await ws.send_text(json.dumps({"type": "api_key_required"}))
                    continue

                ws_id = id(ws)

                # Prevent concurrent agent runs on the same connection
                if _agent_busy.get(ws_id):
                    await ws.send_text(json.dumps({
                        "type": "agent_log",
                        "agent": "System",
                        "message": "Agent is busy, please wait...",
                        "level": "error",
                    }))
                    continue

                user_prompt = msg.get("text", "")

                # Process uploaded files
                raw_files = msg.get("files", [])
                saved_files = []
                if raw_files:
                    try:
                        saved_files = _process_uploads(raw_files)
                    except ValueError as e:
                        await ws.send_text(json.dumps({
                            "type": "agent_log",
                            "agent": "System",
                            "message": str(e),
                            "level": "error",
                        }))
                        continue

                history_entry = {"role": "user", "text": user_prompt}
                if saved_files:
                    history_entry["files"] = [
                        {"name": f["name"], "mime_type": f["mime_type"], "size": f["size"]}
                        for f in saved_files
                    ]
                _chat_history.append(history_entry)

                async def log_callback(agent_name: str, message: str, level: str):
                    await manager.broadcast({
                        "type": "agent_log",
                        "agent": agent_name,
                        "message": message,
                        "level": level,
                    })

                async def send_to_client(msg: dict):
                    try:
                        await ws.send_text(json.dumps(msg))
                    except Exception:
                        pass

                async def on_text(text: str):
                    _chat_history.append({"role": "assistant", "text": text})
                    await send_to_client({"type": "assistant_text", "text": text})

                _agent_busy[ws_id] = True

                async def _run_agent_task(
                    _ws_id=ws_id,
                    _user_prompt=user_prompt,
                    _log=log_callback,
                    _on_text=on_text,
                    _send=send_to_client,
                    _files=saved_files,
                ):
                    try:
                        await agents.run_agent(
                            ws_id=_ws_id,
                            user_prompt=_user_prompt,
                            log=_log,
                            broadcast=manager.broadcast,
                            on_text=_on_text,
                            files=_files,
                        )

                        await _send({"type": "chat_done"})

                    except Exception as e:
                        await manager.broadcast({
                            "type": "agent_log",
                            "agent": "System",
                            "message": f"Agent error: {e}",
                            "level": "error",
                        })
                        await _send({
                            "type": "assistant_text",
                            "text": f"Error: {e}",
                        })
                        await _send({"type": "chat_done"})
                    finally:
                        _agent_busy.pop(_ws_id, None)

                asyncio.create_task(_run_agent_task())

            elif msg_type == "set_uniform":
                uniform = msg.get("uniform")
                value = msg.get("value")
                if uniform is not None and value is not None:
                    # Update uniform in scene.json for persistence
                    try:
                        scene = workspace.read_json("scene.json")
                        if "uniforms" not in scene:
                            scene["uniforms"] = {}
                        if uniform in scene["uniforms"]:
                            scene["uniforms"][uniform]["value"] = value
                        else:
                            # Infer type from value
                            if isinstance(value, list):
                                utype = f"vec{len(value)}"
                            elif isinstance(value, bool):
                                utype = "bool"
                            else:
                                utype = "float"
                            scene["uniforms"][uniform] = {"type": utype, "value": value}
                        workspace.write_json("scene.json", scene)
                    except FileNotFoundError:
                        pass

            elif msg_type == "new_chat":
                _chat_history.clear()
                await agents.reset_agent(id(ws))
                await ws.send_text(json.dumps({
                    "type": "agent_log",
                    "agent": "System",
                    "message": "Chat history cleared",
                    "level": "info",
                }))

            elif msg_type == "new_project":
                # 1. Clear chat history and agent session
                _chat_history.clear()
                await agents.reset_agent(id(ws))

                # 2. Reset workspace files to defaults
                workspace.write_json("scene.json", DEFAULT_SCENE_JSON)
                workspace.write_json("ui_config.json", DEFAULT_UI_CONFIG)

                # 3. Clear uploads
                workspace.clear_uploads()

                # Clean up old files
                for old_file in ["scene.py", "pipeline.json", "uniforms.json", "renderer_status.json"]:
                    try:
                        p = workspace._safe_path(old_file)
                        if p.exists():
                            p.unlink()
                    except Exception:
                        pass

                # 3. Broadcast init with default scene
                await manager.broadcast({
                    "type": "init",
                    "scene_json": DEFAULT_SCENE_JSON,
                    "ui_config": DEFAULT_UI_CONFIG,
                    "projects": projects.list_projects(),
                })

            elif msg_type == "project_save":
                try:
                    thumbnail_b64 = msg.get("thumbnail")
                    meta = projects.save_project(
                        name=msg.get("name", "untitled"),
                        chat_history=_chat_history,
                        description=msg.get("description", ""),
                        thumbnail_b64=thumbnail_b64,
                    )
                    await ws.send_text(json.dumps({
                        "type": "project_saved",
                        "meta": meta,
                    }))
                    await manager.broadcast({
                        "type": "project_list",
                        "projects": projects.list_projects(),
                    })
                except Exception as e:
                    await ws.send_text(json.dumps({
                        "type": "project_save_error",
                        "error": str(e),
                    }))

            elif msg_type == "project_load":
                try:
                    result = projects.load_project(msg.get("name", ""))
                    _chat_history.clear()
                    _chat_history.extend(result["chat_history"])
                    await ws.send_text(json.dumps({
                        "type": "project_loaded",
                        **result,
                    }))
                except Exception as e:
                    await ws.send_text(json.dumps({
                        "type": "project_load_error",
                        "error": str(e),
                    }))

            elif msg_type == "project_list":
                await ws.send_text(json.dumps({
                    "type": "project_list",
                    "projects": projects.list_projects(),
                }))

            elif msg_type == "project_delete":
                try:
                    projects.delete_project(msg.get("name", ""))
                    await manager.broadcast({
                        "type": "project_list",
                        "projects": projects.list_projects(),
                    })
                except Exception as e:
                    await ws.send_text(json.dumps({
                        "type": "project_delete_error",
                        "error": str(e),
                    }))

            elif msg_type == "shader_compile_result":
                await agents.notify_shader_compile_result(msg)

            elif msg_type == "request_state":
                try:
                    s = workspace.read_json("scene.json")
                    u = workspace.read_json("ui_config.json")
                except FileNotFoundError:
                    s, u = DEFAULT_SCENE_JSON, DEFAULT_UI_CONFIG
                await ws.send_text(json.dumps({
                    "type": "init",
                    "scene_json": s,
                    "ui_config": u,
                    "projects": projects.list_projects(),
                }))

    except (WebSocketDisconnect, RuntimeError):
        try:
            manager.disconnect(ws)
        except ValueError:
            pass
        await agents.destroy_client(id(ws))
        _agent_busy.pop(id(ws), None)
