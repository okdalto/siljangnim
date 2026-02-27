"""
PromptGL — Claude Agent SDK based single-agent pipeline.

A single agent handles intent analysis, shader generation, UI control creation,
and conversational replies using custom MCP tools for scene/UI management.
"""

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
- Grid layout: int cols = int(ceil(sqrt(float(u_instance_count))));

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

### blend factors
zero, one, src_color, one_minus_src_color, dst_color, one_minus_dst_color, \
src_alpha, one_minus_src_alpha, dst_alpha, one_minus_dst_alpha

### blend equations
add, subtract, reverse_subtract, min, max

### depth functions
never, less, equal, lequal, greater, notequal, gequal, always

### cull faces
back, front, front_and_back

### Advanced technique guide

- **Line rendering**: `"draw_mode": "lines"` + custom vertex shader that \
positions vertices. Pair with `"geometry": "quad"` or custom vertex count.
- **Point rendering**: `"draw_mode": "points"` + set `gl_PointSize` in \
the vertex shader.
- **Trail / accumulation effects**: `"clear": {"color": false}` so previous \
frame persists, combine with `"blend": {"src": "src_alpha", "dst": "one_minus_src_alpha"}`.
- **GPGPU / simulation**: `"texture_format": "rgba32f"` for full-precision \
float storage, `"double_buffer": true` + self-reference input for state pingpong.
- **Additive blending**: `"blend": {"src": "one", "dst": "one"}` — great \
for particles, glow, volumetric light.
- **Premultiplied alpha**: `"blend": {"src": "one", "dst": "one_minus_src_alpha"}`.
- **Depth control**: `"depth": {"test": true, "write": false, "func": "lequal"}` \
for transparent 3D objects rendered after opaque ones.

Example — additive particle output:
```json
"output": {
  "fragment": "...",
  "vertex": "...",
  "geometry": "quad",
  "draw_mode": "points",
  "instance_count": 10000,
  "blend": {"src": "one", "dst": "one"},
  "depth": {"test": false},
  "clear": {"color_value": [0, 0, 0, 1]}
}
```

## MULTIPASS PATTERNS

- Blur: BufferA renders scene, output samples BufferA with offset UVs
- Feedback: BufferA with double_buffer=true AND self-reference input \
  ("inputs": {"iChannel0": {"type": "buffer", "name": "BufferA"}})
- Simulation: BufferA stores state as color values with double_buffer=true + \
  self-reference input, output visualizes it
- IMPORTANT: double_buffer alone is NOT enough. The buffer's "inputs" MUST \
  explicitly include itself for the engine to bind the previous frame texture.

## CREATIVE CODING RECIPES

Reference recipes for generative / algorithmic art techniques. Each includes \
the core GLSL pattern and required scene config so you can implement them \
immediately when the user asks.

### 1. Signed Distance Fields (SDF) & Ray Marching
Render 3D scenes by marching rays against distance functions — no mesh needed.
- Scene config: single output pass, geometry: "quad"
- Core GLSL:
```
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 d = abs(p)-b; return length(max(d,0.0))+min(max(d.x,max(d.y,d.z)),0.0); }
float opSmoothUnion(float d1, float d2, float k) { float h=clamp(0.5+0.5*(d2-d1)/k,0.,1.); return mix(d2,d1,h)-k*h*(1.-h); }
// Ray march: for(int i=0;i<128;i++){float d=map(ro+rd*t); if(d<0.001)break; t+=d;}
// Normal: vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
```

### 2. Reaction-Diffusion (Gray-Scott)
Classic Gray-Scott model producing organic spots, stripes, and coral patterns.
- Scene config: BufferA with double_buffer: true, texture_format: "rgba32f", \
self-reference input. Output reads BufferA for visualization.
- Core GLSL (BufferA):
```
// RG channels = (A, B) concentrations. Laplacian via 3x3 kernel:
vec2 lap = -state.xy + 0.2*(tl+tr+bl+br).xy + 0.05*(t+b+l+r).xy; // weighted neighbors
float feed = 0.037, kill = 0.06;
float reaction = state.x * state.y * state.y;
float dA = 1.0*lap.x - reaction + feed*(1.0 - state.x);
float dB = 0.5*lap.y + reaction - (kill+feed)*state.y;
fragColor = vec4(state.x + dA*dt, state.y + dB*dt, 0., 1.);
```

### 3. Fluid Simulation (Navier-Stokes 2D)
Velocity advection + pressure solve for real-time 2D fluid.
- Scene config: 3-4 buffers (velocity, pressure, divergence, dye), all \
double_buffer: true, texture_format: "rgba32f". Jacobi iteration requires \
multiple pressure-solve passes — use a single buffer with ~20-40 iterations \
inside the shader or approximate with fewer passes.
- Core GLSL (advection):
```
vec2 vel = texture(iVelocity, uv).xy;
vec2 pastUV = uv - vel * u_dt; // semi-Lagrangian back-trace
fragColor = texture(iSelf, pastUV); // advected quantity
```
- Core GLSL (pressure Jacobi):
```
float div = divergence(uv);
float pL=p(uv-dx), pR=p(uv+dx), pT=p(uv+dy), pB=p(uv-dy);
float pressure = (pL+pR+pT+pB - div) * 0.25;
```

