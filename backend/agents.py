"""
PromptGL — Direct Anthropic API single-agent pipeline.

A single agent handles intent analysis, shader generation, UI control creation,
and conversational replies using tool calls for scene/UI management.
"""

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Callable, Awaitable, Any

import anthropic

import workspace

# ---------------------------------------------------------------------------
# Project path constants
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_WORKSPACE_DIR = _PROJECT_ROOT / ".workspace"

_IGNORED_DIRS = {
    ".git", "node_modules", ".venv", "__pycache__", "dist",
    ".next", ".cache", ".DS_Store", ".vite",
}


def _resolve_project_path(path: str) -> Path | None:
    """Resolve a path relative to project root. Returns None if outside root."""
    resolved = (_PROJECT_ROOT / path).resolve()
    if not str(resolved).startswith(str(_PROJECT_ROOT.resolve())):
        return None
    return resolved

LogCallback = Callable[[str, str, str], Awaitable[None]]
BroadcastCallback = Callable[[dict], Awaitable[None]]

# ---------------------------------------------------------------------------
# Conversation history: WebSocket ID → message list
# ---------------------------------------------------------------------------

_conversations: dict[int, list[dict]] = {}

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
            if ch.get("type") == "image" and not ch.get("url"):
                errors.append(
                    f"Buffer '{name}' input '{ch_name}' has type 'image' "
                    f"but missing 'url' field"
                )

    for ch_name, ch in (output.get("inputs") or {}).items():
        if ch.get("type") == "buffer" and ch.get("name") not in buffers:
            errors.append(
                f"Output input '{ch_name}' references "
                f"non-existent buffer '{ch.get('name')}'"
            )
        if ch.get("type") == "image" and not ch.get("url"):
            errors.append(
                f"Output input '{ch_name}' has type 'image' "
                f"but missing 'url' field"
            )

    # Validate inputs.keyboard if present
    scene_inputs = scene.get("inputs")
    if scene_inputs is not None:
        if not isinstance(scene_inputs, dict):
            errors.append("'inputs' must be a dict")
        else:
            kb = scene_inputs.get("keyboard")
            if kb is not None:
                if not isinstance(kb, dict):
                    errors.append("'inputs.keyboard' must be a dict")
                else:
                    for uname, code in kb.items():
                        if not isinstance(code, str):
                            errors.append(
                                f"inputs.keyboard['{uname}'] value must be a string "
                                f"(KeyboardEvent.code), got {type(code).__name__}"
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
- "camera": REQUIRED for 3D geometry (box/sphere/plane). Without it the engine \
skips camera uniform binding and nothing renders. Always include: \
`"camera": { "position": [2, 1.5, 2], "target": [0, 0, 0], "fov": 60 }`
- "animation": optional model rotation for 3D scenes
- For simple shader art, just use "output" with no buffers
- Image texture input: { "type": "image", "url": "/api/uploads/filename.png" } \
— loads an uploaded image as a sampler2D texture

## GLSL RULES (CRITICAL — WebGL2 ES 3.0)

- Always start with: #version 300 es
- Always include: precision highp float;
- Fragment output: out vec4 fragColor; (NOT gl_FragColor)
- Use in/out (NOT attribute/varying)
- Use texture() NOT texture2D()
- Built-in uniforms (auto-provided values, but you MUST declare them in GLSL \
if you use them): u_time, u_resolution, u_mouse, u_mouse_prev, u_mouse_down, \
u_mouse_down_prev, u_frame, u_dt
- ALL built-in uniforms are float type. Declare them as: \
`uniform float u_time;` `uniform vec2 u_resolution;` `uniform vec4 u_mouse;` \
`uniform vec4 u_mouse_prev;` `uniform float u_mouse_down;` \
`uniform float u_mouse_down_prev;` `uniform float u_frame;` `uniform float u_dt;` \
NEVER declare u_frame as int — the engine sends all values as float.
- u_resolution matches the ACTUAL render target size for each pass. \
If a buffer uses resolution_scale (e.g. 0.25), u_resolution will be the \
scaled buffer size, not the canvas size. `1.0/u_resolution.xy` gives correct \
texel size for that pass. You can also use `textureSize(iChannel0, 0)` \
to query input texture dimensions directly.
- For 3D: u_mvp, u_model, u_camera_pos are auto-provided
- Vertex attributes for quad: in vec2 a_position; (default vertex shader outputs v_uv)
- Vertex attributes for 3D: in vec3 a_position; in vec3 a_normal; in vec2 a_uv;
- Default quad vertex shader provides: out vec2 v_uv; (0-1 range UV coordinates)
- Buffer sampling: use uniform sampler2D iChannel0; with texture(iChannel0, uv)
- Do NOT list u_time, u_resolution, u_mouse, u_mouse_down, u_frame, u_dt, \
or keyboard uniforms (u_key_*) in the "uniforms" field — they are auto-provided.

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
- Initialization: To initialize a simulation on the first frame, use \
  `if (u_frame < 1.0)` (u_frame is float, not int). \
  Or use `if (u_time < 0.05)` as a time-based alternative.

## KEYBOARD & MOUSE INPUT

The viewport accepts keyboard input when focused (user clicks the viewport).

Add an "inputs" object at the top level of scene JSON:
```json
{
  "inputs": {
    "keyboard": {
      "u_key_w": "KeyW",
      "u_key_a": "KeyA",
      "u_key_s": "KeyS",
      "u_key_d": "KeyD",
      "u_key_space": "Space"
    }
  }
}
```

Common KeyboardEvent.code values:
- Letters: "KeyA" ~ "KeyZ"
- Arrows: "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
- Special: "Space", "ShiftLeft", "ControlLeft", "Enter", "Escape"
- Digits: "Digit0" ~ "Digit9"

In GLSL declare `uniform float u_key_w;` etc. Value is 1.0 when pressed, 0.0 when released.
Keyboard uniforms must NOT be listed in the "uniforms" field (engine manages them automatically).

Mouse: u_mouse is vec4(x, y, clickX, clickY), ALL values already normalized 0-1. \
u_mouse_prev is vec4 with the PREVIOUS frame's mouse state (same format). \
u_mouse_down is float (1.0=pressed). u_mouse_down_prev is the previous frame's press state. \
Use `u_mouse.xy - u_mouse_prev.xy` to compute mouse velocity/delta per frame. \
Use `u_mouse_down > 0.5 && u_mouse_down_prev < 0.5` to detect click start (rising edge).
CRITICAL: u_mouse.xy is already in the SAME coordinate space as v_uv (0-1 normalized). \
Do NOT divide u_mouse.xy by u_resolution — that would produce near-zero values and break positioning. \
Use `u_mouse.xy` directly to compare with `v_uv` (e.g. `length(v_uv - u_mouse.xy)`).
When using keyboard input, always tell the user: "Click the viewport to focus it for keyboard input."

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
- "dropdown": select from predefined options. Needs `options` (array of \
`{label, value}` objects) and `default` (number matching one of the values). \
Outputs a float. Example: `{"type":"dropdown","label":"Shape","uniform":"u_shape",\
"options":[{"label":"Circle","value":0},{"label":"Square","value":1},\
{"label":"Triangle","value":2}],"default":0}`. \
Use for mode/type selection (blend mode, noise type, shape, etc.).
- "pad2d": 2D XY pad for vec2 control. Needs `min` ([x,y]), `max` ([x,y]), \
`default` ([x,y]). Outputs [x,y] as vec2. Example: `{"type":"pad2d",\
"label":"Offset","uniform":"u_offset","min":[-1,-1],"max":[1,1],\
"default":[0,0]}`. Use for position, offset, direction control. \
CRITICAL: The pad2d control outputs a single vec2 uniform (e.g. `u_pan`). \
In the GLSL shader you MUST declare it as `uniform vec2 u_pan;` and access \
components via `u_pan.x`, `u_pan.y`. Do NOT create separate float uniforms \
like `u_pan_x`, `u_pan_y` — those are different names and won't receive \
the pad2d values.
- "separator": visual group header, no uniform. Needs only `label`. \
Example: `{"type":"separator","label":"Color Settings"}`. \
Use to organize controls into logical groups.
- "text": direct number input field. Needs `default` (number). Outputs float. \
Example: `{"type":"text","label":"Seed","uniform":"u_seed","default":42}`. \
Use for seed values, precise parameters, or values with unpredictable range.
- "rotation3d": 3D arcball rotation for camera orbit. Needs `uniforms` (array of \
3 uniform names for x/y/z), `target` ([x,y,z] orbit centre), `distance` (orbit \
radius), `default` ([x,y,z] initial camera position). \
Example: `{"type":"rotation3d","label":"Camera","uniforms":["u_cam_pos_x",\
"u_cam_pos_y","u_cam_pos_z"],"target":[0,0,0],"distance":3.0,\
"default":[2,1.5,2]}`. \
Use instead of individual camera position sliders for 3D scenes.

Do NOT create controls for auto-provided uniforms (u_time, u_resolution, etc.).
Create intuitive labels (e.g. "Glow Intensity" not "u_glow").
"inspectable_buffers" lists buffer names useful to inspect in separate viewports.

## CAMERA CONTROLS (ALWAYS INCLUDE)

Every scene MUST expose camera controls in the UI config so the user can \
navigate the view interactively.

- **2D** (geometry: "quad"): Add u_zoom (float) and u_pan (vec2) uniforms. \
Use a "pad2d" control for u_pan — it outputs [x,y] as a vec2 which maps \
directly to the uniform. Example pad2d control: `{"type":"pad2d",\
"label":"Pan","uniform":"u_pan","min":[-1,-1],"max":[1,1],"default":[0,0]}`. \
In the shader, declare `uniform vec2 u_pan;` and transform UVs: \
`vec2 uv = (v_uv - 0.5) / u_zoom + 0.5 + u_pan;`
- **3D** (geometry: "box"/"sphere"/"plane"): Declare u_cam_pos_x, u_cam_pos_y, \
u_cam_pos_z, u_cam_target_x, u_cam_target_y, u_cam_target_z, u_cam_fov in \
scene JSON "uniforms" and expose camera position as a single "rotation3d" \
control (preferred) — it provides an intuitive 3D arcball widget for orbiting \
the camera around the target. Example: `{"type":"rotation3d","label":"Camera",\
"uniforms":["u_cam_pos_x","u_cam_pos_y","u_cam_pos_z"],"target":[0,0,0],\
"distance":3.0,"default":[2,1.5,2]}`. \
You may still add individual sliders for target position and FOV. \
The engine reads u_cam_* uniforms automatically (do NOT declare them in GLSL).

## UPLOADED FILES

Users can upload files (images, 3D models, text files, etc.) to the chat. \
When files are attached:

- **Images** (PNG, JPG, GIF, WebP): You can see them directly via vision. \
Describe what you see and suggest how to use the image in a shader \
(as a texture, reference, color palette source, etc.). \
The image is saved to the uploads directory and accessible at `/api/uploads/<filename>`. \
To use an uploaded image as a shader texture, add it as an input: \
`"inputs": { "iChannel0": { "type": "image", "url": "/api/uploads/<filename>" } }` \
Then declare `uniform sampler2D iChannel0;` in the GLSL code and sample with `texture(iChannel0, uv)`.
- **3D models** (OBJ, MTL): Use `read_uploaded_file` to read the file contents. \
Analyze the geometry and suggest how to render it. You can write loader code \
or convert it to shader-based rendering.
- **Other files**: Use `read_uploaded_file` to inspect the contents. \
Provide analysis and suggest how to incorporate the data into visuals.

Available tools for uploads:
- `list_uploaded_files`: See all uploaded files
- `read_uploaded_file(filename)`: Read file contents (text) or metadata (binary)

Uploaded files are served at `/api/uploads/<filename>` for use in shader inputs.

## FILE ACCESS

You can explore the project source code to understand the engine, existing shaders, \
and UI components before generating code.

- `list_files(path)`: List directory contents (project-wide, read-only)
- `read_file(path)`: Read any project file (read-only, 50KB limit)
- `write_file(path, content)`: Write files (restricted to .workspace/ only)

Paths are relative to the project root. Use these to understand \
existing patterns before writing shaders.

## WORKFLOW

1. **Create new visual**: Call `get_current_scene` first (to check if empty). \
Then call `update_scene` with a complete scene JSON. Then call `update_ui_config` \
with controls for any custom uniforms.

2. **Modify existing visual**: Call `get_current_scene` to read the current scene. \
Modify the JSON as needed (change shaders, uniforms, etc.). Call `update_scene` \
with the updated scene JSON. If uniforms changed, call `update_ui_config` too.

3. **Explain / answer questions**: Just respond with text. No tool calls needed.

4. **Review (ALWAYS do this after creating or modifying)**: \
After `update_scene` succeeds, call `get_current_scene` one more time to read back \
the saved result. Compare it against the user's original request and verify:
   - Does the shader logic actually implement what the user asked for?
   - Does the shader use u_time for animation? (If not, it's likely a bug — fix it)
   - Are all requested visual elements present (colors, shapes, effects, animations)?
   - Are buffer references and inputs wired correctly?
   - Are custom uniforms declared in both the GLSL code and the "uniforms" field?
   - Do UI controls cover all user-adjustable parameters?
If you find any mismatch or missing detail, fix it immediately by calling \
`update_scene` / `update_ui_config` again. Briefly summarize what you verified \
in your final response to the user.

## RULES

- **ALWAYS use u_time for animation.** This is a real-time rendering tool — \
visuals should move, evolve, and feel alive. Unless the user explicitly asks for \
a static image, every shader MUST incorporate u_time to create motion \
(e.g. animation, pulsing, rotation, color cycling, morphing, flowing, etc.). \
A static shader is almost always wrong.
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
# Anthropic tool definitions (JSON Schema)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "get_current_scene",
        "description": (
            "Read the current scene.json from workspace. "
            "Returns the full scene JSON or a message if no scene exists."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "update_scene",
        "description": (
            "Validate, save, and broadcast a scene JSON to all connected clients. "
            "The scene_json parameter must be a complete scene JSON string. "
            "Returns 'ok' on success or a list of validation errors to fix."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "scene_json": {
                    "type": "string",
                    "description": "Complete scene JSON object as a string.",
                },
            },
            "required": ["scene_json"],
        },
    },
    {
        "name": "update_ui_config",
        "description": (
            "Save and broadcast UI control configuration. "
            "The ui_config parameter must be a JSON string with 'controls' array "
            "and 'inspectable_buffers' array."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ui_config": {
                    "type": "string",
                    "description": "UI config JSON string with 'controls' and 'inspectable_buffers'.",
                },
            },
            "required": ["ui_config"],
        },
    },
    {
        "name": "read_uploaded_file",
        "description": (
            "Read an uploaded file from the uploads directory. "
            "For text files (.obj, .mtl, .glsl, .json, .txt, .csv, etc.), returns the file contents as text. "
            "For binary files (images, etc.), returns metadata only. "
            "Use list_uploaded_files first to see available files."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Name of the uploaded file to read.",
                },
            },
            "required": ["filename"],
        },
    },
    {
        "name": "list_uploaded_files",
        "description": "List all files uploaded by the user. Returns filenames and metadata.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "list_files",
        "description": (
            "List directory contents relative to the project root. "
            "Useful for exploring the project structure (source code, shaders, etc.). "
            "Directories show a trailing /, files show their size."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from project root. Defaults to '.' (root).",
                },
            },
        },
    },
    {
        "name": "read_file",
        "description": (
            "Read a project file by relative path. Returns file contents for text files "
            "(up to 50KB), or metadata for binary files. Use this to understand existing "
            "code, shaders, and engine internals before generating new code."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from project root to the file to read.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Write a file to the .workspace/ directory. Only paths under .workspace/ "
            "are writable. Parent directories are created automatically."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path under .workspace/ (e.g. '.workspace/notes.txt').",
                },
                "content": {
                    "type": "string",
                    "description": "File content to write.",
                },
            },
            "required": ["path", "content"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool handler
# ---------------------------------------------------------------------------

async def _handle_tool(
    name: str,
    input_data: dict,
    broadcast: BroadcastCallback,
) -> str:
    """Execute a tool call and return the result as a plain string."""

    if name == "get_current_scene":
        try:
            scene = workspace.read_json("scene.json")
            return json.dumps(scene, indent=2)
        except FileNotFoundError:
            return "No scene.json exists yet. Create a new one."

    elif name == "update_scene":
        raw = input_data.get("scene_json", "")
        try:
            if isinstance(raw, str):
                scene = json.loads(raw)
            else:
                scene = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        errors = _validate_scene_json(scene)
        if errors:
            error_text = "Validation errors (fix these and call update_scene again):\n"
            error_text += "\n".join(f"  - {e}" for e in errors)
            return error_text

        workspace.write_json("scene.json", scene)

        q = _ensure_compile_queue()
        while not q.empty():
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                break

        await broadcast({
            "type": "scene_update",
            "scene_json": scene,
        })

        try:
            result = await asyncio.wait_for(q.get(), timeout=5.0)
            if not result.get("success", True):
                error_msg = result.get("error", "Unknown WebGL compile error")
                return (
                    f"WebGL shader compile error from browser:\n{error_msg}\n\n"
                    "Fix the GLSL code and call update_scene again."
                )
        except asyncio.TimeoutError:
            pass

        return "ok — scene saved, broadcast, and compiled successfully."

    elif name == "update_ui_config":
        raw = input_data.get("ui_config", "")
        try:
            if isinstance(raw, str):
                ui_config = json.loads(raw)
            else:
                ui_config = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        workspace.write_json("ui_config.json", ui_config)
        await broadcast({
            "type": "scene_update",
            "ui_config": ui_config,
        })
        return "ok — ui_config saved and broadcast to clients."

    elif name == "read_uploaded_file":
        filename = input_data.get("filename", "")
        try:
            info = workspace.get_upload_info(filename)
            mime = info["mime_type"]
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
                if len(content) > 50000:
                    content = content[:50000] + "\n... (truncated)"
                return f"File: {filename} ({info['size']} bytes, {mime})\n\n{content}"
            else:
                return (
                    f"Binary file: {filename}\n"
                    f"Size: {info['size']} bytes\n"
                    f"MIME type: {mime}\n"
                    f"This is a binary file. Its contents cannot be displayed as text.\n"
                    f"If it's an image, the user may have sent it via vision (check the conversation).\n"
                    f"The file is accessible at: /api/uploads/{filename}"
                )
        except FileNotFoundError:
            return f"File not found: {filename}"

    elif name == "list_uploaded_files":
        files = workspace.list_uploads()
        if not files:
            return "No files have been uploaded yet."
        info_lines = []
        for f in files:
            try:
                info = workspace.get_upload_info(f)
                info_lines.append(f"- {f} ({info['size']} bytes, {info['mime_type']})")
            except FileNotFoundError:
                info_lines.append(f"- {f} (info unavailable)")
        return "Uploaded files:\n" + "\n".join(info_lines)

    elif name == "list_files":
        rel_path = input_data.get("path", ".")
        resolved = _resolve_project_path(rel_path)
        if resolved is None:
            return "Error: path is outside the project root."
        if not resolved.is_dir():
            return f"Error: '{rel_path}' is not a directory."
        try:
            entries = sorted(os.listdir(resolved))
        except PermissionError:
            return f"Error: permission denied for '{rel_path}'."
        lines = []
        for entry in entries:
            if entry in _IGNORED_DIRS or entry.startswith("."):
                continue
            full = resolved / entry
            if full.is_dir():
                lines.append(f"  {entry}/")
            else:
                try:
                    size = full.stat().st_size
                    lines.append(f"  {entry}  ({size} bytes)")
                except OSError:
                    lines.append(f"  {entry}")
        if not lines:
            return f"Directory '{rel_path}' is empty (after filtering)."
        return f"Contents of '{rel_path}':\n" + "\n".join(lines)

    elif name == "read_file":
        rel_path = input_data.get("path", "")
        if not rel_path:
            return "Error: 'path' is required."
        resolved = _resolve_project_path(rel_path)
        if resolved is None:
            return "Error: path is outside the project root."
        if not resolved.is_file():
            return f"Error: '{rel_path}' is not a file or does not exist."
        binary_extensions = {
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico",
            ".woff", ".woff2", ".ttf", ".otf", ".eot",
            ".zip", ".tar", ".gz", ".bz2", ".7z",
            ".pdf", ".exe", ".dll", ".so", ".dylib",
            ".mp3", ".mp4", ".wav", ".ogg", ".webm",
            ".pyc", ".pyo", ".class",
        }
        suffix = resolved.suffix.lower()
        file_size = resolved.stat().st_size
        if suffix in binary_extensions:
            return (
                f"Binary file: {rel_path}\n"
                f"Size: {file_size} bytes\n"
                f"Type: {suffix}\n"
                f"Binary files cannot be displayed as text."
            )
        try:
            content = resolved.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            return f"Error reading '{rel_path}': {e}"
        max_size = 50_000
        truncated = ""
        if len(content) > max_size:
            content = content[:max_size]
            truncated = "\n... (truncated at 50KB)"
        return f"File: {rel_path} ({file_size} bytes)\n\n{content}{truncated}"

    elif name == "write_file":
        rel_path = input_data.get("path", "")
        content = input_data.get("content", "")
        if not rel_path:
            return "Error: 'path' is required."
        resolved = _resolve_project_path(rel_path)
        if resolved is None:
            return "Error: path is outside the project root."
        # Check that the path is under .workspace/
        try:
            resolved.relative_to(_WORKSPACE_DIR.resolve())
        except ValueError:
            return "Write access denied. Only .workspace/ is writable."
        try:
            resolved.parent.mkdir(parents=True, exist_ok=True)
            resolved.write_text(content, encoding="utf-8")
        except OSError as e:
            return f"Error writing '{rel_path}': {e}"
        return f"ok — wrote {len(content)} bytes to {rel_path}"

    else:
        return f"Unknown tool: {name}"


# ---------------------------------------------------------------------------
# Agent execution
# ---------------------------------------------------------------------------

def _build_multimodal_content(user_prompt: str, files: list[dict]) -> list[dict]:
    """Build a multimodal content block list from user prompt + attached files.

    Returns a list of Anthropic content blocks (image / text).
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

    # Compose user text
    extra_text = "\n".join(non_image_descriptions)
    prompt_text = user_prompt or "The user uploaded these files."
    if extra_text:
        prompt_text += "\n\n" + extra_text

    content_blocks.append({"type": "text", "text": prompt_text})
    return content_blocks


StatusCallback = Callable[[str, str], Awaitable[None]]  # (status_type, detail)

_MAX_TURNS = 10
_MAX_COMPACT_RETRIES = 2


# ---------------------------------------------------------------------------
# Conversation compaction — reduce token usage when max_tokens is hit
# ---------------------------------------------------------------------------

def _compact_messages(messages: list[dict]) -> None:
    """Compact conversation history in-place to reduce token usage.

    1. Remove thinking blocks from assistant messages
    2. Truncate long tool_use inputs and tool_result contents to 200 chars
    3. If still 8+ messages, keep first user message + last 6
    """
    _TRUNC = 200

    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            continue

        # --- Strip thinking blocks from assistant messages ---
        if msg.get("role") == "assistant":
            msg["content"] = [
                block for block in content
                if not (isinstance(block, dict) and block.get("type") == "thinking")
            ]
            content = msg["content"]

        # --- Truncate large payloads ---
        for block in content:
            if not isinstance(block, dict):
                continue

            # tool_use: truncate input values
            if block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
                for key, val in block["input"].items():
                    if isinstance(val, str) and len(val) > _TRUNC:
                        block["input"][key] = val[:_TRUNC] + "...(truncated)"

            # tool_result: truncate content string
            if block.get("type") == "tool_result" and isinstance(block.get("content"), str):
                if len(block["content"]) > _TRUNC:
                    block["content"] = block["content"][:_TRUNC] + "...(truncated)"

    # --- Trim old turns if conversation is very long ---
    if len(messages) > 8:
        kept = [messages[0]] + messages[-6:]
        messages.clear()
        messages.extend(kept)


async def run_agent(
    ws_id: int,
    user_prompt: str,
    log: LogCallback,
    broadcast: BroadcastCallback,
    on_text: Callable[[str], Awaitable[None]] | None = None,
    on_status: StatusCallback | None = None,
    files: list[dict] | None = None,
) -> dict:
    """Run the agent for one user prompt using the Anthropic API directly.

    Returns {"chat_text": str} with the agent's conversational reply.
    """
    await log("System", f"Starting agent for: \"{user_prompt}\"", "info")
    if files:
        file_names = ", ".join(f["name"] for f in files)
        await log("System", f"Files attached: {file_names}", "info")

    client = anthropic.AsyncAnthropic()

    # Build user message content
    if files:
        content = _build_multimodal_content(user_prompt, files)
    else:
        content = user_prompt

    messages = _conversations.setdefault(ws_id, [])
    messages.append({"role": "user", "content": content})

    last_text = ""
    turns = 0
    compact_retries = 0

    try:
        while turns < _MAX_TURNS:
            turns += 1

            # Stream the API call so thinking/status updates reach the
            # frontend in real-time instead of blocking until completion.
            current_block_type = None
            thinking_chunks: list[str] = []
            thinking_len = 0

            async with client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=65536,
                thinking={"type": "adaptive"},
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_start":
                        current_block_type = event.content_block.type
                        if current_block_type == "thinking":
                            thinking_chunks = []
                            thinking_len = 0
                            await log("Agent", "[Thinking started]", "thinking")
                            if on_status:
                                await on_status("thinking", "")
                        elif current_block_type == "tool_use":
                            tool_name = getattr(event.content_block, "name", "")
                            if on_status:
                                await on_status("tool_use", tool_name)

                    elif event.type == "content_block_delta":
                        delta = event.delta
                        delta_type = getattr(delta, "type", "")
                        if delta_type == "thinking_delta":
                            chunk = getattr(delta, "thinking", "")
                            if chunk:
                                thinking_chunks.append(chunk)
                                thinking_len += len(chunk)
                                # Send periodic updates (~every 300 chars)
                                if thinking_len % 300 < len(chunk):
                                    if on_status:
                                        await on_status("thinking", "".join(thinking_chunks))

                    elif event.type == "content_block_stop":
                        if current_block_type == "thinking" and thinking_chunks:
                            full_thinking = "".join(thinking_chunks)
                            await log("Agent", full_thinking, "thinking")
                        current_block_type = None

                response = await stream.get_final_message()

            # Process completed response blocks (text, tool_use logging)
            for block in response.content:
                if block.type == "text":
                    last_text = block.text
                    await log("Agent", block.text, "info")
                    if on_text:
                        await on_text(block.text)
                elif block.type == "tool_use":
                    input_str = json.dumps(block.input)
                    if len(input_str) > 200:
                        input_str = input_str[:200] + "..."
                    await log("Agent", f"Tool: {block.name}({input_str})", "thinking")
                    if on_status:
                        await on_status("tool_use", block.name)

            # Append assistant message to history (serialize only API-accepted fields)
            assistant_content = []
            for block in response.content:
                if block.type == "thinking":
                    assistant_content.append({
                        "type": "thinking",
                        "thinking": block.thinking,
                        "signature": block.signature,
                    })
                elif block.type == "text":
                    assistant_content.append({
                        "type": "text",
                        "text": block.text,
                    })
                elif block.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
            messages.append({"role": "assistant", "content": assistant_content})

            # If the response was cut off due to token limit, compact & retry
            if response.stop_reason == "max_tokens":
                compact_retries += 1
                if compact_retries > _MAX_COMPACT_RETRIES:
                    await log("System", "Max compact retries reached — using partial response", "info")
                    break
                await log("System", "Token limit reached — compacting conversation...", "info")
                if on_status:
                    await on_status("thinking", "Compacting conversation...")
                _compact_messages(messages)
                messages.append({
                    "role": "user",
                    "content": "You were cut off due to token limit. Continue where you left off.",
                })
                continue

            # If the model stopped for a reason other than tool_use, we're done
            if response.stop_reason != "tool_use":
                break

            # Execute tool calls and build tool_result messages
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result_str = await _handle_tool(block.name, block.input, broadcast)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_str,
                    })

            messages.append({"role": "user", "content": tool_results})

        # Log completion
        await log(
            "System",
            f"Agent finished — turns: {turns}",
            "result",
        )

        chat_text = last_text or "Done."
        return {"chat_text": chat_text}

    except Exception:
        # Clear conversation so next query starts fresh
        _conversations.pop(ws_id, None)
        raise


def get_debug_conversations(max_content_len: int = 200) -> dict[int, list[dict]]:
    """Return a safely-serialisable copy of _conversations with large content truncated."""
    def _truncate(obj):
        if isinstance(obj, str):
            return obj[:max_content_len] + "..." if len(obj) > max_content_len else obj
        if isinstance(obj, list):
            return [_truncate(item) for item in obj]
        if isinstance(obj, dict):
            return {k: _truncate(v) for k, v in obj.items()}
        return obj

    return {ws_id: _truncate(msgs) for ws_id, msgs in _conversations.items()}


async def reset_agent(ws_id: int) -> None:
    """Clear conversation history so the next query starts fresh."""
    _conversations.pop(ws_id, None)


async def destroy_client(ws_id: int) -> None:
    """Clean up when a WebSocket disconnects."""
    _conversations.pop(ws_id, None)
