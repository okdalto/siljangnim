# MEDIAPIPE VISION (Face / Pose / Hand Tracking)

Use `ctx.mediapipe` to track face mesh, body pose, and hand landmarks in real-time
from a webcam or video source. The WASM runtime and models are lazy-loaded from CDN
on first `init()` — no extra packages needed.

## Initialization

Call `ctx.mediapipe.init(options)` once in setup (returns a Promise). Options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tasks` | string[] | `['pose']` | Subset of `['pose', 'hands', 'faceMesh']` |
| `delegate` | string | `'GPU'` | `'GPU'` or `'CPU'` inference backend |
| `maxPoses` | number | 1 | Max simultaneous poses |
| `maxHands` | number | 2 | Max simultaneous hands |
| `maxFaces` | number | 1 | Max simultaneous faces |

## Detection

Call `ctx.mediapipe.detect(source, timestamp?)` each frame with an
`HTMLVideoElement`, `HTMLImageElement`, or `HTMLCanvasElement`. This runs
detection and uploads results to GPU textures in one call. The timestamp
parameter (ms) is optional and defaults to `performance.now()`.

## Properties (read-only, updated after each detect call)

| Property | Type | Description |
|----------|------|-------------|
| `ctx.mediapipe.initialized` | boolean | True after init() completes |
| `ctx.mediapipe.pose` | array\|null | 33 landmarks `{x, y, z, visibility}` (first person) |
| `ctx.mediapipe.hands` | array\|null | `[hand0, hand1]`, each 21 landmarks `{x, y, z}` |
| `ctx.mediapipe.faceMesh` | array\|null | 478 landmarks `{x, y, z}` (first face) |
| `ctx.mediapipe.poseTexture` | WebGLTexture | 33×1 RGBA32F — `texelFetch(tex, ivec2(i, 0), 0)` → (x, y, z, visibility) |
| `ctx.mediapipe.handsTexture` | WebGLTexture | 21×2 RGBA32F — row 0 = hand 0, row 1 = hand 1 |
| `ctx.mediapipe.faceMeshTexture` | WebGLTexture | 478×1 RGBA32F — (x, y, z, 1.0) |

**Coordinate system**: x and y are normalized 0-1 (origin = top-left of the input image).
z is relative depth (smaller = closer to camera). In shaders, use `1.0 - y` for GL Y-flip.

## Example — Webcam + Pose landmarks

```javascript
// setup
const cam = await ctx.utils.initWebcam();
ctx.state.cam = cam;
await ctx.mediapipe.init({ tasks: ['pose'] });

const vs = ctx.utils.DEFAULT_QUAD_VERTEX_SHADER;
const fs = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform sampler2D uWebcam;
uniform sampler2D uPoseLandmarks;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 cam = texture(uWebcam, vec2(uv.x, 1.0 - uv.y));
  fragColor = cam;
  // Draw circles at each landmark
  for (int i = 0; i < 33; i++) {
    vec4 lm = texelFetch(uPoseLandmarks, ivec2(i, 0), 0);
    vec2 lmPos = vec2(lm.x, 1.0 - lm.y);  // flip Y for GL
    float d = distance(uv, lmPos);
    if (d < 0.01 && lm.w > 0.5) {
      fragColor = vec4(0.0, 1.0, 0.0, 1.0);
    }
  }
}`;
ctx.state.prog = ctx.utils.createProgram(vs, fs);
// ... create VAO + quad buffer ...

// render
if (ctx.state.cam) {
  ctx.utils.updateVideoTexture(ctx.state.cam.texture, ctx.state.cam.video);
  ctx.mediapipe.detect(ctx.state.cam.video);
  const gl = ctx.gl;
  gl.useProgram(ctx.state.prog);
  gl.uniform2f(gl.getUniformLocation(ctx.state.prog, 'uResolution'),
    ctx.canvas.width, ctx.canvas.height);
  // bind uWebcam to unit 0, uPoseLandmarks to unit 1
  // ... draw fullscreen quad ...
}

// cleanup
if (ctx.state.cam) {
  ctx.state.cam.stream.getTracks().forEach(t => t.stop());
  ctx.gl.deleteTexture(ctx.state.cam.texture);
}
```

Always tell the user the browser will ask for camera permission when using webcam + MediaPipe.
