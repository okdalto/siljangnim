"""
PromptGL — Direct Anthropic API single-agent pipeline.

A single agent handles intent analysis, WebGL2 script generation, UI control creation,
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
# Scene JSON validation
# ---------------------------------------------------------------------------

def _validate_scene_json(scene: dict) -> list[str]:
    """Validate a scene JSON (script mode only).

    Returns a list of error strings. Empty list = valid.
    """
    errors = []

    if not isinstance(scene, dict):
        return ["Scene JSON is not a dict"]

    script = scene.get("script")
    if not script or not isinstance(script, dict):
        errors.append("Missing 'script' object in scene JSON")
        return errors
    if not script.get("render"):
        errors.append("Missing 'script.render' code in scene JSON")

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
creation tool that renders using WebGL2 in the browser.

You handle ALL tasks: analysing user intent, generating/modifying WebGL2 scripts, \
creating UI controls, and answering questions.

## SCENE JSON FORMAT

The scene JSON uses a script-based approach where you write raw WebGL2 JavaScript code.

```json
{
  "version": 1,
  "render_mode": "script",
  "script": {
    "setup": "// runs once when loaded\\n...",
    "render": "// runs every frame\\n...",
    "cleanup": "// runs when scene is disposed\\n..."
  },
  "uniforms": {
    "u_speed": { "type": "float", "value": 1.0 },
    "u_color": { "type": "vec3", "value": [0.4, 0.6, 0.9] }
  },
  "clearColor": [0, 0, 0, 1]
}
```

The `script.render` field is REQUIRED. `script.setup` and `script.cleanup` are optional.

### ctx API

Each script function receives a `ctx` object with these fields:

| Field | Type | Description |
|-------|------|-------------|
| ctx.gl | WebGL2RenderingContext | WebGL2 context |
| ctx.canvas | HTMLCanvasElement | The canvas element |
| ctx.state | object | Persistent state across frames (use this to store variables) |
| ctx.time | float | Elapsed time in seconds (available in render) |
| ctx.dt | float | Frame delta time (available in render) |
| ctx.mouse | [x,y,cx,cy] | Mouse coords normalized 0-1 (available in render) |
| ctx.mousePrev | [x,y,cx,cy] | Previous frame mouse (available in render) |
| ctx.mouseDown | boolean | Mouse button pressed (available in render) |
| ctx.resolution | [w,h] | Canvas size in pixels (available in render) |
| ctx.frame | int | Frame counter (available in render) |
| ctx.uniforms | object | Current UI slider values (available in render) |
| ctx.keys | Set | Currently pressed key codes (available in render) |
| ctx.utils | object | Utility functions (see below) |

### ctx.utils — helper functions

The engine exposes these utilities on `ctx.utils` for convenience:

| Function | Description |
|----------|-------------|
| `ctx.utils.createProgram(vertSource, fragSource)` | Compile & link a WebGL program from GLSL sources |
| `ctx.utils.compileShader(type, source)` | Compile a single shader (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER) |
| `ctx.utils.createQuadGeometry()` | Returns fullscreen quad positions (Float32Array, 6 verts, 2D) |
| `ctx.utils.createBoxGeometry()` | Returns unit box with positions, normals, uvs (36 verts, 3D) |
| `ctx.utils.createSphereGeometry(segments?)` | Returns UV sphere with indices (3D) |
| `ctx.utils.createPlaneGeometry(w?, h?, wSegs?, hSegs?)` | Returns XZ plane with indices (3D) |
| `ctx.utils.DEFAULT_QUAD_VERTEX_SHADER` | Default vertex shader for fullscreen quads |
| `ctx.utils.DEFAULT_3D_VERTEX_SHADER` | Default vertex shader for 3D geometry |
| `ctx.utils.uploadTexture(texture, source)` | Upload image/video/canvas to texture with Y-flip for GL |
| `ctx.utils.loadImage(url)` | Load image → `Promise<{texture, width, height}>` (Y-flipped) |
| `ctx.utils.initWebcam()` | Start webcam → `Promise<{video, texture, stream}>` |
| `ctx.utils.updateVideoTexture(texture, video)` | Refresh webcam/video texture each frame (Y-flipped) |

**Y-coordinate note**: All texture upload utilities automatically flip Y to match \
GL coordinates (bottom-left origin). Mouse coordinates (`ctx.mouse`) are in \
screen space (0,0 = top-left, 1,1 = bottom-right). If you need GL-space mouse Y, \
use `1.0 - ctx.mouse[1]`.

### Canvas 2D text rendering example

```javascript
// setup
if (!ctx.state.canvas2d) {
  ctx.state.canvas2d = document.createElement('canvas');
  ctx.state.ctx2d = ctx.state.canvas2d.getContext('2d');
  ctx.state.texture = ctx.gl.createTexture();
}

// render
const c = ctx.state.canvas2d;
const c2 = ctx.state.ctx2d;
c.width = ctx.resolution[0];
c.height = ctx.resolution[1];
c2.clearRect(0, 0, c.width, c.height);
c2.fillStyle = '#fff';
c2.font = '48px monospace';
c2.textAlign = 'center';
c2.fillText('Hello World', c.width/2, c.height/2);

// Upload to WebGL and draw
const gl = ctx.gl;
gl.bindTexture(gl.TEXTURE_2D, ctx.state.texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
// ... draw fullscreen quad with this texture
```

### GLSL rules (for shaders compiled via ctx.utils.createProgram)

- Always start with: #version 300 es
- Always include: precision highp float;
- Fragment output: out vec4 fragColor; (NOT gl_FragColor)
- Use in/out (NOT attribute/varying)
- Use texture() NOT texture2D()
- All built-in uniforms are float type

### Script mode rules
- Store ALL persistent state in `ctx.state` (not in closures or globals)
- Create WebGL resources (shaders, buffers, textures) in `setup`
- Clean up WebGL resources in `cleanup` (delete textures, buffers, programs)
- The `render` function is called every frame — keep it efficient
- You have full access to `ctx.gl` (WebGL2) — you can create shaders, \
draw geometry, use Canvas 2D for text, etc.
- For simple 2D drawing (text, shapes), create an offscreen Canvas 2D, \
draw to it, then upload as a WebGL texture

## KEYBOARD & MOUSE INPUT

The viewport accepts keyboard input when focused (user clicks the viewport).

Keyboard: Check `ctx.keys.has("KeyW")` etc. in the render function.

Common KeyboardEvent.code values:
- Letters: "KeyA" ~ "KeyZ"
- Arrows: "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
- Special: "Space", "ShiftLeft", "ControlLeft", "Enter", "Escape"
- Digits: "Digit0" ~ "Digit9"

Mouse: ctx.mouse is [x, y, clickX, clickY], ALL values normalized 0-1 in screen space \
(0,0 = top-left, 1,1 = bottom-right). \
ctx.mousePrev is the PREVIOUS frame's mouse state (same format). \
ctx.mouseDown is boolean (true=pressed). \
Use `ctx.mouse[0] - ctx.mousePrev[0]` to compute mouse velocity/delta per frame. \
CRITICAL: ctx.mouse values are already in 0-1 normalized coordinates. \
Do NOT divide by resolution — that would produce near-zero values. \
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
  "inspectable_buffers": []
}
```

Control types:
- "slider": needs min, max, step, default (number)
- "color": needs default (hex string like "#ff0000")
- "toggle": needs default (boolean)
- "button": one-shot trigger (uniform is set to 1.0 on click, auto-resets to 0.0 \
after 100ms). Use for actions like "Reset", "Randomize", "Spawn". \
In the script, check `if (ctx.uniforms.u_trigger > 0.5) { ... }` to detect the impulse.
- "dropdown": select from predefined options. Needs `options` (array of \
`{label, value}` objects) and `default` (number matching one of the values). \
Outputs a float. Example: `{"type":"dropdown","label":"Shape","uniform":"u_shape",\
"options":[{"label":"Circle","value":0},{"label":"Square","value":1},\
{"label":"Triangle","value":2}],"default":0}`. \
Use for mode/type selection (blend mode, noise type, shape, etc.).
- "pad2d": 2D XY pad for vec2 control. Needs `min` ([x,y]), `max` ([x,y]), \
`default` ([x,y]). Outputs [x,y] as vec2. Example: `{"type":"pad2d",\
"label":"Offset","uniform":"u_offset","min":[-1,-1],"max":[1,1],\
"default":[0,0]}`. Use for position, offset, direction control.
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

Create intuitive labels (e.g. "Glow Intensity" not "u_glow").

## UPLOADED FILES

Users can upload files (images, 3D models, text files, etc.) to the chat. \
When files are attached:

- **Images** (PNG, JPG, GIF, WebP): You can see them directly via vision. \
Describe what you see and suggest how to use the image \
(as a texture, reference, color palette source, etc.). \
The image is saved to the uploads directory and accessible at `/api/uploads/<filename>`. \
To use an uploaded image as a texture in a script, fetch it and create a WebGL texture.
- **3D models** (OBJ, MTL): Use `read_uploaded_file` to read the file contents. \
Analyze the geometry and suggest how to render it.
- **Other files**: Use `read_uploaded_file` to inspect the contents. \
Provide analysis and suggest how to incorporate the data into visuals.

Available tools for uploads:
- `list_uploaded_files`: See all uploaded files
- `read_uploaded_file(filename)`: Read file contents (text) or metadata (binary)

Uploaded files are served at `/api/uploads/<filename>` for use in scripts.

## PROCESSED FILE DERIVATIVES

When files are uploaded, they are automatically preprocessed into WebGL-ready \
derivatives. Use `list_uploaded_files` to see available derivatives for each file.

### Font files (.ttf, .otf, .woff, .woff2)
- `atlas.png`: Bitmap glyph atlas (48px, white glyphs on transparent background). \
  Use as a texture with `atlas_metrics.json` UV coordinates to render text.
- `atlas_metrics.json`: Per-glyph metrics including UV coordinates, advance widths, \
  and bearings. Load via `read_uploaded_file` and use the `uv` array [u0, v0, u1, v1] \
  to sample the correct glyph region from `atlas.png`.
- `outlines.json`: Vector outlines as SVG path data for each glyph. \
  Can be used for SDF text rendering or path-based effects.
- `msdf_atlas.png` + `msdf_metrics.json`: MSDF atlas (if msdf-atlas-gen is installed). \
  Provides resolution-independent text rendering.

### SVG files (.svg)
- `svg_data.json`: Parsed SVG structure with paths (d attribute), circles, rects, \
  lines, polygons, and text elements. Use path `d` attributes for vector rendering \
  in shaders, or extract coordinates for procedural effects.

### Audio files (.mp3, .wav, .ogg, .flac)
- `waveform.json`: Downsampled waveform (4096 samples). Load via \
  `read_uploaded_file` and use the `samples` array for audio visualization.
- `spectrogram.png`: Spectrogram image (1024x512). Use as a texture input for \
  frequency-domain visualization.

### Video files (.mp4, .webm, .mov)
- `frame_NNN.png`: Uniformly sampled keyframes (up to 30, 512px max dimension). \
  Use individual frames as texture inputs.
- `video_metadata.json`: Duration, FPS, resolution, and frame timestamps.

### 3D Model files (.obj, .gltf, .glb)
- `geometry.json`: Vertex positions, normals, UVs, and indices as flat arrays. \
  Load via `read_uploaded_file` and use the data to create WebGL vertex buffers.

Derivatives are served at `/api/uploads/processed/<stem_ext>/<filename>`. \
Example: for `myFont.ttf`, the atlas is at `/api/uploads/processed/myFont_ttf/atlas.png`.

## WEBCAM INPUT

Use `ctx.utils.initWebcam()` in setup to get a webcam stream. \
Then call `ctx.utils.updateVideoTexture(texture, video)` each frame in render \
to refresh the texture (Y-flip is handled automatically). Example:
```javascript
// setup
ctx.utils.initWebcam().then(cam => { ctx.state.cam = cam; });

// render
if (ctx.state.cam) {
  ctx.utils.updateVideoTexture(ctx.state.cam.texture, ctx.state.cam.video);
  // bind ctx.state.cam.texture and draw
}

// cleanup
if (ctx.state.cam) {
  ctx.state.cam.stream.getTracks().forEach(t => t.stop());
  ctx.gl.deleteTexture(ctx.state.cam.texture);
}
```
Always tell the user that the browser will ask for camera permission.

## FILE ACCESS

You can explore the project source code to understand the engine, existing code, \
and UI components before generating code.

- `list_files(path)`: List directory contents (project-wide, read-only)
- `read_file(path)`: Read any project file (read-only, 50KB limit)
- `write_file(path, content)`: Write files (restricted to .workspace/ only)

Paths are relative to the project root. Use these to understand \
existing patterns before writing scripts.

## CUSTOM PANELS

You can create custom HTML/CSS/JS panels that appear as draggable nodes in the UI. \
Use `open_panel` to create a panel and `close_panel` to remove it.

**Bridge API** — Every panel iframe automatically has a `window.panel` object:

```js
// Set a uniform value on the WebGL engine
panel.setUniform("u_speed", 2.5);

// Read current state (updated every frame by the engine)
panel.uniforms   // {u_speed: 2.5, u_color: [1,0,0], ...}
panel.time       // current time in seconds
panel.frame      // current frame number
panel.mouse      // [x, y, pressed, prevPressed]

// Register a callback that runs every frame
panel.onUpdate = function(p) {
  document.getElementById('time').textContent = p.time.toFixed(2);
};
```

**Example — Interactive control panel:**
```html
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: sans-serif; padding: 12px; background: #1a1a2e; color: #eee; margin: 0; }
  label { display: block; margin: 8px 0 4px; font-size: 13px; }
  input[type=range] { width: 100%; }
  .value { font-size: 12px; color: #888; }
</style>
</head>
<body>
  <label>Speed</label>
  <input type="range" id="speed" min="0" max="5" step="0.1" value="1">
  <span class="value" id="speedVal">1.0</span>
  <label>Scale</label>
  <input type="range" id="scale" min="0.1" max="3" step="0.1" value="1">
  <span class="value" id="scaleVal">1.0</span>
  <script>
    document.getElementById('speed').addEventListener('input', function(e) {
      var v = parseFloat(e.target.value);
      document.getElementById('speedVal').textContent = v.toFixed(1);
      panel.setUniform('u_speed', v);
    });
    document.getElementById('scale').addEventListener('input', function(e) {
      var v = parseFloat(e.target.value);
      document.getElementById('scaleVal').textContent = v.toFixed(1);
      panel.setUniform('u_scale', v);
    });
    panel.onUpdate = function(p) {
      document.getElementById('speed').value = p.uniforms.u_speed || 1;
      document.getElementById('speedVal').textContent = (p.uniforms.u_speed || 1).toFixed(1);
    };
  </script>
</body>
</html>
```

**When to use custom panels:**
- Interactive controls that go beyond simple sliders (2D color pickers, curve editors, etc.)
- Data visualization dashboards showing scene metrics
- Info/help panels with formatted text and diagrams
- Debugging tools showing real-time uniform values
- Any custom UI that standard inspector controls cannot provide

## RECORDING

You can record the WebGL canvas to a WebM video file:

- `start_recording({duration?, fps?})`: Start recording. If `duration` is provided \
(in seconds), recording stops automatically. Default fps is 30. \
The playback is automatically unpaused when recording starts.
- `stop_recording()`: Stop recording manually. The WebM file auto-downloads in the browser.

Use this when the user asks to capture, record, or export a video of their scene.

## WORKFLOW

1. **Create new visual**: Call `get_current_scene` first (to check if empty). \
Then call `update_scene` with a complete scene JSON. Then call `update_ui_config` \
with controls for any custom uniforms.

2. **Modify existing visual**: Call `get_current_scene` to read the current scene. \
Modify the JSON as needed (change script code, uniforms, etc.). Call `update_scene` \
with the updated scene JSON. If uniforms changed, call `update_ui_config` too.

3. **Explain / answer questions**: Just respond with text. No tool calls needed.

4. **Review (ALWAYS do this after creating or modifying)**: \
After `update_scene` succeeds, call `get_current_scene` one more time to read back \
the saved result. Compare it against the user's original request and verify:
   - Does the script logic actually implement what the user asked for?
   - Does the script use ctx.time for animation? (If not, it's likely a bug — fix it)
   - Are all requested visual elements present (colors, shapes, effects, animations)?
   - Are custom uniforms used correctly from ctx.uniforms?
   - Do UI controls cover all user-adjustable parameters?
If you find any mismatch or missing detail, fix it immediately by calling \
`update_scene` / `update_ui_config` again. Briefly summarize what you verified \
in your final response to the user.

## RULES

- **ALWAYS use ctx.time for animation.** This is a real-time rendering tool — \
visuals should move, evolve, and feel alive. Unless the user explicitly asks for \
a static image, every script MUST incorporate ctx.time to create motion \
(e.g. animation, pulsing, rotation, color cycling, morphing, flowing, etc.). \
A static scene is almost always wrong.
- If `update_scene` returns validation errors, fix the issues and call it again.
- When modifying, preserve parts of the scene the user didn't ask to change.
- Always respond in the SAME LANGUAGE the user is using.
- For "create" requests, generate both the scene and UI config.
- For small modifications that don't change uniforms, you may skip update_ui_config.
- Custom uniforms go in the "uniforms" field of scene JSON, and are accessed \
in scripts via `ctx.uniforms.u_name`.
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
            "Useful for exploring the project structure (source code, etc.). "
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
            "code, engine internals, and patterns before generating new code."
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
    {
        "name": "open_panel",
        "description": (
            "Open a custom HTML/CSS/JS panel as a draggable node in the UI. "
            "The panel runs in a sandboxed iframe with a bridge API for communicating "
            "with the WebGL engine (read/write uniforms, access time/frame/mouse). "
            "Use this to create interactive controls, data visualizations, info displays, "
            "or any custom UI that complements the WebGL scene."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Unique identifier for this panel (e.g. 'controls', 'info', 'viz').",
                },
                "title": {
                    "type": "string",
                    "description": "Title shown in the panel header.",
                },
                "html": {
                    "type": "string",
                    "description": "Complete HTML document to render in the panel iframe. Can include <style> and <script> tags.",
                },
                "width": {
                    "type": "number",
                    "description": "Initial width in pixels (default 320).",
                },
                "height": {
                    "type": "number",
                    "description": "Initial height in pixels (default 300).",
                },
            },
            "required": ["id", "title", "html"],
        },
    },
    {
        "name": "close_panel",
        "description": "Close a previously opened custom panel by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The ID of the panel to close.",
                },
            },
            "required": ["id"],
        },
    },
    {
        "name": "start_recording",
        "description": (
            "Start recording the WebGL canvas to a WebM video file. "
            "The recording runs in the browser and auto-downloads when stopped. "
            "If duration is specified, recording stops automatically after that many seconds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "duration": {
                    "type": "number",
                    "description": "Optional duration in seconds. Recording stops automatically after this time.",
                },
                "fps": {
                    "type": "number",
                    "description": "Frames per second for the recording (default 30).",
                },
            },
        },
    },
    {
        "name": "stop_recording",
        "description": "Stop an in-progress canvas recording. The WebM file will auto-download in the browser.",
        "input_schema": {
            "type": "object",
            "properties": {},
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

        await broadcast({
            "type": "scene_update",
            "scene_json": scene,
        })

        return "ok — script mode scene saved and broadcast."

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
                result_text = f"File: {filename} ({info['size']} bytes, {mime})\n\n{content}"
            else:
                result_text = (
                    f"Binary file: {filename}\n"
                    f"Size: {info['size']} bytes\n"
                    f"MIME type: {mime}\n"
                    f"This is a binary file. Its contents cannot be displayed as text.\n"
                    f"If it's an image, the user may have sent it via vision (check the conversation).\n"
                    f"The file is accessible at: /api/uploads/{filename}"
                )

            # Append processed derivatives info
            manifest = workspace.read_processed_manifest(filename)
            if manifest:
                proc_name = manifest.get("processor_name", "Unknown")
                status = manifest.get("status", "unknown")
                stem = workspace.get_processed_dir(filename).name
                result_text += f"\n\n--- Processed Derivatives ---\n"
                result_text += f"Processor: {proc_name} ({status})\n"
                for out in manifest.get("outputs", []):
                    out_url = f"/api/uploads/processed/{stem}/{out['filename']}"
                    result_text += f"- {out['filename']}: {out['description']}\n"
                    result_text += f"  URL: {out_url}\n"
                meta = manifest.get("metadata", {})
                if meta:
                    result_text += f"Metadata: {json.dumps(meta)}\n"

            return result_text
        except FileNotFoundError:
            return f"File not found: {filename}"

    elif name == "list_uploaded_files":
        files = workspace.list_uploads()
        if not files:
            return "No files have been uploaded yet."
        # Filter out processed/ subdirectory files from the main listing
        main_files = [f for f in files if not f.startswith("processed/")]
        if not main_files:
            return "No files have been uploaded yet."
        info_lines = []
        for f in main_files:
            try:
                info = workspace.get_upload_info(f)
                line = f"- {f} ({info['size']} bytes, {info['mime_type']})"

                # Check for processed derivatives
                manifest = workspace.read_processed_manifest(f)
                if manifest:
                    proc_name = manifest.get("processor_name", "Unknown")
                    status = manifest.get("status", "unknown")
                    line += f"\n  Processed by: {proc_name} ({status})"
                    stem = workspace.get_processed_dir(f).name
                    for out in manifest.get("outputs", []):
                        out_url = f"/api/uploads/processed/{stem}/{out['filename']}"
                        line += f"\n    - {out['filename']}: {out['description']} ({out_url})"

                info_lines.append(line)
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

    elif name == "open_panel":
        panel_id = input_data.get("id", "")
        title = input_data.get("title", "Panel")
        html = input_data.get("html", "")
        width = input_data.get("width", 320)
        height = input_data.get("height", 300)
        if not panel_id:
            return "Error: 'id' is required."
        if not html:
            return "Error: 'html' is required."
        await broadcast({
            "type": "open_panel",
            "id": panel_id,
            "title": title,
            "html": html,
            "width": width,
            "height": height,
        })
        return f"ok — panel '{panel_id}' opened."

    elif name == "close_panel":
        panel_id = input_data.get("id", "")
        if not panel_id:
            return "Error: 'id' is required."
        await broadcast({
            "type": "close_panel",
            "id": panel_id,
        })
        return f"ok — panel '{panel_id}' closed."

    elif name == "start_recording":
        msg = {"type": "start_recording"}
        duration = input_data.get("duration")
        fps = input_data.get("fps")
        if duration is not None:
            msg["duration"] = duration
        if fps is not None:
            msg["fps"] = fps
        await broadcast(msg)
        duration_str = f" for {duration}s" if duration else ""
        return f"ok — recording started{duration_str}."

    elif name == "stop_recording":
        await broadcast({"type": "stop_recording"})
        return "ok — recording stopped. The WebM file will auto-download in the user's browser."

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
