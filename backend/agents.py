"""
siljangnim — Direct Anthropic API single-agent pipeline.

A single agent handles intent analysis, WebGL2 script generation, UI control creation,
and conversational replies using tool calls for scene/UI management.
"""

import asyncio
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Callable, Awaitable, Any

import anthropic

import workspace

# ---------------------------------------------------------------------------
# Project path constants
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

_IGNORED_DIRS = {
    ".git", "node_modules", ".venv", "__pycache__", "dist",
    ".next", ".cache", ".DS_Store", ".vite",
}

_ALLOWED_COMMANDS = {"pip", "ffmpeg", "ffprobe", "convert", "magick"}


def _resolve_project_path(path: str) -> Path | None:
    """Resolve a path relative to project root. Returns None if outside root."""
    resolved = (_PROJECT_ROOT / path).resolve()
    if not str(resolved).startswith(str(_PROJECT_ROOT.resolve())):
        return None
    return resolved

LogCallback = Callable[[str, str, str], Awaitable[None]]
BroadcastCallback = Callable[[dict], Awaitable[None]]

# ---------------------------------------------------------------------------
# Conversation history: WebSocket ID → message list (persisted to disk)
# ---------------------------------------------------------------------------

_conversations: dict[int, list[dict]] = {}


def _get_conversation_file() -> Path:
    """Return the conversation file path inside the active workspace."""
    return workspace.get_workspace_dir() / "conversation.json"

# Future for ask_user tool — resolved when the user answers
_user_answer_future: asyncio.Future | None = None


