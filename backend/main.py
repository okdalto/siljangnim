"""
siljangnim Backend — FastAPI + WebSocket server.
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
    "render_mode": "script",
    "script": {
        "setup": (
            "const gl = ctx.gl;\n"
            "const prog = ctx.utils.createProgram(\n"
            "  ctx.utils.DEFAULT_QUAD_VERTEX_SHADER,\n"
            "  `#version 300 es\n"
            "precision highp float;\n"
            "in vec2 v_uv;\n"
            "uniform float u_time;\n"
            "out vec4 fragColor;\n"
            "void main() {\n"
            "  vec2 uv = v_uv;\n"
            "  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0.0, 2.0, 4.0));\n"
            "  fragColor = vec4(col, 1.0);\n"
            "}\n"
            "`);\n"
            "const quad = ctx.utils.createQuadGeometry();\n"
            "const vao = gl.createVertexArray();\n"
            "gl.bindVertexArray(vao);\n"
            "const buf = gl.createBuffer();\n"
            "gl.bindBuffer(gl.ARRAY_BUFFER, buf);\n"
            "gl.bufferData(gl.ARRAY_BUFFER, quad.positions, gl.STATIC_DRAW);\n"
            "const loc = gl.getAttribLocation(prog, 'a_position');\n"
            "gl.enableVertexAttribArray(loc);\n"
            "gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);\n"
            "gl.bindVertexArray(null);\n"
            "ctx.state.prog = prog;\n"
            "ctx.state.vao = vao;\n"
            "ctx.state.buf = buf;\n"
        ),
        "render": (
            "const gl = ctx.gl;\n"
            "gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);\n"
            "gl.clearColor(0.08, 0.08, 0.12, 1.0);\n"
            "gl.clear(gl.COLOR_BUFFER_BIT);\n"
            "gl.useProgram(ctx.state.prog);\n"
            "const tLoc = gl.getUniformLocation(ctx.state.prog, 'u_time');\n"
            "if (tLoc) gl.uniform1f(tLoc, ctx.time);\n"
            "gl.bindVertexArray(ctx.state.vao);\n"
            "gl.drawArrays(gl.TRIANGLES, 0, 6);\n"
            "gl.bindVertexArray(null);\n"
        ),
        "cleanup": (
            "const gl = ctx.gl;\n"
            "gl.deleteProgram(ctx.state.prog);\n"
            "gl.deleteVertexArray(ctx.state.vao);\n"
            "gl.deleteBuffer(ctx.state.buf);\n"
        ),
    },
    "uniforms": {},
    "clearColor": [0.08, 0.08, 0.12, 1.0],
}

DEFAULT_UI_CONFIG = {"controls": [], "inspectable_buffers": []}


# ---------------------------------------------------------------------------
# API key state
# ---------------------------------------------------------------------------

_api_key: str | None = None
_chat_history: list[dict] = []
_global_agent_busy: bool = False  # any agent running?
_AGENT_WS_ID = 0  # fixed conversation key (single-user app)


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
        "api_key_set": _api_key is not None,
        "global_agent_busy": _global_agent_busy,
        "active_connections": len(manager.active),
        "agent_ws_id": _AGENT_WS_ID,
        "chat_history_length": len(_chat_history),
        "conversation_count": len(conversations),
        "conversation_lengths": {str(k): len(v) for k, v in conversations.items()},
        "workspace_files": workspace.list_files(),
        "uploads": workspace.list_uploads(),
    }


@app.get("/api/debug/chat-history")
async def debug_chat_history():
    """Return the full chat history."""
    return {
        "count": len(_chat_history),
        "messages": _chat_history,
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
    import logging
    logger = logging.getLogger(__name__)
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
    global _api_key, _global_agent_busy
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
        "is_processing": _global_agent_busy,
        "chat_history": _chat_history,
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

                # Prevent concurrent agent runs
                if _global_agent_busy:
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

                async def on_text(text: str):
                    _chat_history.append({"role": "assistant", "text": text})
                    await manager.broadcast({"type": "assistant_text", "text": text})

                async def on_status(status_type: str, detail: str):
                    await manager.broadcast({
                        "type": "agent_status",
                        "status": status_type,
                        "detail": detail,
                    })

                _global_agent_busy = True

                async def _run_agent_task(
                    _user_prompt=user_prompt,
                    _log=log_callback,
                    _on_text=on_text,
                    _on_status=on_status,
                    _files=saved_files,
                ):
                    global _global_agent_busy
                    try:
                        # Process uploaded files BEFORE agent starts,
                        # so derivatives are available when the agent queries them
                        if _files:
                            await manager.broadcast({
                                "type": "agent_log",
                                "agent": "System",
                                "message": f"Processing {len(_files)} uploaded file(s)...",
                                "level": "info",
                            })
                            await _process_uploaded_files(_files, manager.broadcast)
                            await manager.broadcast({
                                "type": "agent_log",
                                "agent": "System",
                                "message": "File processing complete",
                                "level": "info",
                            })

                        await agents.run_agent(
                            ws_id=_AGENT_WS_ID,
                            user_prompt=_user_prompt,
                            log=_log,
                            broadcast=manager.broadcast,
                            on_text=_on_text,
                            on_status=_on_status,
                            files=_files,
                        )

                        await manager.broadcast({"type": "chat_done"})

                    except Exception as e:
                        import traceback
                        traceback.print_exc()
                        await manager.broadcast({
                            "type": "agent_log",
                            "agent": "System",
                            "message": f"Agent error: {e}",
                            "level": "error",
                        })
                        await manager.broadcast({
                            "type": "assistant_text",
                            "text": f"Error: {e}",
                        })
                        await manager.broadcast({"type": "chat_done"})
                    finally:
                        _global_agent_busy = False

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
                await agents.reset_agent(_AGENT_WS_ID)
                await ws.send_text(json.dumps({
                    "type": "agent_log",
                    "agent": "System",
                    "message": "Chat history cleared",
                    "level": "info",
                }))

            elif msg_type == "new_project":
                # Auto-save current project before resetting
                _auto_save_name = msg.get("active_project")
                if _auto_save_name:
                    try:
                        projects.save_project(
                            name=_auto_save_name,
                            chat_history=_chat_history,
                            thumbnail_b64=msg.get("thumbnail"),
                        )
                    except Exception as e:
                        logger.warning("Auto-save failed for %s: %s",
                                       _auto_save_name, e)

                # 1. Clear chat history and agent session
                _chat_history.clear()
                await agents.reset_agent(_AGENT_WS_ID)

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
                # Auto-save current project before loading another
                _auto_save_name = msg.get("active_project")
                if _auto_save_name:
                    try:
                        projects.save_project(
                            name=_auto_save_name,
                            chat_history=_chat_history,
                            thumbnail_b64=msg.get("thumbnail"),
                        )
                    except Exception as e:
                        logger.warning("Auto-save failed for %s: %s",
                                       _auto_save_name, e)

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
