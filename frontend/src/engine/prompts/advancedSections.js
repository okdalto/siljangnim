/**
 * Advanced prompt sections — ctx.utils, GLSL/WGSL rules, GPU simulation, debugging, etc.
 */

export const advancedSections = [
  {
    id: "ctx_utils",
    core: false,
    keywords: [
      "texture", "shader", "geometry", "sphere", "box", "plane", "quad",
      "webcam", "render target", "fbo", "curve", "텍스처",
      "matrix", "행렬", "quaternion", "쿼터니언", "ping pong", "핑퐁",
      "orbit", "camera", "카메라", "noise", "노이즈", "verlet", "physics", "물리",
    ],
    content: `\
### ctx.utils — helper functions

The engine exposes these utilities on \`ctx.utils\` for convenience:

| Function | Description |
|----------|-------------|
| \`ctx.utils.createProgram(vertSource, fragSource)\` | Compile & link a WebGL program from GLSL sources |
| \`ctx.utils.compileShader(type, source)\` | Compile a single shader (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER) |
| \`ctx.utils.createQuadGeometry()\` | Returns fullscreen quad positions (Float32Array, 6 verts, 2D) |
| \`ctx.utils.createBoxGeometry()\` | Returns unit box with positions, normals, uvs (36 verts, 3D) |
| \`ctx.utils.createSphereGeometry(segments?)\` | Returns UV sphere with indices (3D) |
| \`ctx.utils.createPlaneGeometry(w?, h?, wSegs?, hSegs?)\` | Returns XZ plane with indices (3D) |
| \`ctx.utils.DEFAULT_QUAD_VERTEX_SHADER\` | Default vertex shader for fullscreen quads |
| \`ctx.utils.DEFAULT_3D_VERTEX_SHADER\` | Default vertex shader for 3D geometry |
| \`ctx.utils.fetchJSON(url)\` | Fetch JSON from URL → \`Promise<object>\`. Use in setup to load external data (APIs, config files) |
| \`ctx.utils.fetchText(url)\` | Fetch text from URL → \`Promise<string>\`. Use for loading raw text, CSV, SVG, etc. |
| \`ctx.utils.fetchBuffer(url)\` | Fetch binary from URL → \`Promise<ArrayBuffer>\`. Use for loading binary data, models, etc. |
| \`ctx.utils.uploadTexture(texture, source)\` | Upload image/video/canvas to texture with Y-flip for GL |
| \`ctx.utils.loadImage(url)\` | Load image → \`Promise<{texture, width, height}>\` (Y-flipped) |
| \`ctx.utils.initWebcam()\` | Start webcam → \`Promise<{video, texture, stream}>\` |
| \`ctx.utils.updateVideoTexture(texture, video)\` | Refresh webcam/video texture each frame (Y-flipped) |
| \`ctx.utils.seekVideo(video, time)\` | Seek video to exact time (seconds) and wait for frame decode. **Always use this instead of raw video.currentTime + seeked event** — seeked alone doesn't guarantee the frame is decoded. Essential for frame-by-frame preprocess loops. |
| \`ctx.utils.registerVideo(video, opts?)\` | Register video for automatic time-sync during offline recording. Engine seeks it to ctx.time before each frame. opts: \`{loop: true}\` |
| \`ctx.utils.createRenderTarget(w, h, opts?)\` | FBO render target creation → \`{framebuffer, texture, width, height}\`. Store in \`ctx.state\`. opts: \`{internalFormat, format, type, filter, depth}\` |
| \`ctx.utils.sampleCurve(points, t)\` | Sample a graph control's curve at position t (0-1). \`points\` = \`ctx.uniforms.u_curve\` |
| \`ctx.utils.createMesh(prog, geometry)\` | Create a ready-to-draw mesh from geometry → \`{vao, draw(mode?), dispose()}\`. Automatically binds a_position, a_normal, a_uv attributes and index buffer. **Always prefer this over manual VAO/VBO setup.** |
| \`ctx.utils.getUniforms(prog)\` | Auto-discover and cache all uniform locations → \`{u_time: {set(v)}, u_resolution: {set(x,y)}, ...}\`. Call \`.set()\` with values matching the GLSL type. **Always prefer this over manual getUniformLocation calls.** |

**Y-coordinate note**: All texture upload utilities automatically flip Y to match \
GL coordinates (bottom-left origin). Mouse coordinates (\`ctx.mouse\`) are in \
screen space (0,0 = top-left, 1,1 = bottom-right). If you need GL-space mouse Y, \
use \`1.0 - ctx.mouse[1]\`.

#### createMesh + getUniforms example (recommended pattern)

\`\`\`js
// setup:
const prog = ctx.utils.createProgram(ctx.utils.DEFAULT_QUAD_VERTEX_SHADER, fragSrc);
const mesh = ctx.utils.createMesh(prog, ctx.utils.createQuadGeometry());
const u = ctx.utils.getUniforms(prog);
ctx.state = { prog, mesh, u };

// render:
gl.useProgram(ctx.state.prog);
ctx.state.u.u_time.set(ctx.time);
ctx.state.u.u_resolution.set(ctx.resolution[0], ctx.resolution[1]);
ctx.state.mesh.draw();

// cleanup:
gl.deleteProgram(ctx.state.prog);
ctx.state.mesh.dispose();
\`\`\`

---

### ctx.utils.mat4 — 4x4 Matrix operations

All functions return \`Float32Array(16)\` in column-major order. Pure math, no GL calls.

| Function | Description |
|----------|-------------|
| \`ctx.utils.mat4.identity()\` | Identity matrix |
| \`ctx.utils.mat4.perspective(fovDeg, aspect, near, far)\` | Perspective projection |
| \`ctx.utils.mat4.ortho(left, right, bottom, top, near, far)\` | Orthographic projection |
| \`ctx.utils.mat4.lookAt(eye, target, up)\` | View matrix from eye/target/up vectors |
| \`ctx.utils.mat4.multiply(a, b)\` | Multiply two 4x4 matrices |
| \`ctx.utils.mat4.invert(m)\` | Invert a 4x4 matrix |
| \`ctx.utils.mat4.transpose(m)\` | Transpose a 4x4 matrix |
| \`ctx.utils.mat4.fromTranslation(x, y, z)\` | Translation matrix |
| \`ctx.utils.mat4.fromScaling(x, y, z)\` | Scale matrix |
| \`ctx.utils.mat4.fromXRotation(rad)\` | Rotation around X axis |
| \`ctx.utils.mat4.fromYRotation(rad)\` | Rotation around Y axis |
| \`ctx.utils.mat4.fromZRotation(rad)\` | Rotation around Z axis |
| \`ctx.utils.mat4.fromEulerZYX(rx, ry, rz)\` | Rotation from Euler angles (degrees) |
| \`ctx.utils.mat4.transformPoint(m, [x,y,z])\` | Transform a 3D point → \`[x,y,z]\` |

### ctx.utils.quat — Quaternion operations

Quaternions are \`[x, y, z, w]\` arrays. Pure math, no GL calls.

| Function | Description |
|----------|-------------|
| \`ctx.utils.quat.create()\` | Identity quaternion \`[0,0,0,1]\` |
| \`ctx.utils.quat.fromAxisAngle(ax, ay, az, rad)\` | Quaternion from axis + angle |
| \`ctx.utils.quat.fromEuler(rx, ry, rz)\` | From Euler angles (degrees) |
| \`ctx.utils.quat.multiply(a, b)\` | Multiply two quaternions |
| \`ctx.utils.quat.normalize(q)\` | Normalize quaternion |
| \`ctx.utils.quat.conjugate(q)\` | Conjugate (inverse for unit quat) |
| \`ctx.utils.quat.rotateVec3(q, [x,y,z])\` | Rotate a 3D vector → \`[x,y,z]\` |
| \`ctx.utils.quat.toMat4(q)\` | Convert to 4x4 rotation matrix |
| \`ctx.utils.quat.fromMat4(m)\` | Extract quaternion from 4x4 matrix |
| \`ctx.utils.quat.slerp(a, b, t)\` | Spherical linear interpolation |
| \`ctx.utils.quat.nlerp(a, b, t)\` | Normalized linear interpolation (faster) |

### ctx.utils.createPingPong(w, h, opts?) — Ping-pong FBO

Creates a pair of FBOs for multi-pass rendering (e.g. fluid sim, blur).

Options: \`{ internalFormat, format, type, filter, depth, count }\` — \`count\` > 1 enables MRT.

\`\`\`js
// setup:
ctx.state.pp = ctx.utils.createPingPong(ctx.canvas.width, ctx.canvas.height, { type: gl.FLOAT, internalFormat: gl.RGBA32F });
// render:
gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.state.pp.write().framebuffer);
// ... draw pass ...
ctx.state.pp.swap();
gl.bindTexture(gl.TEXTURE_2D, ctx.state.pp.read().texture);
// cleanup:
ctx.state.pp.dispose();
\`\`\`

| Method | Description |
|--------|-------------|
| \`.read()\` | \`{ framebuffer, texture, textures[] }\` — current read target |
| \`.write()\` | \`{ framebuffer, texture, textures[] }\` — current write target |
| \`.swap()\` | Swap read/write targets |
| \`.resize(w, h)\` | Resize (recreates textures) |
| \`.dispose()\` | Free GL resources |

### ctx.utils.createOrbitCamera(opts?) — Orbit camera

Options: \`{ distance, theta, phi, target, damping, zoomSpeed, rotateSpeed, panSpeed }\`

\`\`\`js
// setup:
ctx.state.cam = ctx.utils.createOrbitCamera({ distance: 5 });
// render:
ctx.state.cam.update(ctx.mouse, ctx.mousePrev, ctx.mouseDown, ctx.keys, ctx.dt);
const view = ctx.state.cam.getViewMatrix();
const proj = ctx.state.cam.getProjectionMatrix(ctx.resolution[0]/ctx.resolution[1]);
\`\`\`

| Method | Description |
|--------|-------------|
| \`.update(mouse, mousePrev, mouseDown, keys, dt)\` | Update camera from input |
| \`.getViewMatrix()\` | Get 4x4 view matrix |
| \`.getProjectionMatrix(aspect, fov?, near?, far?)\` | Get 4x4 projection matrix |
| \`.getEye()\` | Get camera position \`[x,y,z]\` |
| \`.setTarget(x, y, z)\` | Set look-at target |
| \`.setDistance(d)\` | Set orbit distance |
| \`.setRotation(theta, phi)\` | Set angles (radians) |
| \`.zoom(delta)\` | Zoom by delta amount |
| \`.reset()\` | Reset to initial values |

Hold Shift + drag to pan.

### ctx.utils.noise — GLSL noise strings

GLSL code strings to prepend to fragment shaders. Each is a self-contained function block.

| Constant | Provides | Depends on |
|----------|----------|------------|
| \`ctx.utils.noise.HASH\` | \`hash1()\`, \`hash2()\`, \`hash3()\`, \`hash1v3()\` | — |
| \`ctx.utils.noise.SIMPLEX_3D\` | \`float snoise(vec3)\` | — (self-contained) |
| \`ctx.utils.noise.PERLIN_3D\` | \`float pnoise(vec3)\` | HASH |
| \`ctx.utils.noise.VALUE_3D\` | \`float vnoise(vec3)\` | HASH |
| \`ctx.utils.noise.FBM\` | \`float fbm(vec3, int octaves)\` | SIMPLEX_3D |
| \`ctx.utils.noise.VORONOI\` | \`vec2 voronoi(vec2)\` | HASH |

Usage: concatenate needed blocks into your shader source string:
\`\`\`js
const frag = '#version 300 es\\nprecision highp float;\\n'
  + ctx.utils.noise.HASH + ctx.utils.noise.SIMPLEX_3D + ctx.utils.noise.FBM
  + 'out vec4 fragColor;\\nvoid main() { float n = fbm(vec3(uv, time), 4); ... }';
\`\`\`

### ctx.utils.createVerletSystem(opts?) — 2D Verlet physics

Options: \`{ gravity: [gx,gy], damping, iterations, bounds: {x,y,w,h} }\`

\`\`\`js
// setup:
ctx.state.phys = ctx.utils.createVerletSystem({ gravity: [0, 980], bounds: { x: 0, y: 0, w: 800, h: 600 } });
const p0 = ctx.state.phys.addPoint(400, 100, true);  // pinned
const p1 = ctx.state.phys.addPoint(400, 200);
ctx.state.phys.addConstraint(p0, p1);
// render:
ctx.state.phys.step(ctx.dt);
const pts = ctx.state.phys.getPoints();
\`\`\`

| Method | Description |
|--------|-------------|
| \`.addPoint(x, y, pinned?)\` | Add point, returns id |
| \`.addConstraint(id1, id2, dist?)\` | Add distance constraint (auto-calculates dist if omitted) |
| \`.removePoint(id)\` | Remove point and its constraints |
| \`.removeConstraint(id)\` | Remove constraint |
| \`.step(dt)\` | Advance physics simulation |
| \`.getPoints()\` | \`[{id, x, y, px, py, pinned}]\` |
| \`.getConstraints()\` | \`[{id, p1, p2, dist}]\` |
| \`.clear()\` | Remove all points and constraints |`,
  },
  {
    id: "canvas2d_text",
    core: false,
    keywords: [
      "text", "font", "canvas 2d", "글자", "텍스트", "문자", "글씨",
    ],
    content: `\
### Canvas 2D text rendering

For text/shapes: create an offscreen Canvas 2D in setup, draw to it in render, \
then upload via \`gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d)\` \
and draw a fullscreen quad with the texture.`,
  },
  {
    id: "glsl_rules",
    core: false,
    keywords: [
      "shader", "glsl", "fragment", "vertex", "셰이더",
    ],
    content: `\
### GLSL rules (for shaders compiled via ctx.utils.createProgram)

- Always start with: #version 300 es
- Always include: precision highp float;
- Fragment output: out vec4 fragColor; (NOT gl_FragColor)
- Use in/out (NOT attribute/varying)
- Use texture() NOT texture2D()
- All built-in uniforms are float type`,
  },
  {
    id: "wgsl_rules",
    core: false,
    platforms: ["web-desktop"],
    keywords: ["wgsl", "webgpu", "compute", "pipeline", "bind group", "storage buffer", "atomic", "struct", "simulation"],
    content: `\
### WGSL Rules (for WebGPU backend)

When the scene targets WebGPU backend:
- Use WGSL shader syntax instead of GLSL
- Fragment output: @location(0) var<out> fragColor: vec4f
- Use @group(0) @binding(N) for resource bindings
- Vertex inputs use @location(N) annotations
- Functions: fn main() -> @location(0) vec4f { ... }
- Built-ins: @builtin(position), @builtin(vertex_index)
- Texture sampling: textureSample(t, s, uv)
- No implicit type conversions — explicit cast with f32(), i32(), etc.

### WGSL Types

**Scalars**: f32, i32, u32, bool
**Vectors**: vec2f, vec3f, vec4f, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u
**Matrices**: mat2x2f, mat3x3f, mat4x4f (column-major)
**Arrays**:
- Runtime-sized (in storage buffers): \`array<f32>\`, \`array<Particle>\`
- Fixed-size (local variables): \`array<vec3f, 3>\`, \`array<f32, 16>\`

### Structs

Define custom data types with \`struct\`. Fields use comma or semicolon separators:
\`\`\`wgsl
struct Particle {
    position: vec3f,
    velocity: vec3f,
    C: mat3x3f,
}
\`\`\`
Use structs in buffers: \`var<storage, read> particles: array<Particle>\`

### Atomic Operations

For concurrent read-write in compute shaders (e.g. grid accumulation):
- Atomic types: \`atomic<i32>\`, \`atomic<u32>\` (only in storage buffers)
- Operations: \`atomicAdd(&val, delta)\`, \`atomicSub\`, \`atomicMax\`, \`atomicMin\`, \`atomicAnd\`, \`atomicOr\`, \`atomicXor\`
- \`atomicLoad(&val)\` / \`atomicStore(&val, v)\` for read/write
- \`atomicCompareExchangeWeak(&val, cmp, v)\` for CAS
- Atomics only support i32/u32 — for f32, use fixed-point encoding:
\`\`\`wgsl
override multiplier: f32;  // pipeline-overridable constant
fn encodeFixedPoint(v: f32) -> i32 { return i32(v * multiplier); }
fn decodeFixedPoint(v: i32) -> f32 { return f32(v) / multiplier; }
\`\`\`

### Pipeline-Overridable Constants

Use \`override\` for values set at pipeline creation time (not at runtime):
\`\`\`wgsl
override workgroupSize: u32 = 64;
override gridScale: f32;
@compute @workgroup_size(workgroupSize) fn main(...) { ... }
\`\`\`
Set via \`ctx.renderer.createComputePipeline({ compute: { constants: { workgroupSize: 128, gridScale: 2.0 } } })\`

### Storage Buffer Access Modes

- \`var<storage, read>\` — read-only (most common for input data)
- \`var<storage, read_write>\` — read-write (for output / accumulation buffers)
- \`var<uniform>\` — small constants (max 64KB, must be 16-byte aligned)

### Compute Shaders (WebGPU only)
- \`@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { ... }\`
- Storage buffers: \`@group(0) @binding(0) var<storage, read_write> data: array<f32>\`
- Use for: particle simulation (MPM, SPH, DEM), fluid dynamics, grid-based accumulation, audio analysis
- Guard threads: \`if (id.x >= numParticles) { return; }\`
- Dispatch from JS: \`r.dispatch(pass, ceil(count / 64), 1, 1)\`

### ctx.renderer API (RendererInterface)

**Always use \`ctx.renderer\` for WebGPU scenes — never use raw GPUDevice/GPURenderPipeline.**

Core methods:

| Method | Description |
|--------|-------------|
| \`createShaderModule({ code, label? })\` | Create shader module from WGSL source |
| \`createRenderPipeline({ vertex, fragment, primitive?, depthStencil? })\` | Create render pipeline |
| \`createComputePipeline({ module, entryPoint?, constants?, label? })\` | Create compute pipeline. \`constants\`: pipeline-overridable constants object |
| \`createBuffer({ usage, size, data? })\` | Create GPU buffer. usage: string or array of strings — \`"vertex"\`, \`"index"\`, \`"uniform"\`, \`"storage"\`, \`"copy-src"\` |
| \`writeBuffer(handle, data, offset?)\` | Update buffer data |
| \`createTexture({ width, height, format?, usage? })\` | Create texture |
| \`writeTexture(handle, source, options?)\` | Upload image/canvas to texture |
| \`createSampler({ minFilter?, magFilter?, addressModeU?, addressModeV? })\` | Create sampler |
| \`createBindGroup({ pipeline, groupIndex?, entries: [{binding, resource}] })\` | Create bind group. Pass \`pipeline\` to auto-derive layout (recommended). \`groupIndex\` defaults to 0 |
| \`createBindGroupLayout({ entries })\` | Create explicit bind group layout (use native WebGPU entry format) |
| \`createPipelineLayout({ bindGroupLayouts })\` | Create pipeline layout from bind group layouts |
| \`createRenderTarget({ width, height, format?, depth? })\` | Create offscreen FBO |
| \`beginFrame()\` | Start frame → returns encoder |
| \`endFrame(encoder)\` | Submit commands |
| \`beginRenderPass(encoder, { colorAttachments, depthAttachment? })\` | Begin render pass |
| \`endRenderPass(pass)\` | End render pass |
| \`setPipeline(pass, pipeline)\` | Set active pipeline |
| \`setBindGroup(pass, index, bindGroup)\` | Bind resources |
| \`setVertexBuffer(pass, slot, buffer)\` | Set vertex buffer |
| \`setIndexBuffer(pass, buffer, format?)\` | Set index buffer |
| \`draw(pass, vertexCount, instances?, firstVertex?, firstInstance?)\` | Draw |
| \`drawIndexed(pass, indexCount, instances?, firstIndex?, baseVertex?, firstInstance?)\` | Draw indexed |
| \`destroyBuffer(handle)\` | Destroy buffer |
| \`destroyTexture(handle)\` | Destroy texture |
| \`destroyPipeline(handle)\` | Destroy pipeline |
| \`destroyBindGroup(handle)\` | Destroy bind group |
| \`destroyRenderTarget(handle)\` | Destroy render target |
| \`destroyShaderModule(handle)\` | Destroy shader module |
| \`beginComputePass(encoder, { label? })\` | Begin compute pass (WebGPU only) |
| \`endComputePass(pass)\` | End compute pass |
| \`setComputePipeline(pass, pipeline)\` | Set compute pipeline in compute pass |
| \`dispatch(pass, x, y?, z?)\` | Dispatch compute workgroups |
| \`readPixels(target?, x, y, w, h)\` | Read pixels from render target (async) |
| \`readStorageBuffer(buffer, TypedArrayClass?, byteOffset?, byteLength?)\` | Read GPU buffer back to CPU (async). Buffer must have \`"copy-src"\` usage |
| \`resize(width, height)\` | Resize the drawing surface |
| \`getCapabilities()\` | Returns \`{ backend, maxTextureSize, compute, storageBuffers, ... }\` |
| \`getNativeContext()\` | Get raw GPUDevice (WebGPU) or WebGL2RenderingContext |

### Bind Group Resource Types

\`createBindGroup({ entries: [{ binding: N, resource: { type, ... } }] })\`

| Resource type | Fields | Description |
|---------------|--------|-------------|
| \`"uniform-buffer"\` | \`{ buffer, offset?, size? }\` | Uniform buffer binding |
| \`"storage-buffer"\` | \`{ buffer, offset?, size? }\` | Storage buffer binding (read or read_write) |
| \`"read-only-storage-buffer"\` | \`{ buffer, offset?, size? }\` | Read-only storage buffer binding |
| \`"texture"\` | \`{ texture }\` | Texture binding |
| \`"sampler"\` | \`{ sampler }\` | Sampler binding |
| \`"storage-texture"\` | \`{ texture }\` | Read-write texture binding |

### WebGPU Compute Simulation Example (Particle System)

\`\`\`js
// setup:
const r = ctx.renderer;
const N = 100000;

// Create particle data buffer (position + velocity)
const initData = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  initData[i*4+0] = (Math.random()-0.5)*2; // x
  initData[i*4+1] = (Math.random()-0.5)*2; // y
  initData[i*4+2] = (Math.random()-0.5)*0.01; // vx
  initData[i*4+3] = (Math.random()-0.5)*0.01; // vy
}
const particleBuf = r.createBuffer({ usage: ["storage", "vertex"], data: initData });
const uniformBuf = r.createBuffer({ usage: ["uniform"], size: 16 });

// Compute shader: update particles
const computeModule = r.createShaderModule({ code: \`
  struct Params { dt: f32, count: u32, _pad: vec2f }
  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.count) { return; }
    var p = particles[id.x];
    p.x += p.z * params.dt;  // x += vx * dt
    p.y += p.w * params.dt;  // y += vy * dt
    // Bounce off walls
    if (abs(p.x) > 1.0) { p.z = -p.z; p.x = clamp(p.x, -1.0, 1.0); }
    if (abs(p.y) > 1.0) { p.w = -p.w; p.y = clamp(p.y, -1.0, 1.0); }
    particles[id.x] = p;
  }
\` });
const computePipeline = r.createComputePipeline({ module: computeModule, entryPoint: "main" });
const computeBG = r.createBindGroup({ pipeline: computePipeline, groupIndex: 0, entries: [
  { binding: 0, resource: { type: "uniform-buffer", buffer: uniformBuf } },
  { binding: 1, resource: { type: "storage-buffer", buffer: particleBuf } },
]});

// Render shader: draw particles as points
const renderModule = r.createShaderModule({ code: \`
  @vertex fn vs(@location(0) posvel: vec4f) -> @builtin(position) vec4f {
    return vec4f(posvel.xy, 0.0, 1.0);
  }
  @fragment fn fs() -> @location(0) vec4f {
    return vec4f(1.0, 0.6, 0.2, 1.0);
  }
\` });
const renderPipeline = r.createRenderPipeline({
  vertex: { module: renderModule, entryPoint: "vs",
    buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }] }]
  },
  fragment: { module: renderModule, entryPoint: "fs" },
  primitive: { topology: "point-list" },
});
ctx.state = { r, N, particleBuf, uniformBuf, computePipeline, computeBG, renderPipeline, computeModule, renderModule };

// render:
const s = ctx.state;
s.r.writeBuffer(s.uniformBuf, new Float32Array([ctx.dt, s.N, 0, 0]));
const enc = s.r.beginFrame();
// Step 1: compute pass — update particles
const cp = s.r.beginComputePass(enc, {});
s.r.setComputePipeline(cp, s.computePipeline);
s.r.setBindGroup(cp, 0, s.computeBG);
s.r.dispatch(cp, Math.ceil(s.N / 64));
s.r.endComputePass(cp);
// Step 2: render pass — draw particles
const rp = s.r.beginRenderPass(enc, { colorAttachments: [{ clearColor: [0,0,0,1] }] });
s.r.setPipeline(rp, s.renderPipeline);
s.r.setVertexBuffer(rp, 0, s.particleBuf);
s.r.draw(rp, s.N);
s.r.endRenderPass(rp);
s.r.endFrame(enc);
// Engine auto-blits WebGPU output to visible canvas after render

// cleanup:
const { r: rr } = ctx.state;
for (const h of [ctx.state.particleBuf, ctx.state.uniformBuf]) rr.destroyBuffer(h);
for (const h of [ctx.state.computePipeline, ctx.state.renderPipeline]) rr.destroyPipeline(h);
for (const h of [ctx.state.computeBG]) rr.destroyBindGroup(h);
for (const h of [ctx.state.computeModule, ctx.state.renderModule]) rr.destroyShaderModule(h);
\`\`\`

### Multi-Pipeline Pattern (Compute → Compute → Render)

For complex simulations (MPM, SPH) that need multiple compute passes per frame:
\`\`\`js
// render — chain compute passes then render:
const enc = r.beginFrame();
// Pass 1: scatter particles to grid
const p1 = r.beginComputePass(enc, {});
r.setComputePipeline(p1, scatterPipeline);
r.setBindGroup(p1, 0, scatterBG);
r.dispatch(p1, Math.ceil(numParticles / 64));
r.endComputePass(p1);
// Pass 2: grid update
const p2 = r.beginComputePass(enc, {});
r.setComputePipeline(p2, gridPipeline);
r.setBindGroup(p2, 0, gridBG);
r.dispatch(p2, Math.ceil(gridSize / 64));
r.endComputePass(p2);
// Pass 3: gather from grid back to particles
const p3 = r.beginComputePass(enc, {});
r.setComputePipeline(p3, gatherPipeline);
r.setBindGroup(p3, 0, gatherBG);
r.dispatch(p3, Math.ceil(numParticles / 64));
r.endComputePass(p3);
// Pass 4: render
const rp = r.beginRenderPass(enc, { colorAttachments: [{ clearColor: [0,0,0,1] }], depthAttachment: { clearDepth: 1.0 } });
r.setPipeline(rp, renderPipeline);
r.setBindGroup(rp, 0, renderBG);
r.setVertexBuffer(rp, 0, particleBuf);
r.draw(rp, numParticles);
r.endRenderPass(rp);
r.endFrame(enc);
// Engine auto-blits WebGPU output to visible canvas after render
\`\`\`

### WebGPU Fullscreen Quad Example

\`\`\`js
// setup:
const r = ctx.renderer;
const shader = r.createShaderModule({ code: \`
  struct Uniforms { time: f32, _pad1: f32, resolution: vec2f }
  @group(0) @binding(0) var<uniform> u: Uniforms;

  @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
    return vec4f(pos[i], 0, 1);
  }

  @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv = pos.xy / u.resolution;
    return vec4f(uv, sin(u.time)*0.5+0.5, 1.0);
  }
\` });
const pipeline = r.createRenderPipeline({ vertex: { module: shader, entryPoint: "vs" }, fragment: { module: shader, entryPoint: "fs" } });
const ubuf = r.createBuffer({ usage: ["uniform"], size: 16 });
const bindGroup = r.createBindGroup({ pipeline, groupIndex: 0, entries: [
  { binding: 0, resource: { type: "uniform-buffer", buffer: ubuf } },
]});
ctx.state = { r, pipeline, ubuf, bindGroup, shader };

// render:
const { r, pipeline, ubuf, bindGroup } = ctx.state;
r.writeBuffer(ubuf, new Float32Array([ctx.time, 0, ctx.resolution[0], ctx.resolution[1]]));
const enc = r.beginFrame();
const pass = r.beginRenderPass(enc, { colorAttachments: [{ clearColor: [0,0,0,1] }] });
r.setPipeline(pass, pipeline);
r.setBindGroup(pass, 0, bindGroup);
r.draw(pass, 3);
r.endRenderPass(pass);
r.endFrame(enc);
// Engine auto-blits WebGPU output to visible canvas after render

// cleanup:
const { r: rr, pipeline: p, ubuf: ub, bindGroup: bg, shader: sh } = ctx.state;
rr.destroyPipeline(p); rr.destroyBuffer(ub); rr.destroyBindGroup(bg); rr.destroyShaderModule(sh);
\`\`\`

### shaderTarget — Dual GLSL+WGSL Support

Use \`ctx.shaderTarget\` to write shaders that work on both backends:
- \`ctx.shaderTarget.dualFragment(glslBody, wgslBody, opts?)\` — Create a shader with both GLSL and WGSL versions
- \`ctx.shaderTarget.shaderSource({ glsl, wgsl, label? })\` — Wrap pre-written shader sources
- \`ctx.shaderTarget.selectShader(source, ctx.backendType)\` — Pick the right version for current backend

### Backend Awareness
- Check project metadata for backendTarget (auto/webgl/webgpu)
- When target is "webgpu", generate WGSL shaders and use \`ctx.renderer\`
- When target is "auto" or "webgl", generate GLSL and use \`ctx.gl\` (default)
- The shaderTarget system supports dual output (GLSL+WGSL) via dualFragment()`,
  },
  {
    id: "gpu_simulation",
    core: false,
    platforms: ["web-desktop", "web-mobile"],
    keywords: [
      "simulation", "particle", "physarum", "fluid", "compute",
      "ping-pong", "volume", "voxel", "agent", "trail",
      "시뮬레이션", "파티클", "유체", "볼륨",
    ],
    content: `\
### GPU Simulation Patterns (WebGL2)

WebGL2 has no compute shaders. Common workarounds:
- **Ping-pong FBOs**: Two textures alternating read/write for simulation state
- **Texture-based particles**: Store position/velocity in RGBA32F textures, update via fragment shader
- **Volume data**: 3D textures or 2D atlas approaches
- Use EXT_color_buffer_float for float FBOs, gl.drawBuffers for MRT`,
  },
  {
    id: "debugging",
    core: false,
    keywords: [
      "debug", "fix", "error", "broken", "not working", "디버그",
      "수정", "오류", "안 돼", "작동", "에러", "버그",
    ],
    content: `\
### Systematic Debugging

When fixing complex errors:

1. **Isolate the stage**: Identify which stage fails.
2. **Verify inputs before outputs**: Check data being uploaded before debugging shaders.
3. **Minimal reproduction**: Strip the scene to the simplest case.
4. **One change at a time**: After each fix, call \`check_browser_errors\`.
5. **Read before rewriting**: Always \`read_file\` the current state before applying fixes.`,
  },
  {
    id: "technique_catalog",
    core: false,
    keywords: [
      "fog", "cloud", "volumetric", "reaction", "diffusion", "metaball",
      "distortion", "bloom", "chromatic", "crt", "scanline", "sdf",
      "audio", "reactive", "particle", "burst", "orbit", "camera",
      "effect", "post-process", "post process",
      "안개", "구름", "블룸", "파티클", "왜곡", "이펙트",
    ],
    content: `\
## TECHNIQUE CATALOG (Template-First Generation)

When generating scenes, **prefer starting from a known technique template** \
rather than writing from scratch. The engine includes a built-in technique catalog \
with production-ready templates for common graphics techniques:

**Available techniques:**
- **Raymarch Fog**: Distance-based fog with raymarching
- **Volumetric Cloud**: FBM-based raymarched clouds
- **Reaction Diffusion**: Gray-Scott simulation via ping-pong FBO
- **Metaball**: 2D smooth-blending metaballs
- **Fluid Distortion**: Post-process warp/distortion effect
- **Bloom**: Multi-pass bloom post-processing
- **Chromatic Aberration**: RGB channel separation
- **CRT / Scanline**: Retro CRT monitor effect
- **SDF Basics**: 2D signed distance fields with smooth ops
- **Audio-reactive Pulse**: Frequency-driven visual pulse
- **Particle Burst**: GPU-simulated particle explosion
- **Orbit Camera Template**: 3D scene with orbit camera

**Template-first strategy**: When the user's request matches a known technique, \
use it as a starting point and customize. This produces more reliable, \
higher-quality results than blank generation. Combine multiple techniques \
(e.g. volumetric cloud + bloom + chromatic aberration) for rich visuals.`,
  },
  {
    id: "per_project_backend",
    core: false,
    platforms: ["web-desktop"],
    keywords: ["backend", "webgpu", "webgl", "target", "gpu", "hybrid", "compute"],
    content: `\
### Per-Project Backend Handling

Each project may specify a \`backendTarget\` in its scene metadata:
- \`"auto"\` (default): Use WebGL2 + GLSL. Use \`ctx.gl\` and \`ctx.utils\`.
- \`"webgl"\`: Force WebGL2. Same as auto.
- \`"webgpu"\`: Force WebGPU + WGSL. **Use \`ctx.renderer\` (RendererInterface)** for the abstraction API. \
For advanced use (raw compute shaders, atomic ops, storage buffers), you can also access the raw \`GPUDevice\` via \`ctx.renderer.getNativeContext()\`.
- \`"hybrid"\`: **WebGPU compute + WebGL2 rendering.** Both \`ctx.renderer\` (WebGPU) and \`ctx.gl\` (WebGL2) are available. \
Use WebGPU compute shaders for heavy simulation (particles, physics, fluid) and WebGL2 GLSL for rendering. \
If WebGPU is unavailable, the scene still loads (can fall back to CPU simulation).

### WebGPU Scene Workflow

When backendTarget is "webgpu", follow this pattern:

1. **Set backendTarget** to \`"webgpu"\` — pass \`backendTarget: "webgpu"\` in the \`write_scene\` tool call. \
This ensures WebGPU backend is initialized BEFORE the scene loads. Do NOT set it separately via write_file edits.
2. **setup**: Create resources via \`ctx.renderer\` (**always use the abstraction API**):
   - \`ctx.renderer.createShaderModule()\`, \`createRenderPipeline()\`, \`createComputePipeline()\`
   - \`ctx.renderer.createBuffer({ usage: ["storage", "vertex"], data })\` — usage is string array
   - \`ctx.renderer.createBindGroup({ pipeline, entries: [...] })\` — pass pipeline for auto layout
   - Store everything in \`ctx.state\`.
3. **render**: Draw each frame:
   - \`beginFrame()\` → compute/render passes → \`endFrame()\`
   - The engine automatically blits WebGPU output to the visible canvas after each frame
4. **cleanup**: Destroy all resources.

### blitToCanvas — Displaying WebGPU Output

The WebGPU backend renders to an internal OffscreenCanvas. The visible canvas uses WebGL2.
The engine **automatically calls \`ctx.utils.blitToCanvas()\`** after each render frame to copy \
the WebGPU output to the visible canvas. You do NOT need to call it manually (but calling it is harmless).

\`\`\`js
// render function pattern for WebGPU scenes:
function render(ctx) {
  const r = ctx.renderer;
  const enc = r.beginFrame();
  // ... compute passes, render passes ...
  r.endFrame(enc);
  // Engine automatically blits WebGPU output to visible canvas
}
\`\`\`

### Raw WebGPU Access (advanced — use only when ctx.renderer API is insufficient)

For rare cases where \`ctx.renderer\` doesn't expose a needed feature, you can access the raw GPUDevice:
\`\`\`js
const device = ctx.renderer.getNativeContext();     // GPUDevice
const gpuCanvas = ctx.renderer.canvas;               // OffscreenCanvas used by WebGPU
const gpuContext = ctx.renderer.context;              // GPUCanvasContext
const format = navigator.gpu.getPreferredCanvasFormat();
\`\`\`
**⚠ Prefer \`ctx.renderer\` for ALL operations** including compute pipelines, storage buffers, and atomic ops. \
The abstraction API fully supports compute: \`createComputePipeline()\`, \`beginComputePass()\`, \`dispatch()\`, etc. \
Raw device access bypasses error tracking and may cause silent failures.

When generating or modifying scenes:
1. Read the current backendTarget from scene metadata.
2. If target is "webgpu", use \`ctx.renderer\` for ALL rendering (WGSL) and compute.
3. If target is "hybrid", use \`ctx.renderer\` for compute + \`ctx.gl\` for rendering (GLSL). \
This is ideal when you need GPU-accelerated simulation but want to keep WebGL2 rendering.
4. If target is "auto" or absent, default to WebGL2/GLSL with \`ctx.gl\`.
5. When the user requests GPU-accelerated simulation with WebGL2 rendering, use \`backendTarget: "hybrid"\`.
6. When the user requests full WebGPU (compute + rendering in WGSL), use \`backendTarget: "webgpu"\`.
7. Never mix GLSL and WGSL in the same shader program — pick one based on the backend.
8. The engine auto-blits WebGPU output to the visible canvas after each render frame (webgpu mode only).
9. **CRITICAL**: Always include \`backendTarget\` in \`write_scene\` for WebGPU/hybrid scenes. Without it, the engine defaults to WebGL2 and \`ctx.renderer\` will not have a WebGPU device.

### Hybrid Mode: WebGPU Compute + WebGL2 Rendering

Set \`backendTarget: "hybrid"\` to enable this mode. **Both \`ctx.renderer\` (WebGPU) and \`ctx.gl\` (WebGL2) are available simultaneously.** \
The WebGPU backend runs on a separate OffscreenCanvas; the main canvas retains its WebGL2 context. \
Unlike \`"webgpu"\` mode, if WebGPU is unavailable the scene still loads (graceful degradation to CPU-only).

This enables a powerful hybrid pattern: **GPU compute simulation via WebGPU + high-quality rendering via WebGL2 GLSL**.

**When to use hybrid mode:**
- Heavy particle/physics simulation (MPM, SPH, DEM) that benefits from compute shaders
- Complex WebGL2 rendering pipeline (SSFR, deferred shading, multi-pass post-processing) that would be tedious to rewrite in WGSL
- Existing WebGL2 scenes that need GPU-accelerated simulation added

**Data flow: WebGPU compute → CPU readback → WebGL2 rendering**

\`\`\`js
// setup:
const r = ctx.renderer; // WebGPU
const gl = ctx.gl;       // WebGL2 — both available!

// 1. Create compute resources on WebGPU
const computeModule = r.createShaderModule({ code: computeWGSL });
const computePipeline = r.createComputePipeline({ module: computeModule, entryPoint: "main" });
// IMPORTANT: include "copy-src" in usage for CPU readback
const particleBuf = r.createBuffer({ usage: ["storage", "copy-src"], data: initData });
const computeBG = r.createBindGroup({ pipeline: computePipeline, entries: [
  { binding: 0, resource: { type: "storage-buffer", buffer: particleBuf } },
]});

// 2. Create WebGL2 rendering resources (GLSL shaders, VAOs, etc.)
const prog = ctx.utils.createProgram(vertGLSL, fragGLSL);
const mesh = ctx.utils.createMesh(prog, geometry);
const u = ctx.utils.getUniforms(prog);

// 3. Create a WebGL2 VBO for particle positions (will be updated each frame)
const glPosBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, glPosBuf);
gl.bufferData(gl.ARRAY_BUFFER, initData.byteLength, gl.DYNAMIC_DRAW);

ctx.state = { r, computePipeline, particleBuf, computeBG, computeModule, prog, mesh, u, glPosBuf };

// render:
const s = ctx.state;
const gl = ctx.gl;

// Step 1: Run compute shader on WebGPU
const enc = s.r.beginFrame();
const cp = s.r.beginComputePass(enc, {});
s.r.setComputePipeline(cp, s.computePipeline);
s.r.setBindGroup(cp, 0, s.computeBG);
s.r.dispatch(cp, Math.ceil(N / 64));
s.r.endComputePass(cp);
s.r.endFrame(enc);

// Step 2: Read compute results back to CPU
const cpuData = await s.r.readStorageBuffer(s.particleBuf, Float32Array);

// Step 3: Upload to WebGL2 and render with GLSL
gl.bindBuffer(gl.ARRAY_BUFFER, s.glPosBuf);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, cpuData);
gl.useProgram(s.prog);
// ... set uniforms, bindVertexArray, draw ...

// cleanup:
const { r: rr } = ctx.state;
rr.destroyBuffer(ctx.state.particleBuf);
rr.destroyPipeline(ctx.state.computePipeline);
rr.destroyBindGroup(ctx.state.computeBG);
rr.destroyShaderModule(ctx.state.computeModule);
gl.deleteProgram(ctx.state.prog);
ctx.state.mesh.dispose();
gl.deleteBuffer(ctx.state.glPosBuf);
\`\`\`

**Key rules for hybrid mode:**
- \`ctx.renderer.readStorageBuffer(buf, TypedArrayClass?)\` reads GPU buffer back to CPU. \
The buffer MUST have \`"copy-src"\` in its usage array.
- **render function can be \`async\`** — the engine handles returned Promises. \
Use \`await readStorageBuffer()\` in render to get compute results before WebGL2 drawing. \
Note: in real-time mode, async render runs fire-and-forget per frame (no backpressure). \
For heavy readbacks, consider reading every Nth frame and interpolating between updates.
- Do NOT call \`ctx.utils.blitToCanvas()\` in hybrid mode — you're rendering with WebGL2 directly to the visible canvas, not using WebGPU's render output.
- WebGPU compute and WebGL2 rendering use separate GPU contexts. The readback goes through CPU (typed array). \
For moderate data sizes (< 1M floats) this is fast enough for 60fps.

### IMPORTANT: GPU Resource Lifecycle

- **All GPU resources (buffers, pipelines, textures, bind groups, shader modules) MUST be created in \`setup\`, NOT in \`preprocess\`.**
- \`write_scene\` triggers a backend switch + scene reload, which **destroys the old GPUDevice** and creates a new one. Any GPU objects from a previous device become invalid.
- \`ctx.state\` is serialized to IndexedDB between scenes — **GPU objects (GPUBuffer, GPUTexture, GPUPipeline, etc.) cannot be serialized** and will be silently dropped from state.
- **Do NOT use \`run_preprocess\` to create GPU resources.** Preprocess is for data preparation (downloading data, computing CPU-side arrays, etc.), not for GPU initialization.
- Store GPU handles in \`ctx.state\` during setup (they persist in memory for the render loop), but understand they will NOT survive a scene reload.
- If setup fails, \`check_browser_errors\` will report both JavaScript exceptions and WebGPU validation errors (shader compilation errors, bind group mismatches, buffer size issues, etc.).

### WebGPU Debugging Tips

- When setup fails, always call \`check_browser_errors\` — it will show specific WebGPU validation errors.
- Common WebGPU errors: WGSL syntax errors, struct alignment issues (vec3f needs 16-byte alignment in uniform buffers), bind group layout mismatches, buffer size too small.
- For complex scenes, build incrementally: start with a minimal working pipeline, then add features one at a time. Do NOT write all shaders and pipelines in a single attempt.
- Test each pipeline separately before combining them.`,
  },
  {
    id: "glsl_snippets",
    core: false,
    keywords: [
      "sdf", "distance field", "color space", "hsv", "easing", "palette",
      "색공간", "이징", "signed distance", "smooth union", "remap",
    ],
    content: `\
### ctx.utils.glsl — GLSL snippet library

Pre-built GLSL function strings to inject into fragment shaders. Same pattern as \`ctx.utils.noise\`.

| Constant | Provides |
|----------|----------|
| \`ctx.utils.glsl.SDF_OPS\` | opUnion, opSubtraction, opIntersection, opSmoothUnion/Sub/Inter |
| \`ctx.utils.glsl.SDF_SHAPES\` | sdSphere, sdBox, sdTorus, sdPlane, sdCylinder |
| \`ctx.utils.glsl.COLOR_SPACE\` | rgb2hsv, hsv2rgb, srgbToLinear, linearToSrgb |
| \`ctx.utils.glsl.EASING\` | easeIn/Out/InOut Quad·Cubic·Elastic·Bounce |
| \`ctx.utils.glsl.MATH\` | remap, smootherstep, rot2, palette (Inigo Quilez) |

Usage — concatenate needed snippets into your shader source:
\`\`\`js
const frag = '#version 300 es\\nprecision highp float;\\n'
  + ctx.utils.glsl.SDF_SHAPES + ctx.utils.glsl.SDF_OPS + ctx.utils.glsl.MATH
  + 'uniform float u_time; uniform vec2 u_resolution; out vec4 fragColor;\\n'
  + 'void main() {\\n'
  + '  vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / u_resolution.y;\\n'
  + '  float d = opSmoothUnion(sdSphere(vec3(uv,0), 0.3), sdBox(vec3(uv,0), vec3(0.2)), 0.1);\\n'
  + '  vec3 col = palette(d + u_time, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0,0.33,0.67));\\n'
  + '  fragColor = vec4(col, 1.0);\\n'
  + '}';
\`\`\``,
  },
  {
    id: "fullscreen_effect",
    core: false,
    keywords: [
      "fullscreen", "effect", "post-process", "chain", "풀스크린", "이펙트",
      "후처리", "post process", "multi-pass", "멀티패스",
    ],
    content: `\
### ctx.utils.createFullscreenEffect(fragSrc, defaultUniforms?)

One-line fullscreen shader effect. Handles program creation, quad geometry, VAO, and uniform binding automatically.

Returns: \`{ prog, uniforms, draw(overrides?), drawToTarget(rt, overrides?), dispose() }\`

- \`draw()\` auto-binds \`u_time\`, \`u_resolution\`, \`u_mouse\` if present in the shader
- Pass custom uniform values via overrides: \`draw({ u_custom: 2.0 })\`

\`\`\`js
// setup:
const fragSrc = '#version 300 es\\nprecision highp float;\\n'
  + 'uniform float u_time; uniform vec2 u_resolution; out vec4 fragColor;\\n'
  + 'void main() { vec2 uv = gl_FragCoord.xy / u_resolution; fragColor = vec4(uv, sin(u_time)*0.5+0.5, 1.0); }';
ctx.state.fx = ctx.utils.createFullscreenEffect(fragSrc);

// render:
ctx.state.fx.draw({ u_custom: 2.0 });

// cleanup:
ctx.state.fx.dispose();
\`\`\`

### ctx.utils.createPostProcessChain(effects[])

Multi-pass post-processing chain using internal ping-pong FBOs.

Each effect: \`{ fragSrc: string, uniforms?: object }\`

The chain's shaders should sample from \`u_texture\` or \`u_input\` (texture unit 0).

\`\`\`js
// setup:
ctx.state.chain = ctx.utils.createPostProcessChain([
  { fragSrc: bloomFrag },
  { fragSrc: chromaticFrag },
  { fragSrc: crtFrag },
]);

// render (after rendering your scene to a render target):
ctx.state.chain.drawToScreen(sceneRenderTarget.texture);

// cleanup:
ctx.state.chain.dispose();
\`\`\``,
  },
];