### 4. Simplex / FBM Noise
Procedural noise layered via fractional Brownian motion for organic textures.
- Scene config: single output pass, geometry: "quad". No special buffers needed.
- Core GLSL:
```
// Include a simplex3D(vec3) or snoise(vec2) function (Ashima/Stefan Gustavson).
float fbm(vec2 p) {
  float v=0., a=0.5; for(int i=0;i<6;i++){v+=a*snoise(p); p*=2.0; a*=0.5;} return v;
}
// Domain warping: float n = fbm(p + vec2(fbm(p+vec2(1.7,9.2)), fbm(p+vec2(8.3,2.8))));
```

### 5. Voronoi / Worley Noise
Cell-based patterns — nearest-point distance, cell IDs, edge detection.
- Scene config: single output pass, geometry: "quad"
- Core GLSL:
```
vec2 ip = floor(p), fp = fract(p);
float md = 1e9;
for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
  vec2 n = vec2(x,y);
  vec2 pt = hash2(ip+n); // random per-cell point
  float d = length(n+pt-fp);
  md = min(md, d);
}
// md = F1 distance. Track F2 for edges: edge = F2-F1.
```

### 6. L-System / Fractal Branching
Recursive tree-like structures in a fragment shader using polar coordinates.
- Scene config: single output pass, geometry: "quad"
- Core GLSL:
```
// Convert to polar, reflect & scale iteratively:
for(int i=0;i<8;i++){
  p = abs(p); // mirror
  p -= vec2(0.5, 0.4); // translate branch point
  p *= mat2(cos(a),-sin(a),sin(a),cos(a)); // rotate by branch angle a
  p *= 1.5; // scale up (zoom into branch)
}
float d = length(p.x); // distance to branch skeleton
```

### 7. Bezier Curves
Render smooth curves via SDF distance to quadratic/cubic Bezier.
- Scene config: single output pass, geometry: "quad". \
Alternatively use draw_mode: "line_strip" with custom vertex shader for polyline approximation.
- Core GLSL (quadratic Bezier SDF):
```
// Approximate: subdivide into segments or use analytic cubic solve.
// Simple approach — evaluate closest point on curve:
float t = clamp(dot(p-A, B-A)/dot(B-A,B-A), 0., 1.); // for line segment A-B
vec2 cp = mix(mix(A,B,t), mix(B,C,t), t); // quadratic interp
float d = length(p - cp); // approximate distance
fragColor = vec4(vec3(smoothstep(0.02, 0.0, d)), 1.);
```

### 8. Flocking / Boids Simulation
Texture-based agent state — separation, alignment, cohesion computed per texel.
- Scene config: BufferA (agent state: xy=pos, zw=vel) with double_buffer: true, \
texture_format: "rgba32f", self-reference input. Each texel = one agent. \
Output visualizes as points or quads.
- Core GLSL (BufferA):
```
// For each agent at texel (i), scan neighbors:
vec2 sep=vec2(0.), ali=vec2(0.), coh=vec2(0.); float cnt=0.;
for(int j=0;j<N;j++){
  vec4 other = texelFetch(iSelf, ivec2(j,0), 0);
  vec2 diff = pos - other.xy; float d = length(diff);
  if(d>0.&&d<radius){ sep+=diff/d; ali+=other.zw; coh+=other.xy; cnt++; }
}
vel += normalize(sep)*wSep + normalize(ali/cnt-vel)*wAli + normalize(coh/cnt-pos)*wCoh;
```

### 9. Particle Systems
GPU-driven particles via instancing — position/velocity in texture or vertex shader.
- Scene config: output or buffer with draw_mode: "points", instance_count: N, \
custom vertex shader. blend: {src:"one",dst:"one"} for additive glow. \
Optional: BufferA (rgba32f, double_buffer) for physics state.
- Core vertex GLSL:
```
int id = gl_InstanceID;
vec2 uv = vec2(float(id%cols)+0.5, float(id/cols)+0.5) / float(cols);
vec4 state = texture(iParticles, uv); // xy=pos, zw=vel
gl_Position = vec4(state.xy * 2.0 - 1.0, 0., 1.);
gl_PointSize = 4.0;
```

### 10. Gaussian Splatting (2D)
Point-sprite rendering with Gaussian falloff for soft blob / splat visuals.
- Scene config: draw_mode: "points", instance_count: N, \
blend: {src:"one",dst:"one"} or {src:"src_alpha",dst:"one_minus_src_alpha"}, \
depth: {test:false}. Custom vertex + fragment shaders.
- Core fragment GLSL:
```
vec2 pc = gl_PointCoord * 2.0 - 1.0; // -1..1 within point sprite
float g = exp(-dot(pc,pc) * 3.0);     // Gaussian falloff
fragColor = v_color * vec4(vec3(1.), g);
```

