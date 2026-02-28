"""
PromptGL — Claude Agent SDK based single-agent pipeline.

A single agent handles intent analysis, shader generation, UI control creation,
and conversational replies using custom MCP tools for scene/UI management.
"""

import asyncio
import json
import re
from typing import Callable, Awaitable, Any

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    tool,
    create_sdk_mcp_server,
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
)

import workspace

LogCallback = Callable[[str, str, str], Awaitable[None]]
BroadcastCallback = Callable[[dict], Awaitable[None]]

# ---------------------------------------------------------------------------
# Client management: WebSocket ID → persistent ClaudeSDKClient
# ---------------------------------------------------------------------------

_clients: dict[int, ClaudeSDKClient] = {}

# ---------------------------------------------------------------------------
# Shader compile result queue — frontend sends WebGL compile results here
# ---------------------------------------------------------------------------

_pending_compile_queue: asyncio.Queue | None = None


def _ensure_compile_queue() -> asyncio.Queue:
    """Lazily create the compile-result queue."""
    global _pending_compile_queue
    if _pending_compile_queue is None:
        _pending_compile_queue = asyncio.Queue()
    return _pending_compile_queue


async def notify_shader_compile_result(result: dict) -> None:
    """Called by the WebSocket handler when the frontend reports a compile result."""
    q = _ensure_compile_queue()
    # Drain any stale items before putting the new one
    while not q.empty():
        try:
            q.get_nowait()
        except asyncio.QueueEmpty:
            break
    await q.put(result)


# ---------------------------------------------------------------------------
# GLSL / Scene JSON validation  (kept from original)
# ---------------------------------------------------------------------------

def _validate_scene_json(scene: dict) -> list[str]:
    """Validate a scene JSON and its GLSL shaders.

    Returns a list of error strings. Empty list = valid.
    """
    errors = []

    if not isinstance(scene, dict):
        return ["Scene JSON is not a dict"]

    output = scene.get("output")
    if not output or not isinstance(output, dict):
        errors.append("Missing 'output' object in scene JSON")
        return errors

    frag = output.get("fragment")
    if not frag or not isinstance(frag, str):
        errors.append("Missing 'output.fragment' shader code")
        return errors

    errors.extend(_validate_glsl(frag, "output.fragment"))

    buffers = scene.get("buffers") or {}
    for name, buf in buffers.items():
        if not isinstance(buf, dict):
            errors.append(f"Buffer '{name}' is not a dict")
            continue
        buf_frag = buf.get("fragment")
        if not buf_frag or not isinstance(buf_frag, str):
            errors.append(f"Buffer '{name}' missing 'fragment' shader code")
            continue
        errors.extend(_validate_glsl(buf_frag, f"buffers.{name}.fragment"))

        for ch_name, ch in (buf.get("inputs") or {}).items():
            if ch.get("type") == "buffer" and ch.get("name") not in buffers:
                if ch.get("name") != name:
                    errors.append(
                        f"Buffer '{name}' input '{ch_name}' references "
                        f"non-existent buffer '{ch.get('name')}'"
                    )

    for ch_name, ch in (output.get("inputs") or {}).items():
        if ch.get("type") == "buffer" and ch.get("name") not in buffers:
            errors.append(
                f"Output input '{ch_name}' references "
                f"non-existent buffer '{ch.get('name')}'"
            )

    if output.get("vertex") and isinstance(output["vertex"], str):
        errors.extend(_validate_glsl(output["vertex"], "output.vertex", is_vertex=True))
    for name, buf in buffers.items():
        if buf.get("vertex") and isinstance(buf["vertex"], str):
            errors.extend(_validate_glsl(buf["vertex"], f"buffers.{name}.vertex", is_vertex=True))

    return errors