def _save_conversations() -> None:
    """Persist conversation history to disk."""
    try:
        conv_file = _get_conversation_file()
        conv_file.parent.mkdir(parents=True, exist_ok=True)
        conv_file.write_text(
            json.dumps(_conversations, ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass


def load_conversations() -> None:
    """Load conversation history from disk.

    Called after workspace.init_workspace() so the active workspace is set.
    """
    global _conversations
    try:
        conv_file = _get_conversation_file()
        if conv_file.exists():
            data = json.loads(conv_file.read_text(encoding="utf-8"))
            # JSON keys are strings — convert back to int
            _conversations = {int(k): v for k, v in data.items()}
        else:
            _conversations = {}
    except (OSError, json.JSONDecodeError, ValueError):
        _conversations = {}

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


def _get_nested(obj, path):
    """Get a value from a nested dict using dot-path notation."""
    keys = path.split(".")
    for key in keys:
        if isinstance(obj, dict):
            if key not in obj:
                raise KeyError(f"Key '{key}' not found")
            obj = obj[key]
        else:
            raise TypeError(f"Cannot traverse into non-dict at '{key}'")
    return obj


def _delete_nested(obj, path):
    """Delete a key from a nested dict using dot-path notation."""
    keys = path.split(".")
    for key in keys[:-1]:
        if isinstance(obj, dict):
            if key not in obj:
                raise KeyError(f"Key '{key}' not found")
            obj = obj[key]
        else:
            raise TypeError(f"Cannot traverse into non-dict at '{key}'")
    final_key = keys[-1]
    if isinstance(obj, dict) and final_key in obj:
        del obj[final_key]
    else:
        raise KeyError(f"Key '{final_key}' not found")


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
You are the siljangnim Agent — a single AI assistant for a real-time visual \
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
| ctx.audio | object | Audio playback & analysis (see below) |

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
- "color": needs default (hex string like "#ff0000" or "#ff000080" with alpha). \
Outputs vec4 [r, g, b, a] to the uniform. Use vec4 uniform type for colors. \
The alpha slider (0-100%) is always shown below the color picker.
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
- "graph": editable curve for transfer functions, easing, falloff, etc. \
Needs min (number), max (number), default (array of [x,y] control points). \
Uniform stores the control points array. In scripts, use \
ctx.utils.sampleCurve(ctx.uniforms.u_curve, t) to sample (t: 0-1 → y value). \
Example: `{"type":"graph","label":"Falloff","uniform":"u_falloff",\
"min":0,"max":1,"default":[[0,1],[0.5,0.8],[1,0]]}`.

Create intuitive labels (e.g. "Glow Intensity" not "u_glow").

## UPLOADED FILES

Users can upload files (images, 3D models, text files, etc.) to the chat. \
When files are attached:

- **Images** (PNG, JPG, GIF, WebP): You can see them directly via vision. \
Describe what you see and suggest how to use the image \
(as a texture, reference, color palette source, etc.). \
The image is saved to the uploads directory and accessible at `/api/uploads/<filename>`. \
To use an uploaded image as a texture in a script, fetch it and create a WebGL texture.
- **3D models** (OBJ, FBX, glTF, GLB): Use `read_uploaded_file` to read the file contents. \
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
  `read_uploaded_file` and use the `samples` array for static audio visualization.
- `spectrogram.png`: Spectrogram image (1024x512). Use as a texture input for \
  static frequency-domain visualization.
- For real-time audio-reactive visuals, use `ctx.audio.load('/api/uploads/<filename>')` \
  to load the original audio file and access live FFT data via \
  `ctx.audio.bass/mid/treble/energy/fftTexture`.

### Video files (.mp4, .webm, .mov)
- `frame_NNN.png`: Uniformly sampled keyframes (up to 30, 512px max dimension). \
  Use individual frames as texture inputs.
- `video_metadata.json`: Duration, FPS, resolution, and frame timestamps.

### 3D Model files (.obj, .fbx, .gltf, .glb)
- `geometry.json`: Contains mesh geometry and optional skeletal/animation data. \
  Load via `read_uploaded_file`. Fields:
  - **Always present**: `positions` (flat float array, 3 per vertex), `normals`, \
    `uvs` (2 per vertex), `indices`, `vertex_count`, `face_count`, `bounds`.
  - **`materials`** (optional): Array of `{name, diffuse_color:[r,g,b], \
    specular_color, emissive_color, opacity, shininess, diffuse_texture, \
    normal_texture}`. When `diffuse_texture` is present, load it as an image: \
    `ctx.utils.loadImage(derivativeUrl + '/' + mat.diffuse_texture)`.
  - **`skeleton`** (optional): `{bones: [{name, parent, inverse_bind_matrix}], \
    bone_indices: [4 per vertex, flat ints], bone_weights: [4 per vertex, flat floats]}`. \
    For GPU skinning, upload `bone_indices` and `bone_weights` as vertex attributes, \
    pass per-bone matrices as a uniform array, and compute skinned positions in the \
    vertex shader: \
    `vec4 skinned = weight.x * bones[idx.x] * pos + weight.y * bones[idx.y] * pos + ...`
  - **`animations`** (optional): `[{name, duration, tracks: [{bone_index, property, \
    times, values}]}]`. `property` is `"translation"`, `"rotation"`, or `"scale"`. \
    `values` are interleaved (3 floats per keyframe for translation/scale, \
    4 for rotation quaternions in glTF). Interpolate between keyframes using the \
    `times` array, compose bone-local transforms, multiply along the hierarchy, \
    then multiply by each bone's `inverse_bind_matrix` to get the final skinning matrix.
- `texture_N.png|jpg`: Extracted texture images (embedded textures from FBX/glTF). \
  Load via `ctx.utils.loadImage(derivativeUrl + '/texture_0.png')`.
- **Warning — skeletal animation is extremely error-prone.** The most common mistakes:
  1. **Missing bind-pose translation**: If a bone only has rotation keyframes in the \
     animation data, you still MUST use its bind-pose translation (from the skeleton \
     hierarchy), NOT (0,0,0). Otherwise the limbs will collapse to the origin.
  2. **Euler rotation order**: FBX uses ZYX intrinsic rotation order. You must compose \
     the quaternion/matrix as Rz·Ry·Rx. Using the wrong order (e.g. Rx·Ry·Rz) produces \
     spiky, distorted meshes. Always implement `fromEulerZYX(rx, ry, rz)`.
  3. **Matrix multiplication order**: The final skinning matrix for a bone is \
     `worldMatrix * inverseBindMatrix`. The world matrix is computed root-to-leaf: \
     `parentWorld * localMatrix`. Getting this order backwards will invert the skeleton.
  4. **Bind-pose vs animated transform**: For bones without animation tracks, use \
     their rest/bind-pose transform, not identity.
  5. **Unskinned vertices cause spikes**: Some vertices may have zero bone weights \
     (all four weights are 0). These stay locked in bind pose while their skinned \
     neighbors move, creating sharp spikes. When you detect unskinned vertices, \
     propagate weights from adjacent skinned vertices (find neighbors via the index \
     buffer, copy their bone indices/weights) so the entire mesh deforms smoothly.
  Recommendation: render the static bind pose first and verify the mesh looks correct \
  before adding animation playback.

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

## AUDIO PLAYBACK & ANALYSIS

Use `ctx.audio` to load audio files, play them in sync with the timeline, \
and access real-time FFT data for audio-reactive visuals.

### Methods

| Method | Description |
|--------|-------------|
| `ctx.audio.load(url)` | Load audio file → `Promise`. Use `/api/uploads/<filename>` for uploaded files |
| `ctx.audio.play(offset?)` | Start playback (optionally from offset in seconds) |
| `ctx.audio.pause()` | Pause playback |
| `ctx.audio.stop()` | Stop and reset to beginning |
| `ctx.audio.setVolume(v)` | Set volume (0-1) |

### Properties (read-only, updated every frame)

| Property | Type | Description |
|----------|------|-------------|
| `ctx.audio.isLoaded` | boolean | True after `load()` completes |
| `ctx.audio.isPlaying` | boolean | True while audio is playing |
| `ctx.audio.duration` | float | Total duration in seconds |
| `ctx.audio.currentTime` | float | Current playback position in seconds |
| `ctx.audio.bass` | float | Low-frequency energy (0-1) |
| `ctx.audio.mid` | float | Mid-frequency energy (0-1) |
| `ctx.audio.treble` | float | High-frequency energy (0-1) |
| `ctx.audio.energy` | float | Overall energy (0-1) |
| `ctx.audio.frequencyData` | Uint8Array | Raw FFT bins (1024 values, 0-255) |
| `ctx.audio.waveformData` | Uint8Array | Time-domain waveform (1024 values, centered at 128) |
| `ctx.audio.fftTexture` | WebGLTexture | 1024x2 R8 texture (row 0=frequency, row 1=waveform) |
| `ctx.audio.volume` | float | Current volume level |

Audio playback is automatically synchronized with the timeline (pause, seek, loop).

### Example — Audio-reactive visual

```javascript
// setup
ctx.audio.load('/api/uploads/music.mp3').then(() => {
  ctx.audio.play();
});

const vs = ctx.utils.DEFAULT_QUAD_VERTEX_SHADER;
const fs = `#version 300 es
precision highp float;
uniform float uBass, uMid, uTreble, uTime;
uniform vec2 uResolution;
uniform sampler2D uAudioData;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  // Sample FFT texture (row 0 = frequency)
  float freq = texture(uAudioData, vec2(uv.x, 0.25)).r;
  // Visualize frequency bars
  float bar = step(uv.y, freq);
  vec3 col = mix(vec3(0.1, 0.2, 0.5), vec3(1.0, 0.3, 0.1), uBass);
  fragColor = vec4(col * bar, 1.0);
}`;
ctx.state.prog = ctx.utils.createProgram(vs, fs);
const positions = ctx.utils.createQuadGeometry();
const vao = ctx.gl.createVertexArray();
ctx.gl.bindVertexArray(vao);
const buf = ctx.gl.createBuffer();
ctx.gl.bindBuffer(ctx.gl.ARRAY_BUFFER, buf);
ctx.gl.bufferData(ctx.gl.ARRAY_BUFFER, positions, ctx.gl.STATIC_DRAW);
ctx.gl.enableVertexAttribArray(0);
ctx.gl.vertexAttribPointer(0, 2, ctx.gl.FLOAT, false, 0, 0);
ctx.state.vao = vao;
ctx.state.buf = buf;

// render
const gl = ctx.gl;
gl.viewport(0, 0, ctx.resolution[0], ctx.resolution[1]);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.useProgram(ctx.state.prog);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'uBass'), ctx.audio.bass);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'uMid'), ctx.audio.mid);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'uTreble'), ctx.audio.treble);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'uTime'), ctx.time);
gl.uniform2f(gl.getUniformLocation(ctx.state.prog, 'uResolution'), ctx.resolution[0], ctx.resolution[1]);
if (ctx.audio.fftTexture) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ctx.audio.fftTexture);
  gl.uniform1i(gl.getUniformLocation(ctx.state.prog, 'uAudioData'), 0);
}
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);

// cleanup
ctx.gl.deleteProgram(ctx.state.prog);
ctx.gl.deleteBuffer(ctx.state.buf);
ctx.gl.deleteVertexArray(ctx.state.vao);
ctx.audio.stop();
```

## FILE ACCESS

You can explore the project source code to understand the engine, existing code, \
and UI components before generating code.

- `list_files(path)`: List directory contents (project-wide, read-only)
- `read_file(path)`: Read any project file (read-only, 50KB limit)
- `write_file(path, content)`: Write files (restricted to .workspace/ only)

Paths are relative to the project root. Use these to understand \
existing patterns before writing scripts.

## CODE EXECUTION

You can run Python code and limited shell commands to process data, \
convert files, or install packages.

- `run_python(code)`: Execute Python code in the active workspace directory. \
Use this to parse uploaded files, transform data, generate textures, \
or create any WebGL-ready assets. Has access to all installed packages.
- `run_command(command)`: Run whitelisted commands (pip, ffmpeg, ffprobe, \
convert, magick). Use `pip install <package>` to install missing dependencies.

Example use cases:
- Font parsing failed? Write Python code using fonttools to extract glyph data
- Need a spectrogram? Run ffmpeg to convert audio
- Missing a package? `pip install librosa`
- Custom data processing for uploaded files

## CUSTOM PANELS

You can create custom HTML/CSS/JS panels that appear as draggable nodes in the UI. \
Use `open_panel` to create a panel and `close_panel` to remove it.

**Bridge API** — Every panel iframe automatically has a `window.panel` object:

```js
// ── Uniforms ──
panel.setUniform("u_speed", 2.5);
panel.uniforms   // {u_speed: 2.5, u_color: [1,0,0], ...}

// ── Timeline state (updated every frame) ──
panel.time       // current time in seconds
panel.frame      // current frame number
panel.mouse      // [x, y, pressed, prevPressed]
panel.duration   // timeline duration in seconds
panel.loop       // whether timeline loops

// ── Keyframes ──
panel.keyframes  // { u_speed: [{time, value, inTangent, outTangent, linear}, ...], ... }

// Set keyframes for a uniform (replaces the entire track)
panel.setKeyframes("u_pos_x", [
  { time: 0, value: 0, inTangent: 0, outTangent: 0, linear: false },
  { time: 5, value: 2.0, inTangent: 0, outTangent: 0.5, linear: false },
]);

// Clear all keyframes for a uniform
panel.clearKeyframes("u_pos_x");

// Set timeline duration and loop
panel.setDuration(60);
panel.setLoop(false);

// Register a callback that runs every frame
panel.onUpdate = function(p) {
  document.getElementById('time').textContent = p.time.toFixed(2);
};
```

The keyframe bridge enables building custom animation editors as panels — \
for example, a 3D path editor where the user can visually place keyframes \
and adjust Bezier curves for object positions.

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
- Keyframe animation editors — 3D path editors, Bezier curve editors, motion path tools
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

2. **Modify existing visual**: Use `read_scene_section` to read only the part \
you need to change (e.g. `script.render`, `uniforms`). Then use `edit_scene` to \
apply targeted edits — this is much more efficient than `update_scene` for \
modifications. Only use `update_scene` when rewriting the entire scene from scratch.

3. **Explain / answer questions**: Just respond with text. No tool calls needed.

4. **Review (ALWAYS do this after creating or modifying)**: \
After `update_scene` or `edit_scene` succeeds, call `read_scene_section("script.render")` \
to read back the key parts. Compare against the user's request and verify:
   - Does the script logic actually implement what the user asked for?
   - Does the script use ctx.time for animation? (If not, it's likely a bug — fix it)
   - Are all requested visual elements present (colors, shapes, effects, animations)?
   - Are custom uniforms used correctly from ctx.uniforms?
   - Do UI controls cover all user-adjustable parameters?
If you find any mismatch or missing detail, fix it immediately by calling \
`edit_scene` / `update_ui_config` again. Briefly summarize what you verified \
in your final response to the user.

5. **Reading large files**: Use `read_file` with `offset` and `limit` to read \
files in chunks. Start with the first ~100 lines, then decide if you need more.

## RULES

- **Do NOT generate or modify scenes for simple queries.** If the user is asking \
a question, browsing files, or requesting an explanation, just respond with text \
(and file-reading tools if needed). Do NOT call `update_scene` or `update_ui_config` \
unless the user explicitly asks to create or change a visual. Examples of simple queries:
  - "What is this?" → Just explain. No scene changes.
  - "Show me the files" → Use `list_files`, return the result. Done.
  - "What is WebGL?" → Answer the question. No tool calls needed.
  - "What does the current scene look like?" → Use `get_current_scene`, explain it. Do NOT modify it.
- **ALWAYS use ctx.time for animation.** This is a real-time rendering tool — \
visuals should move, evolve, and feel alive. Unless the user explicitly asks for \
a static image, every script MUST incorporate ctx.time to create motion \
(e.g. animation, pulsing, rotation, color cycling, morphing, flowing, etc.). \
A static scene is almost always wrong.
- If `update_scene` returns validation errors, fix the issues and call it again.
- When modifying, preserve parts of the scene the user didn't ask to change.
- Always respond in the SAME LANGUAGE the user is using.
- **Clarify before acting on ambiguous requests.** When a user's request is vague, \
has multiple reasonable interpretations, or lacks critical details, use the \
`ask_user` tool to ask clarifying questions BEFORE generating or modifying scenes. \
Provide 2-4 concrete options. Examples:
  - "Make a particle effect" → Ask: type (rain/explosion/fire/snow), color scheme, 3D or 2D
  - "Make it prettier" → Ask: which aspect (colors, animation, geometry, lighting)
  - "Add an effect" → Ask: what kind of effect
Do NOT use ask_user for clear, specific requests like "make the background red" or \
"add a speed slider from 0 to 5".
- For "create" requests, generate both the scene and UI config.
- For small modifications that don't change uniforms, you may skip update_ui_config.
- To **remove a control** from the inspector, call `update_ui_config` with a \
controls array that excludes the control you want to delete. For example, if the \
user says "remove the speed slider", read the current ui_config, filter out the \
control whose uniform or label matches, and call `update_ui_config` with the \
remaining controls.
- Custom uniforms go in the "uniforms" field of scene JSON, and are accessed \
in scripts via `ctx.uniforms.u_name`.

## KEYFRAME ANIMATION STATE

The user can set keyframe animations on uniforms via the UI. Keyframes \
override the static uniform value at runtime — the value animates over time.

Use `get_workspace_state` to read the current keyframe/timeline state. \
Use `update_workspace_state` to modify it (e.g. add/remove keyframes, \
change duration or loop).

### workspace_state.json schema
```json
{
  "version": 1,
  "keyframes": {
    "u_speed": [
      { "time": 0, "value": 0.5, "inTangent": 0, "outTangent": 0, "linear": false },
      { "time": 10, "value": 2.0, "inTangent": 0, "outTangent": 0, "linear": false }
    ]
  },
  "duration": 30,
  "loop": true
}
```

- `keyframes`: object mapping uniform names → sorted arrays of keyframe objects.
  - `time`: position in seconds on the timeline
  - `value`: the uniform value at that time
  - `inTangent` / `outTangent`: slope for cubic Hermite interpolation (0 = flat)
  - `linear`: if true, uses linear interpolation instead of cubic
- `duration`: total timeline length in seconds
- `loop`: whether the timeline loops

When creating animations, consider using keyframes for values that should \
change over time rather than hardcoding time-based math in the shader. \
When modifying scenes, always check `get_workspace_state` first to see if \
the user has existing keyframe animations that you should preserve or adapt.
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
        "name": "read_scene_section",
        "description": (
            "Read a specific section of scene.json using a dot-path. "
            "Much more efficient than get_current_scene when you only need "
            "a specific part. Examples: 'script.render', 'script.setup', "
            "'uniforms', 'uniforms.u_speed', 'clearColor'. "
            "Returns the value at that path as JSON."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Dot-separated path into scene.json (e.g. 'script.render', 'uniforms.u_speed').",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "update_scene",
        "description": (
            "Validate, save, and broadcast a COMPLETE scene JSON to all clients. "
            "Use this only when creating a new scene from scratch. "
            "For modifying existing scenes, prefer edit_scene instead."
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
        "name": "edit_scene",
        "description": (
            "Apply targeted edits to the current scene.json without replacing the whole file. "
            "Takes an array of edits, each with a dot-path and new value. "
            "Much more efficient than update_scene for modifications. "
            "The edited scene is validated, saved, and broadcast to clients. "
            "Supports 'set' (default) and 'delete' operations."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "edits": {
                    "type": "string",
                    "description": (
                        "JSON array of edit objects. Each has: "
                        "'path' (dot-separated target, e.g. 'script.render'), "
                        "'value' (new value — string, number, object, etc.), "
                        "'op' (optional: 'set' or 'delete', default 'set'). "
                        "Example: [{\"path\": \"script.render\", \"value\": \"const gl = ctx.gl;...\"}, "
                        "{\"path\": \"uniforms.u_new\", \"value\": {\"type\": \"float\", \"value\": 1.0}}]"
                    ),
                },
            },
            "required": ["edits"],
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
        "name": "get_workspace_state",
        "description": (
            "Read the current workspace state including keyframe animations, "
            "timeline duration, and loop setting. Returns the workspace_state.json "
            "contents, or defaults if no state exists. Use this to check existing "
            "keyframe animations before modifying scenes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "update_workspace_state",
        "description": (
            "Update the workspace state (keyframes, duration, loop). "
            "The state is saved to workspace_state.json and broadcast to all "
            "connected clients, immediately updating the timeline and keyframe "
            "editor in the UI. You can add/remove/modify keyframe tracks, "
            "change the timeline duration, or toggle looping."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_state": {
                    "type": "string",
                    "description": (
                        "Complete workspace state JSON string with 'version', "
                        "'keyframes', 'duration', and 'loop' fields."
                    ),
                },
            },
            "required": ["workspace_state"],
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
            "Read a project file by relative path. Returns file contents for text files, "
            "or metadata for binary files. Supports line-based pagination with offset/limit "
            "— use these to read large files in chunks instead of all at once. "
            "Returns total line count so you know if there's more to read."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from project root to the file to read.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Starting line number (1-based). Default: 1.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of lines to return. Default: all lines (up to 50KB).",
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
    {
        "name": "run_python",
        "description": (
            "Execute Python code in a sandboxed subprocess. "
            "Working directory is the active workspace. "
            "Can read project files, but can only write to .workspace/. "
            "Has access to installed packages (fonttools, numpy, Pillow, etc). "
            "Returns stdout and stderr. Timeout: 30 seconds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute.",
                },
            },
            "required": ["code"],
        },
    },
    {
        "name": "run_command",
        "description": (
            "Run a whitelisted shell command. "
            "Allowed commands: pip, ffmpeg, ffprobe, convert, magick. "
            "Working directory is the active workspace. Timeout: 60 seconds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute (must start with an allowed command).",
                },
            },
            "required": ["command"],
        },
    },
    {
        "name": "ask_user",
        "description": (
            "Ask the user a clarifying question when their request is ambiguous "
            "or could be interpreted in multiple ways. Provide 2-4 options. "
            "The agent will pause until the user responds."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The question to ask the user.",
                },
                "options": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "description": "Short option name"},
                            "description": {"type": "string", "description": "What this option means"},
                        },
                        "required": ["label", "description"],
                    },
                    "description": "2-4 options for the user to choose from.",
                },
            },
            "required": ["question", "options"],
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

    elif name == "read_scene_section":
        path = input_data.get("path", "")
        if not path:
            return "Error: 'path' is required."
        try:
            scene = workspace.read_json("scene.json")
        except FileNotFoundError:
            return "No scene.json exists yet."
        try:
            value = _get_nested(scene, path)
            if isinstance(value, str):
                return value
            return json.dumps(value, indent=2)
        except (KeyError, TypeError) as e:
            return f"Path '{path}' not found: {e}"

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

        try:
            workspace.write_json("scene.json", scene)
        except OSError as e:
            return f"Error writing scene.json: {e}"

        await broadcast({
            "type": "scene_update",
            "scene_json": scene,
        })

        return "ok — script mode scene saved and broadcast."

    elif name == "edit_scene":
        raw = input_data.get("edits", "")
        try:
            if isinstance(raw, str):
                edits = json.loads(raw)
            else:
                edits = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        if not isinstance(edits, list):
            return "Error: 'edits' must be a JSON array."

        try:
            scene = workspace.read_json("scene.json")
        except FileNotFoundError:
            return "No scene.json exists. Use update_scene to create one first."

        # Apply edits
        scene = json.loads(json.dumps(scene))  # deep copy
        warnings = []
        for i, edit in enumerate(edits):
            path = edit.get("path", "")
            op = edit.get("op", "set")
            if not path:
                warnings.append(f"Edit {i}: empty path, skipped")
                continue
            try:
                if op == "delete":
                    _delete_nested(scene, path)
                else:
                    _set_nested(scene, path, edit.get("value"))
            except (KeyError, TypeError) as e:
                warnings.append(f"Edit {i} ({op} '{path}'): {e}")

        errors = _validate_scene_json(scene)
        if errors:
            error_text = "Validation errors after edits:\n"
            error_text += "\n".join(f"  - {e}" for e in errors)
            if warnings:
                error_text += "\nEdit warnings:\n" + "\n".join(f"  - {w}" for w in warnings)
            return error_text

        try:
            workspace.write_json("scene.json", scene)
        except OSError as e:
            return f"Error writing scene.json: {e}"

        await broadcast({
            "type": "scene_update",
            "scene_json": scene,
        })

        result = f"ok — {len(edits)} edit(s) applied and broadcast."
        if warnings:
            result += "\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings)
        return result

    elif name == "update_ui_config":
        raw = input_data.get("ui_config", "")
        try:
            if isinstance(raw, str):
                ui_config = json.loads(raw)
            else:
                ui_config = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        try:
            workspace.write_json("ui_config.json", ui_config)
        except OSError as e:
            return f"Error writing ui_config.json: {e}"
        await broadcast({
            "type": "scene_update",
            "ui_config": ui_config,
        })
        return "ok — ui_config saved and broadcast to clients."

    elif name == "get_workspace_state":
        try:
            ws_state = workspace.read_json("workspace_state.json")
            return json.dumps(ws_state, indent=2)
        except FileNotFoundError:
            return json.dumps({"version": 1, "keyframes": {}, "duration": 30, "loop": True}, indent=2)

    elif name == "update_workspace_state":
        raw = input_data.get("workspace_state", "")
        try:
            if isinstance(raw, str):
                ws_state = json.loads(raw)
            else:
                ws_state = raw
        except json.JSONDecodeError as e:
            return f"Invalid JSON: {e}"

        # Ensure version field
        if "version" not in ws_state:
            ws_state["version"] = 1

        try:
            workspace.write_json("workspace_state.json", ws_state)
        except OSError as e:
            return f"Error writing workspace_state.json: {e}"

        await broadcast({
            "type": "workspace_state_update",
            "workspace_state": ws_state,
        })
        return "ok — workspace state saved and broadcast to clients."

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

        lines = content.splitlines(keepends=True)
        total_lines = len(lines)
        offset = max(1, input_data.get("offset", 1))
        limit = input_data.get("limit")

        # Apply pagination
        start_idx = offset - 1  # 1-based to 0-based
        if limit is not None and limit > 0:
            end_idx = min(start_idx + limit, total_lines)
        else:
            end_idx = total_lines

        selected = lines[start_idx:end_idx]
        result = "".join(selected)

        # Truncate if still too large
        max_size = 50_000
        truncated = ""
        if len(result) > max_size:
            result = result[:max_size]
            truncated = "\n... (truncated at 50KB)"

        header = f"File: {rel_path} ({file_size} bytes, {total_lines} lines)"
        if limit is not None or offset > 1:
            shown_start = offset
            shown_end = start_idx + len(selected)
            header += f" [showing lines {shown_start}-{shown_end}]"
            if shown_end < total_lines:
                header += f" — use offset={shown_end + 1} to read more"
        return f"{header}\n\n{result}{truncated}"

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
            resolved.relative_to(workspace._BASE_DIR.resolve())
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

    elif name == "run_python":
        code = input_data.get("code", "")
        if not code.strip():
            return "Error: empty code."
        gen_dir = workspace.get_workspace_dir()
        gen_dir.mkdir(parents=True, exist_ok=True)
        tmp_file = gen_dir / "_run_tmp.py"
        try:
            tmp_file.write_text(code, encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(tmp_file)],
                cwd=str(gen_dir),
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = result.stdout + result.stderr
            if len(output) > 50_000:
                output = output[:50_000] + "\n... (truncated at 50KB)"
            if not output.strip():
                output = "(no output)"
            return output
        except subprocess.TimeoutExpired:
            return "Error: execution timed out after 30 seconds."
        except Exception as e:
            return f"Error running Python code: {e}"
        finally:
            if tmp_file.exists():
                tmp_file.unlink()

    elif name == "run_command":
        command = input_data.get("command", "")
        if not command.strip():
            return "Error: empty command."
        try:
            args = shlex.split(command)
        except ValueError as e:
            return f"Error parsing command: {e}"
        if not args:
            return "Error: empty command after parsing."
        cmd_name = args[0]
        if cmd_name not in _ALLOWED_COMMANDS:
            return (
                f"Error: '{cmd_name}' is not allowed. "
                f"Allowed commands: {', '.join(sorted(_ALLOWED_COMMANDS))}"
            )
        # Rewrite pip to use the current Python interpreter
        if cmd_name == "pip":
            args = [sys.executable, "-m", "pip"] + args[1:]
        gen_dir = workspace.get_workspace_dir()
        gen_dir.mkdir(parents=True, exist_ok=True)
        try:
            result = subprocess.run(
                args,
                cwd=str(gen_dir),
                capture_output=True,
                text=True,
                timeout=60,
            )
            output = result.stdout + result.stderr
            if len(output) > 50_000:
                output = output[:50_000] + "\n... (truncated at 50KB)"
            if not output.strip():
                output = "(no output)"
            return output
        except subprocess.TimeoutExpired:
            return "Error: command timed out after 60 seconds."
        except FileNotFoundError:
            return f"Error: command '{cmd_name}' not found on this system."
        except Exception as e:
            return f"Error running command: {e}"

    elif name == "ask_user":
        global _user_answer_future
        question = input_data.get("question", "")
        options = input_data.get("options", [])
        _user_answer_future = asyncio.get_event_loop().create_future()
        await broadcast({
            "type": "agent_question",
            "question": question,
            "options": options,
        })
        answer = await _user_answer_future
        _user_answer_future = None
        return f"The user answered: {answer}"

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