### 11. Domain Warping
Layer fBM noise outputs to distort UV coordinates for painterly / marble textures.
- Scene config: single output pass, geometry: "quad"
- Core GLSL:
```
vec2 q = vec2(fbm(p), fbm(p + vec2(5.2,1.3)));
vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7,9.2) + 0.15*u_time),
              fbm(p + 4.0*q + vec2(8.3,2.8) + 0.126*u_time));
float f = fbm(p + 4.0*r);
// Color by f — mix between palette colors based on f value.
```

### 12. Fractals (Mandelbrot / Julia)
Complex-plane iteration with orbit trap or smooth coloring.
- Scene config: single output pass, geometry: "quad". Add uniforms for \
zoom center (vec2), zoom level (float), Julia constant (vec2).
- Core GLSL:
```
vec2 c = (gl_FragCoord.xy/u_resolution - 0.5) * zoom + center;
vec2 z = c; // Mandelbrot. For Julia: z=scaled_uv, c=u_julia_c
int iter = 0;
for(int i=0;i<256;i++){ z = vec2(z.x*z.x-z.y*z.y, 2.*z.x*z.y)+c; if(dot(z,z)>4.) break; iter=i; }
float t = float(iter) - log2(log2(dot(z,z))); // smooth iteration count
fragColor = vec4(palette(t * 0.02), 1.);
```

### 13. Trail / Feedback Art
Accumulate frames without clearing — apply UV distortion for swirling trails.
- Scene config: BufferA with double_buffer: true, self-reference input, \
clear: {color: false}. Or output with clear: {color: false}. \
blend: {src:"src_alpha",dst:"one_minus_src_alpha"} for alpha fade.
- Core GLSL:
```
vec2 warp_uv = uv + vec2(sin(uv.y*6.+u_time)*0.003, cos(uv.x*6.+u_time)*0.003);
vec4 prev = texture(iSelf, warp_uv) * 0.98; // fade previous frame
vec4 newStroke = drawShape(uv); // new content this frame
fragColor = max(prev, newStroke); // composite
```

### 14. Halftone / Dithering
Print-aesthetic dot patterns via quantized grid sampling.
- Scene config: BufferA renders source image/scene. Output applies halftone \
post-process reading BufferA. geometry: "quad"
- Core GLSL:
```
float gridSize = 8.0;
vec2 cell = floor(gl_FragCoord.xy / gridSize) * gridSize + gridSize*0.5;
float lum = dot(texture(iChannel0, cell/u_resolution).rgb, vec3(0.299,0.587,0.114));
float dist = length(fract(gl_FragCoord.xy/gridSize) - 0.5);
float dot_size = lum; // brighter = bigger dot
fragColor = vec4(vec3(step(dist, dot_size * 0.5)), 1.);
```

### 15. Morphogenesis / Turing Patterns
Reaction-diffusion variant with anisotropic or multi-species diffusion.
- Scene config: same as recipe 2 (double_buffer, rgba32f, self-reference). \
Add more species in extra channels or use multiple buffers.
- Core GLSL:
```
// Multi-species: RGB channels = 3 interacting chemicals
vec3 lap = laplacian(uv); // 3x3 kernel per channel
vec3 reaction = vec3(
  a.x*(1.-a.x) - a.y*a.x*4.0 + feed*(1.-a.x),
  a.y*(a.x - a.z) - decay*a.y,
  a.z*(a.y - 1.) + feed2*(1.-a.z)
);
fragColor = vec4(a + (diffRate*lap + reaction)*u_dt, 1.);
```

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

Do NOT create controls for auto-provided uniforms (u_time, u_resolution, etc.).
Create intuitive labels (e.g. "Glow Intensity" not "u_glow").
"inspectable_buffers" lists buffer names useful to inspect in separate viewports.

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
        await broadcast_fn({
            "type": "scene_update",
            "scene_json": scene,
        })
        return {
            "content": [
                {"type": "text", "text": "ok — scene saved and broadcast to clients."}
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

    return [get_current_scene, update_scene, update_ui_config]


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
        model="claude-sonnet-4-20250514",
        mcp_servers={"promptgl": mcp_server},
        allowed_tools=[
            "mcp__promptgl__get_current_scene",
            "mcp__promptgl__update_scene",
            "mcp__promptgl__update_ui_config",
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

async def run_agent(
    ws_id: int,
    user_prompt: str,
    log: LogCallback,
    broadcast: BroadcastCallback,
) -> dict:
    """Run the Claude Agent SDK agent for one user prompt.

    Returns {"chat_text": str} with the agent's conversational reply.
    """
    await log("System", f"Starting agent for: \"{user_prompt}\"", "info")

    client = await _get_or_create_client(ws_id, broadcast)

    await client.query(user_prompt)

    last_text = ""

    async for message in client.receive_response():
        # Stream assistant messages
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    last_text = block.text
                    await log("Agent", block.text, "info")
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