def _validate_glsl(source: str, label: str, is_vertex: bool = False) -> list[str]:
    """Validate a single GLSL shader source string."""
    errors = []
    lines = source.strip().split("\n")

    if not lines:
        errors.append(f"[{label}] Shader is empty")
        return errors

    first_line = lines[0].strip()
    if not first_line.startswith("#version"):
        errors.append(
            f"[{label}] First line must be '#version 300 es', "
            f"got: '{first_line[:50]}'"
        )
    elif "300 es" not in first_line:
        errors.append(
            f"[{label}] Must use '#version 300 es' (WebGL2), "
            f"got: '{first_line}'. "
            f"Do NOT use '#version 330' (desktop GL)."
        )

    if not is_vertex:
        if "precision" not in source:
            errors.append(
                f"[{label}] Missing 'precision highp float;' declaration. "
                f"This is REQUIRED in WebGL2 ES fragment shaders."
            )

    if "void main" not in source:
        errors.append(f"[{label}] Missing 'void main()' function")

    if "gl_FragColor" in source:
        errors.append(
            f"[{label}] Uses 'gl_FragColor' which is GLSL ES 1.0. "
            f"Use 'out vec4 fragColor;' instead (GLSL ES 3.0)."
        )

    if re.search(r"\battribute\b", source):
        errors.append(
            f"[{label}] Uses 'attribute' which is GLSL ES 1.0. "
            f"Use 'in' instead (GLSL ES 3.0)."
        )

    if re.search(r"\bvarying\b", source):
        errors.append(
            f"[{label}] Uses 'varying' which is GLSL ES 1.0. "
            f"Use 'in'/'out' instead (GLSL ES 3.0)."
        )

    if not is_vertex:
        if not re.search(r"\bout\s+vec4\s+\w+", source):
            errors.append(
                f"[{label}] Missing output variable declaration. "
                f"Need 'out vec4 fragColor;' (or similar name)."
            )

    if "texture2D" in source:
        errors.append(
            f"[{label}] Uses 'texture2D()' which is GLSL ES 1.0. "
            f"Use 'texture()' instead (GLSL ES 3.0)."
        )

    return errors


# ---------------------------------------------------------------------------
# Edit mode helpers  (kept from original)
# ---------------------------------------------------------------------------

def _apply_edits(current_scene: dict, edits: list[dict]) -> tuple[dict, list[str]]:
    """Apply a list of path-based edits to the current scene JSON."""
    scene = json.loads(json.dumps(current_scene))
    warnings = []
    for i, edit in enumerate(edits):
        target = edit.get("target", "")
        value = edit.get("value")
        if not target:
            warnings.append(f"Edit {i}: empty target path, skipped")
            continue
        try:
            _set_nested(scene, target, value)
        except (KeyError, IndexError, TypeError) as e:
            warnings.append(f"Edit {i}: failed to set '{target}': {e}")
    return scene, warnings


def _set_nested(obj, path, value):
    """Set a value in a nested dict using dot-path notation."""
    keys = path.split(".")
    for key in keys[:-1]:
        if isinstance(obj, dict):
            if key not in obj:
                obj[key] = {}
            obj = obj[key]
        else:
            raise TypeError(f"Cannot traverse into non-dict at '{key}'")
    final_key = keys[-1]
    if isinstance(obj, dict):
        obj[final_key] = value
    else:
        raise TypeError(f"Cannot set key '{final_key}' on non-dict")


# ---------------------------------------------------------------------------
# Unified system prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are the PromptGL Agent — a single AI assistant for a real-time visual \
creation tool that renders using WebGL2 in the browser via GLSL shaders.

You handle ALL tasks: analysing user intent, generating/modifying shaders, \
creating UI controls, and answering questions.

## SCENE JSON FORMAT

