"""
PromptGL Backend — FastAPI + WebSocket server.
"""

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import workspace
import config
import agents


# ---------------------------------------------------------------------------
# Seed default workspace files on startup
# ---------------------------------------------------------------------------

DEFAULT_SHADER_VERT = """\
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
"""

DEFAULT_SHADER_FRAG = """\
uniform float u_time;
varying vec2 vUv;
void main() {
  vec3 color = 0.5 + 0.5 * cos(u_time + vUv.xyx + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(color, 1.0);
}
"""

DEFAULT_PIPELINE = {
    "mode": "mesh",
    "shader": {
        "vertex": "shader.vert",
        "fragment": "shader.frag",
    },
    "uniforms": {
        "u_time": {"type": "float", "value": 0.0},
    },
}

DEFAULT_UI_CONFIG = {
    "controls": [
        {
            "type": "slider",
            "label": "Time Speed",
            "uniform": "u_time",
            "min": 0.0,
            "max": 10.0,
            "step": 0.01,
            "default": 1.0,
        }
    ]
}


# ---------------------------------------------------------------------------
# Stored API key (loaded on startup, set via WebSocket)
# ---------------------------------------------------------------------------

_api_key: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _api_key
    # Load API key from .env
    _api_key = config.load_api_key()

    # Seed defaults if not already present
    existing = workspace.list_files()
    if "shader.vert" not in existing:
        workspace.write_file("shader.vert", DEFAULT_SHADER_VERT)
    if "shader.frag" not in existing:
        workspace.write_file("shader.frag", DEFAULT_SHADER_FRAG)
    if "pipeline.json" not in existing:
        workspace.write_json("pipeline.json", DEFAULT_PIPELINE)
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
# Connection manager (broadcast to all connected clients)
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
        for ws in self.active:
            await ws.send_text(data)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/workspace/files")
async def get_workspace_files():
    """List all generated files."""
    return {"files": workspace.list_files()}


@app.get("/api/workspace/{filename:path}")
async def get_workspace_file(filename: str):
    """Read a generated file."""
    try:
        content = workspace.read_file(filename)
        # Try JSON parse
        try:
            return {"filename": filename, "content": json.loads(content)}
        except json.JSONDecodeError:
            return {"filename": filename, "content": content}
    except FileNotFoundError:
        return {"error": "not found"}, 404


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    global _api_key
    await manager.connect(ws)

    # Send initial state
    try:
        pipeline = workspace.read_json("pipeline.json")
        frag = workspace.read_file("shader.frag")
        vert = workspace.read_file("shader.vert")
        ui_config = workspace.read_json("ui_config.json")
    except FileNotFoundError:
        pipeline, frag, vert, ui_config = {}, "", "", {}

    await ws.send_text(json.dumps({
        "type": "init",
        "pipeline": pipeline,
        "shaders": {"vertex": vert, "fragment": frag},
        "ui_config": ui_config,
    }))

    # If no API key loaded, tell the client
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

                user_prompt = msg.get("text", "")

                # Log callback streams agent_log messages to all clients
                async def log_callback(agent_name: str, message: str, level: str):
                    await manager.broadcast({
                        "type": "agent_log",
                        "agent": agent_name,
                        "message": message,
                        "level": level,
                    })

                try:
                    result = await agents.run_pipeline(
                        _api_key, user_prompt, log_callback
                    )

                    # Send chat response
                    await manager.broadcast({
                        "type": "chat_response",
                        "text": result["chat_text"],
                    })

                    # Send shader update
                    await manager.broadcast({
                        "type": "shader_update",
                        "shaders": result["shaders"],
                        "pipeline": result["pipeline"],
                        "ui_config": result["ui_config"],
                    })

                except Exception as e:
                    await manager.broadcast({
                        "type": "agent_log",
                        "agent": "System",
                        "message": f"Pipeline error: {e}",
                        "level": "error",
                    })
                    await manager.broadcast({
                        "type": "chat_response",
                        "text": f"Error: {e}",
                    })

            elif msg_type == "request_state":
                # Re-send current workspace state
                await ws.send_text(json.dumps({
                    "type": "init",
                    "pipeline": workspace.read_json("pipeline.json"),
                    "shaders": {
                        "vertex": workspace.read_file("shader.vert"),
                        "fragment": workspace.read_file("shader.frag"),
                    },
                    "ui_config": workspace.read_json("ui_config.json"),
                }))

    except WebSocketDisconnect:
        manager.disconnect(ws)