_MAX_TURNS = 30
_MAX_COMPACT_RETRIES = 2


# ---------------------------------------------------------------------------
# Conversation compaction — reduce token usage when max_tokens is hit
# ---------------------------------------------------------------------------

def _compact_messages(messages: list[dict]) -> None:
    """Compact conversation history in-place to reduce token usage.

    1. Remove thinking blocks from assistant messages
    2. Truncate long tool_use inputs and tool_result contents
    3. Trim old turns, keeping first user message + recent turns
    4. Repeat trimming until estimated tokens are under the safe limit
    """
    _TRUNC = 200
    _SAFE_TOKENS = 120_000  # target after compaction (~4 chars/token)

    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            # Truncate plain-string user messages if very long
            if isinstance(content, str) and len(content) > 10_000:
                msg["content"] = content[:10_000] + "\n...(truncated)"
            continue

        # --- Strip thinking blocks from assistant messages ---
        if msg.get("role") == "assistant":
            filtered = [
                block for block in content
                if not (isinstance(block, dict) and block.get("type") == "thinking")
            ]
            # Keep at least a placeholder so content is never empty
            if not filtered:
                filtered = [{"type": "text", "text": "(thinking only)"}]
            msg["content"] = filtered
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

    # --- Progressively trim old turns until under token budget ---
    keep_recent = 6
    while len(messages) > 4:
        est = len(json.dumps(messages, ensure_ascii=False)) // 4
        if est <= _SAFE_TOKENS:
            break
        kept = [messages[0]] + messages[-keep_recent:]
        if len(kept) >= len(messages):
            # Can't trim further
            break
        messages.clear()
        messages.extend(kept)
        keep_recent = max(2, keep_recent - 2)


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

            # Pre-flight compaction: estimate token count (~4 chars/token)
            # and compact if approaching the 200k input limit.
            _est_tokens = len(json.dumps(messages, ensure_ascii=False)) // 4
            if _est_tokens > 150_000:
                await log("System", f"Estimated ~{_est_tokens} tokens — compacting before API call...", "info")
                if on_status:
                    await on_status("thinking", "Compacting conversation...")
                _compact_messages(messages)

            # Sanitize: remove any messages with empty content before API call
            messages[:] = [
                m for m in messages
                if m.get("content") not in (None, "", [], [{}])
            ]

            # Stream the API call so thinking/status updates reach the
            # frontend in real-time instead of blocking until completion.
            current_block_type = None
            thinking_chunks: list[str] = []
            thinking_len = 0

            try:
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
            except anthropic.BadRequestError as e:
                err_msg = str(e)
                if "prompt is too long" in err_msg or "non-empty content" in err_msg:
                    await log("System", f"Bad request — compacting and retrying: {err_msg[:200]}", "info")
                    if on_status:
                        await on_status("thinking", "Compacting conversation...")
                    _compact_messages(messages)
                    compact_retries += 1
                    if compact_retries > _MAX_COMPACT_RETRIES:
                        await log("System", "Max compact retries — cannot reduce further", "error")
                        break
                    continue
                raise
            except (anthropic.APIConnectionError, anthropic.APITimeoutError, anthropic.APIStatusError) as e:
                # Connection dropped mid-stream or server error (5xx)
                if isinstance(e, anthropic.APIStatusError) and e.status_code < 500:
                    raise  # only retry server errors, not client errors
                compact_retries += 1
                if compact_retries > _MAX_COMPACT_RETRIES:
                    await log("System", f"API error after retries: {e}", "error")
                    raise
                await log("System", f"Connection interrupted — retrying ({compact_retries}/{_MAX_COMPACT_RETRIES})...", "info")
                if on_status:
                    await on_status("thinking", "Connection lost, retrying...")
                import asyncio as _asyncio
                await _asyncio.sleep(2)
                continue
            except Exception as e:
                # Catch transient connection errors (e.g. httpx.RemoteProtocolError)
                err_str = str(e).lower()
                if any(k in err_str for k in ("incomplete chunked", "connection", "reset by peer", "timed out")):
                    compact_retries += 1
                    if compact_retries > _MAX_COMPACT_RETRIES:
                        await log("System", f"Connection error after retries: {e}", "error")
                        raise
                    await log("System", f"Connection interrupted — retrying ({compact_retries}/{_MAX_COMPACT_RETRIES})...", "info")
                    if on_status:
                        await on_status("thinking", "Connection lost, retrying...")
                    import asyncio as _asyncio
                    await _asyncio.sleep(2)
                    continue
                raise

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
                    is_error = False
                    try:
                        result_str = await _handle_tool(block.name, block.input, broadcast)
                        # Detect error strings returned by _handle_tool
                        if result_str and result_str.startswith("Error"):
                            is_error = True
                    except Exception as e:
                        result_str = f"Error executing tool '{block.name}': {e}"
                        is_error = True
                        await log("System", result_str, "error")
                    tr = {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_str or "(empty result)",
                    }
                    if is_error:
                        tr["is_error"] = True
                    tool_results.append(tr)

            messages.append({"role": "user", "content": tool_results})

            # If approaching turn limit, tell the agent to wrap up
            if turns == _MAX_TURNS - 1:
                messages.append({
                    "role": "user",
                    "content": "You are running out of turns. Please provide your final response now — summarize what you accomplished and any remaining issues.",
                })

        # Log completion
        await log(
            "System",
            f"Agent finished — turns: {turns}",
            "result",
        )

        chat_text = last_text or "Done."
        _save_conversations()
        return {"chat_text": chat_text}

    except Exception as e:
        # Log the error but preserve conversation history so the user
        # can continue from where they left off instead of losing context.
        _save_conversations()
        await log("System", f"Agent error (conversation preserved): {e}", "error")
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
    _save_conversations()


async def destroy_client(ws_id: int) -> None:
    """Clean up when a WebSocket disconnects."""
    # Don't clear — keep history so it survives refresh/reconnect
    pass