```json
{
  "version": 1,
  "mode": "fullscreen",
  "clearColor": [0.08, 0.08, 0.12, 1.0],
  "buffers": {
    "BufferA": {
      "fragment": "#version 300 es\\nprecision highp float;\\n...",
      "vertex": null,
      "geometry": "quad",
      "resolution_scale": 1.0,
      "double_buffer": false,
      "inputs": { "iChannel0": { "type": "buffer", "name": "BufferB" } }
    }
  },
  "output": {
    "fragment": "...GLSL code...",
    "vertex": null,
    "geometry": "quad",
    "inputs": { "iChannel0": { "type": "buffer", "name": "BufferA" } }
  },
  "uniforms": {
    "u_speed": { "type": "float", "value": 1.0 },
    "u_color": { "type": "vec3", "value": [0.4, 0.6, 0.9] }
  },
  "camera": { "position": [2, 1.5, 2], "target": [0, 0, 0], "fov": 60 },
  "animation": { "model_rotation": { "axis": [0, 1, 0], "speed": 0.5 } }
}
```

Key concepts:
- "buffers": intermediate render passes (like ShaderToy's BufferA/B/C/D)
- "output": final screen output pass
- "double_buffer": enable ping-pong (self can read its own previous frame). \
CRITICAL: when double_buffer is true, you MUST add a self-reference in "inputs", \
e.g. "inputs": { "iChannel0": { "type": "buffer", "name": "BufferA" } } for BufferA. \
Without this explicit input, the shader cannot read its previous frame and will be black.
- "geometry": "quad" (fullscreen shader art), "box", "sphere", "plane" (3D)
- "camera"/"animation": only used for 3D geometry modes
- For simple shader art, just use "output" with no buffers

## GLSL RULES (CRITICAL — WebGL2 ES 3.0)

- Always start with: #version 300 es
- Always include: precision highp float;
- Fragment output: out vec4 fragColor; (NOT gl_FragColor)
- Use in/out (NOT attribute/varying)
- Use texture() NOT texture2D()
- Built-in uniforms (auto-provided values, but you MUST declare them in GLSL \
if you use them): u_time, u_resolution, u_mouse, u_frame, u_dt
- For 3D: u_mvp, u_model, u_camera_pos are auto-provided
- Vertex attributes for quad: in vec2 a_position; (default vertex shader outputs v_uv)
- Vertex attributes for 3D: in vec3 a_position; in vec3 a_normal; in vec2 a_uv;
- Default quad vertex shader provides: out vec2 v_uv; (0-1 range UV coordinates)
- Buffer sampling: use uniform sampler2D iChannel0; with texture(iChannel0, uv)
- Do NOT list u_time, u_resolution, u_mouse, u_frame, u_dt in the "uniforms" \
field of the scene JSON — they are auto-provided by the engine.

## INSTANCING

- Set "instance_count": N in the pass config to draw N instances
- In VERTEX SHADER use gl_InstanceID (0 to N-1)
- Engine provides: uniform int u_instance_count;
- You MUST write a CUSTOM VERTEX SHADER when using instancing

## PER-PASS RENDER STATE

Each buffer or output pass can include optional render state fields \
to unlock advanced rendering techniques. All fields are optional — \
omit them to use sensible defaults.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| draw_mode | string | "triangles" | triangles, lines, points, line_strip, line_loop, triangle_strip, triangle_fan |
| blend | object | disabled | {src, dst, equation} — enables blending |
| depth | object | auto (3D=on, quad=off) | {test, write, func} |
| cull | object | disabled | {enable, face} |
| clear | object | clear all | {color, depth, color_value} |
| texture_format | string | "rgba16f" | rgba8, rgba16f, rgba32f, r32f, rg16f, rg32f (buffers only) |

## MULTIPASS PATTERNS

- Blur: BufferA renders scene, output samples BufferA with offset UVs
- Feedback: BufferA with double_buffer=true AND self-reference input \
  ("inputs": {"iChannel0": {"type": "buffer", "name": "BufferA"}})
- Simulation: BufferA stores state as color values with double_buffer=true + \
  self-reference input, output visualizes it
- IMPORTANT: double_buffer alone is NOT enough. The buffer's "inputs" MUST \
  explicitly include itself for the engine to bind the previous frame texture.

## UI CONFIG FORMAT

```json
{
  "controls": [
    {
      "type": "slider",
      "label": "Human-readable label",
      "uniform": "u_uniformName",
      "min": 0.0,
      "max": 1.0,
      "step": 0.01,
      "default": 0.5
    }
  ],
  "inspectable_buffers": ["BufferA"]
}
```

Control types:
- "slider": needs min, max, step, default (number)
- "color": needs default (hex string like "#ff0000")
- "toggle": needs default (boolean)
- "button": one-shot trigger (uniform is set to 1.0 on click, auto-resets to 0.0 \
after 100ms). Use for actions like "Reset", "Randomize", "Spawn". \
In the shader, check `if (u_trigger > 0.5) { ... }` to detect the impulse.

Do NOT create controls for auto-provided uniforms (u_time, u_resolution, etc.).
Create intuitive labels (e.g. "Glow Intensity" not "u_glow").
"inspectable_buffers" lists buffer names useful to inspect in separate viewports.

## CAMERA CONTROLS (ALWAYS INCLUDE)

Every scene MUST expose camera controls in the UI config so the user can \
navigate the view interactively.

- **2D** (geometry: "quad"): Add u_zoom, u_pan_x, u_pan_y uniforms. \
In the shader, transform UVs: `vec2 uv = (v_uv - 0.5) / u_zoom + vec2(0.5 + u_pan_x, 0.5 + u_pan_y);`
- **3D** (geometry: "box"/"sphere"/"plane"): Declare u_cam_pos_x, u_cam_pos_y, \
u_cam_pos_z, u_cam_target_x, u_cam_target_y, u_cam_target_z, u_cam_fov in \
scene JSON "uniforms" and expose as sliders. The engine reads them automatically \
(do NOT declare them in GLSL). Set defaults to match the camera field values.

## UPLOADED FILES

Users can upload files (images, 3D models, text files, etc.) to the chat. \
When files are attached:

- **Images** (PNG, JPG, GIF, WebP): You can see them directly via vision. \
Describe what you see and suggest how to use the image in a shader \
(as a texture, reference, color palette source, etc.). \
The image is saved to the uploads directory and accessible at `/api/uploads/<filename>`.
- **3D models** (OBJ, MTL): Use `read_uploaded_file` to read the file contents. \
Analyze the geometry and suggest how to render it. You can write loader code \
or convert it to shader-based rendering.
- **Other files**: Use `read_uploaded_file` to inspect the contents. \
Provide analysis and suggest how to incorporate the data into visuals.

Available tools for uploads:
- `list_uploaded_files`: See all uploaded files
- `read_uploaded_file(filename)`: Read file contents (text) or metadata (binary)

Uploaded files are served at `/api/uploads/<filename>` for use in shader inputs.

## WORKFLOW

1. **Create new visual**: Call `get_current_scene` first (to check if empty). \
Then call `update_scene` with a complete scene JSON. Then call `update_ui_config` \
with controls for any custom uniforms.

2. **Modify existing visual**: Call `get_current_scene` to read the current scene. \
Modify the JSON as needed (change shaders, uniforms, etc.). Call `update_scene` \
with the updated scene JSON. If uniforms changed, call `update_ui_config` too.

3. **Explain / answer questions**: Just respond with text. No tool calls needed.

## RULES

- If `update_scene` returns validation errors, fix the issues and call it again.
- Keep GLSL code clean. Use \\n for newlines inside JSON string values.
- When modifying, preserve parts of the scene the user didn't ask to change.
- Always respond in the SAME LANGUAGE the user is using.
- For "create" requests, generate both the scene and UI config.
- For small modifications that don't change uniforms, you may skip update_ui_config.
- When vertex is null the engine uses a default vertex shader for the geometry type.
- Custom uniforms go in the "uniforms" field of scene JSON.
"""


# ---------------------------------------------------------------------------
# MCP tool factory
# ---------------------------------------------------------------------------

def create_promptgl_tools(broadcast_fn: BroadcastCallback):
    """Create the 3 MCP tools as closures that capture broadcast_fn."""

    @tool(
        "get_current_scene",
        "Read the current scene.json from workspace. Returns the full scene JSON or a message if no scene exists.",
        {},
    )
    async def get_current_scene(args: dict[str, Any]) -> dict[str, Any]:
        try:
            scene = workspace.read_json("scene.json")
            return {
                "content": [
                    {"type": "text", "text": json.dumps(scene, indent=2)}
                ]
            }
        except FileNotFoundError:
            return {
                "content": [
                    {"type": "text", "text": "No scene.json exists yet. Create a new one."}
                ]
            }

    @tool(
        "update_scene",
        (
            "Validate, save, and broadcast a scene JSON to all connected clients. "
            "The scene_json parameter must be a complete scene JSON object. "
            "Returns 'ok' on success or a list of validation errors to fix."
        ),
        {"scene_json": str},
    )
    async def update_scene(args: dict[str, Any]) -> dict[str, Any]:
        raw = args.get("scene_json", "")
        # Parse the scene JSON
        try:
            if isinstance(raw, str):
                scene = json.loads(raw)
            else:
                scene = raw
        except json.JSONDecodeError as e:
            return {
                "content": [
                    {"type": "text", "text": f"Invalid JSON: {e}"}
                ],
                "isError": True,
            }

        # Validate
        errors = _validate_scene_json(scene)
        if errors:
            error_text = "Validation errors (fix these and call update_scene again):\n"
            error_text += "\n".join(f"  - {e}" for e in errors)
            return {
                "content": [{"type": "text", "text": error_text}],
                "isError": True,
            }

        # Save and broadcast
        workspace.write_json("scene.json", scene)

        # Prepare compile queue before broadcasting
        q = _ensure_compile_queue()
        # Drain stale results
        while not q.empty():
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                break

        await broadcast_fn({
            "type": "scene_update",
            "scene_json": scene,
        })

        # Wait for frontend WebGL compile result (max 5 seconds)
        try:
            result = await asyncio.wait_for(q.get(), timeout=5.0)
            if not result.get("success", True):
                error_msg = result.get("error", "Unknown WebGL compile error")
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"WebGL shader compile error from browser:\n{error_msg}\n\n"
                                "Fix the GLSL code and call update_scene again."
                            ),
                        }
                    ],
                    "isError": True,
                }
        except asyncio.TimeoutError:
            # No frontend connected or response took too long — assume ok
            pass

        return {
            "content": [
                {"type": "text", "text": "ok — scene saved, broadcast, and compiled successfully."}
            ]
        }

    @tool(
        "update_ui_config",
        (
            "Save and broadcast UI control configuration. "
            "The ui_config parameter must be a JSON string with 'controls' array "
            "and 'inspectable_buffers' array."
        ),
        {"ui_config": str},
    )
    async def update_ui_config(args: dict[str, Any]) -> dict[str, Any]:
        raw = args.get("ui_config", "")
        try:
            if isinstance(raw, str):
                ui_config = json.loads(raw)
            else:
                ui_config = raw
        except json.JSONDecodeError as e:
            return {
                "content": [
                    {"type": "text", "text": f"Invalid JSON: {e}"}
                ],
                "isError": True,
            }

        workspace.write_json("ui_config.json", ui_config)
        await broadcast_fn({
            "type": "scene_update",
            "ui_config": ui_config,
        })
        return {
            "content": [
                {"type": "text", "text": "ok — ui_config saved and broadcast to clients."}
            ]
        }

    @tool(
        "read_uploaded_file",
        (
            "Read an uploaded file from the uploads directory. "
            "For text files (.obj, .mtl, .glsl, .json, .txt, .csv, etc.), returns the file contents as text. "
            "For binary files (images, etc.), returns metadata only. "
            "Use list_uploaded_files first to see available files."
        ),
        {"filename": str},
    )
    async def read_uploaded_file(args: dict[str, Any]) -> dict[str, Any]:
        filename = args.get("filename", "")
        try:
            info = workspace.get_upload_info(filename)
            mime = info["mime_type"]
            # Text-based files: return content
            text_types = (
                "text/", "application/json", "application/xml",
                "application/javascript", "model/obj",
            )
            text_extensions = (
                ".obj", ".mtl", ".glsl", ".vert", ".frag", ".txt",
                ".csv", ".json", ".xml", ".html", ".css", ".js",
                ".py", ".md", ".yaml", ".yml", ".toml", ".svg",
            )
            is_text = any(mime.startswith(t) for t in text_types) or \
                      any(filename.lower().endswith(ext) for ext in text_extensions)

            if is_text:
                content = workspace.read_upload_text(filename)
                # Truncate very large files
                if len(content) > 50000:
                    content = content[:50000] + "\n... (truncated)"
                return {
                    "content": [
                        {"type": "text", "text": f"File: {filename} ({info['size']} bytes, {mime})\n\n{content}"}
                    ]
                }
            else:
                return {
                    "content": [
                        {"type": "text", "text": (
                            f"Binary file: {filename}\n"
                            f"Size: {info['size']} bytes\n"
                            f"MIME type: {mime}\n"
                            f"This is a binary file. Its contents cannot be displayed as text.\n"
                            f"If it's an image, the user may have sent it via vision (check the conversation).\n"
                            f"The file is accessible at: /api/uploads/{filename}"
                        )}
                    ]
                }
        except FileNotFoundError:
            return {
                "content": [{"type": "text", "text": f"File not found: {filename}"}],
                "isError": True,
            }

    @tool(
        "list_uploaded_files",
        "List all files uploaded by the user. Returns filenames and metadata.",
        {},
    )
    async def list_uploaded_files(args: dict[str, Any]) -> dict[str, Any]:
        files = workspace.list_uploads()
        if not files:
            return {
                "content": [{"type": "text", "text": "No files have been uploaded yet."}]
            }
        info_lines = []
        for f in files:
            try:
                info = workspace.get_upload_info(f)
                info_lines.append(f"- {f} ({info['size']} bytes, {info['mime_type']})")
            except FileNotFoundError:
                info_lines.append(f"- {f} (info unavailable)")
        return {
            "content": [{"type": "text", "text": "Uploaded files:\n" + "\n".join(info_lines)}]
        }

    return [get_current_scene, update_scene, update_ui_config, read_uploaded_file, list_uploaded_files]


# ---------------------------------------------------------------------------
# Client lifecycle helpers
# ---------------------------------------------------------------------------

async def _get_or_create_client(
    ws_id: int,
    broadcast: BroadcastCallback,
) -> ClaudeSDKClient:
    """Return the existing client for this WS, or create a new one."""
    if ws_id in _clients:
        return _clients[ws_id]

    tools = create_promptgl_tools(broadcast)
    mcp_server = create_sdk_mcp_server(
        name="promptgl",
        version="1.0.0",
        tools=tools,
    )

    options = ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        model="claude-opus-4-6",
        mcp_servers={"promptgl": mcp_server},
        allowed_tools=[
            "mcp__promptgl__get_current_scene",
            "mcp__promptgl__update_scene",
            "mcp__promptgl__update_ui_config",
            "mcp__promptgl__read_uploaded_file",
            "mcp__promptgl__list_uploaded_files",
        ],
        permission_mode="bypassPermissions",
        max_turns=10,
        cwd=str(workspace.WORKSPACE_DIR),
    )

    client = ClaudeSDKClient(options=options)
    await client.connect()
    _clients[ws_id] = client
    return client


# ---------------------------------------------------------------------------
# Agent execution
# ---------------------------------------------------------------------------

def _build_multimodal_prompt(user_prompt: str, files: list[dict]) -> str | list[dict]:
    """Build a prompt that includes file info.

    For images, we build a multimodal content block list.
    For non-image files, we add text descriptions.
    """
    image_mimes = {"image/png", "image/jpeg", "image/gif", "image/webp"}
    content_blocks: list[dict] = []
    non_image_descriptions: list[str] = []

    for f in files:
        mime = f.get("mime_type", "")
        name = f.get("name", "unknown")
        data_b64 = f.get("data_b64", "")

        if mime in image_mimes and data_b64:
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime,
                    "data": data_b64,
                },
            })
            content_blocks.append({
                "type": "text",
                "text": f"[Uploaded image: {name} ({f.get('size', 0)} bytes)]",
            })
        else:
            non_image_descriptions.append(
                f"[Uploaded file: {name} ({f.get('size', 0)} bytes, {mime}) — "
                f"use read_uploaded_file tool to read its contents. "
                f"The file is accessible at /api/uploads/{name}]"
            )

    # If there are image blocks, build multimodal content
    if content_blocks:
        # Add non-image descriptions as text
        extra_text = "\n".join(non_image_descriptions)
        prompt_text = user_prompt or "The user uploaded these files."
        if extra_text:
            prompt_text += "\n\n" + extra_text

        content_blocks.append({"type": "text", "text": prompt_text})
        return content_blocks

    # No images — just add file info to text prompt
    file_info = "\n".join(non_image_descriptions)
    prompt_text = user_prompt or "The user uploaded files."
    return prompt_text + "\n\n" + file_info


async def run_agent(
    ws_id: int,
    user_prompt: str,
    log: LogCallback,
    broadcast: BroadcastCallback,
    on_text: Callable[[str], Awaitable[None]] | None = None,
    files: list[dict] | None = None,
) -> dict:
    """Run the Claude Agent SDK agent for one user prompt.

    Returns {"chat_text": str} with the agent's conversational reply.
    """
    await log("System", f"Starting agent for: \"{user_prompt}\"", "info")
    if files:
        file_names = ", ".join(f["name"] for f in files)
        await log("System", f"Files attached: {file_names}", "info")

    client = await _get_or_create_client(ws_id, broadcast)

    # Build prompt — multimodal if images are attached
    if files:
        prompt = _build_multimodal_prompt(user_prompt, files)
    else:
        prompt = user_prompt

    await client.query(prompt)

    last_text = ""

    async for message in client.receive_response():
        # Stream assistant messages
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ThinkingBlock):
                    text = getattr(block, "thinking", None) or getattr(block, "text", None) or ""
                    if text:
                        await log("Agent", text, "thinking")
                elif isinstance(block, TextBlock):
                    last_text = block.text
                    await log("Agent", block.text, "info")
                    if on_text:
                        await on_text(block.text)
                elif isinstance(block, ToolUseBlock):
                    input_str = json.dumps(block.input)
                    if len(input_str) > 200:
                        input_str = input_str[:200] + "..."
                    await log("Agent", f"Tool: {block.name}({input_str})", "thinking")

        # Completion
        elif isinstance(message, ResultMessage):
            subtype = getattr(message, "subtype", "unknown")
            cost = getattr(message, "total_cost_usd", None)
            turns = getattr(message, "num_turns", None)
            cost_str = f"${cost:.4f}" if cost is not None else "n/a"
            await log(
                "System",
                f"Agent finished ({subtype}) — turns: {turns}, cost: {cost_str}",
                "result",
            )

    chat_text = last_text or "Done."
    return {"chat_text": chat_text}


async def reset_agent(ws_id: int) -> None:
    """Disconnect & remove the client so the next query starts fresh."""
    client = _clients.pop(ws_id, None)
    if client:
        try:
            await client.disconnect()
        except Exception:
            pass


async def destroy_client(ws_id: int) -> None:
    """Clean up when a WebSocket disconnects."""
    await reset_agent(ws_id)
