/**
 * techniqueKnowledgeBase — Graphics technique catalog for Siljangnim.
 *
 * Each technique contains working WebGL2 template code that uses the ctx API
 * (ctx.gl, ctx.utils, ctx.state, ctx.time, ctx.resolution, ctx.uniforms, etc.).
 *
 * Exports:
 *   - default: the full catalog array
 *   - findTechniques(query): keyword search returning sorted matches
 *   - getTechniqueById(id): lookup by id
 */

const VERT_QUAD = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const techniques = [
  // ─────────────────────────────────────────────
  // 1. Raymarch Fog
  // ─────────────────────────────────────────────
  {
    id: "raymarch_fog",
    name: "Raymarch Fog",
    category: "volumetric",
    tags: ["raymarch", "raymarching", "fog", "distance", "3d", "volumetric", "sphere", "sdf"],
    description:
      "Simple raymarching with distance-based fog. Renders a sphere on a plane with atmospheric fog that fades objects into the background.",
    difficulty: "intermediate",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';
const frag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'out vec4 fragColor;\\n' +
  'float sdSphere(vec3 p, float r) { return length(p) - r; }\\n' +
  'float sdPlane(vec3 p) { return p.y; }\\n' +
  'float scene(vec3 p) {\\n' +
  '  float s = sdSphere(p - vec3(0.0, 1.0, 0.0), 1.0);\\n' +
  '  float pl = sdPlane(p);\\n' +
  '  return min(s, pl);\\n' +
  '}\\n' +
  'vec3 calcNormal(vec3 p) {\\n' +
  '  vec2 e = vec2(0.001, 0.0);\\n' +
  '  return normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy), scene(p+e.yxy)-scene(p-e.yxy), scene(p+e.yyx)-scene(p-e.yyx)));\\n' +
  '}\\n' +
  'void main() {\\n' +
  '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;\\n' +
  '  vec3 ro = vec3(3.0 * sin(u_time * 0.3), 2.0, 3.0 * cos(u_time * 0.3));\\n' +
  '  vec3 ta = vec3(0.0, 0.5, 0.0);\\n' +
  '  vec3 ww = normalize(ta - ro);\\n' +
  '  vec3 uu = normalize(cross(ww, vec3(0,1,0)));\\n' +
  '  vec3 vv = cross(uu, ww);\\n' +
  '  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);\\n' +
  '  float t = 0.0;\\n' +
  '  for (int i = 0; i < 80; i++) {\\n' +
  '    float d = scene(ro + rd * t);\\n' +
  '    if (d < 0.001 || t > 50.0) break;\\n' +
  '    t += d;\\n' +
  '  }\\n' +
  '  vec3 col = vec3(0.5, 0.6, 0.75);\\n' +
  '  if (t < 50.0) {\\n' +
  '    vec3 p = ro + rd * t;\\n' +
  '    vec3 n = calcNormal(p);\\n' +
  '    vec3 light = normalize(vec3(1.0, 2.0, 1.5));\\n' +
  '    float diff = max(dot(n, light), 0.0);\\n' +
  '    float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 32.0);\\n' +
  '    col = vec3(0.2) + vec3(0.8) * diff + vec3(1.0) * spec * 0.5;\\n' +
  '  }\\n' +
  '  float fogAmount = 1.0 - exp(-t * 0.08);\\n' +
  '  vec3 fogColor = vec3(0.5, 0.6, 0.75);\\n' +
  '  col = mix(col, fogColor, fogAmount);\\n' +
  '  col = pow(col, vec3(0.4545));\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';
ctx.state.prog = ctx.utils.createProgram(vert, frag);
ctx.state.quad = ctx.utils.createQuadGeometry();
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.state.quad.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(ctx.state.prog);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(ctx.state.prog, 'u_resolution'), ctx.canvas.width, ctx.canvas.height);
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.prog);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {},
    requiredUtils: ["createProgram", "createQuadGeometry"],
  },

  // ─────────────────────────────────────────────
  // 2. Volumetric Cloud
  // ─────────────────────────────────────────────
  {
    id: "volumetric_cloud",
    name: "Volumetric Cloud",
    category: "volumetric",
    tags: ["cloud", "volumetric", "fbm", "noise", "raymarch", "sky", "atmosphere", "3d"],
    description:
      "Raymarched volumetric clouds using FBM noise. Renders a sky dome with drifting, lit clouds that respond to a virtual sun direction.",
    difficulty: "advanced",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';
const frag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'out vec4 fragColor;\\n' +
  ctx.utils.noise.HASH +
  ctx.utils.noise.SIMPLEX_3D +
  ctx.utils.noise.FBM +
  'void main() {\\n' +
  '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;\\n' +
  '  vec3 ro = vec3(0.0, 1.5, 0.0);\\n' +
  '  vec3 rd = normalize(vec3(uv, 1.0));\\n' +
  '  vec3 sunDir = normalize(vec3(0.6, 0.4, -0.8));\\n' +
  '  // sky gradient\\n' +
  '  vec3 sky = mix(vec3(0.4, 0.6, 0.9), vec3(0.15, 0.3, 0.6), rd.y * 0.5 + 0.5);\\n' +
  '  float sun = pow(max(dot(rd, sunDir), 0.0), 64.0);\\n' +
  '  sky += vec3(1.0, 0.9, 0.6) * sun;\\n' +
  '  // raymarch clouds\\n' +
  '  float cloudBase = 3.0;\\n' +
  '  float cloudTop = 6.0;\\n' +
  '  vec4 cloudCol = vec4(0.0);\\n' +
  '  if (rd.y > 0.01) {\\n' +
  '    float tStart = (cloudBase - ro.y) / rd.y;\\n' +
  '    float tEnd = (cloudTop - ro.y) / rd.y;\\n' +
  '    float stepSize = (tEnd - tStart) / 32.0;\\n' +
  '    float t = tStart;\\n' +
  '    for (int i = 0; i < 32; i++) {\\n' +
  '      vec3 p = ro + rd * t;\\n' +
  '      float density = fbm(p * 0.3 + vec3(u_time * 0.05, 0.0, u_time * 0.02), 5) * 0.5 + 0.1;\\n' +
  '      density = max(density, 0.0);\\n' +
  '      if (density > 0.01) {\\n' +
  '        float lightDensity = fbm((p + sunDir * 0.5) * 0.3, 3) * 0.5 + 0.1;\\n' +
  '        float lightAtten = exp(-max(lightDensity, 0.0) * 1.5);\\n' +
  '        vec3 litColor = mix(vec3(0.3, 0.35, 0.45), vec3(1.0, 0.95, 0.85), lightAtten);\\n' +
  '        float alpha = density * stepSize * 0.8;\\n' +
  '        cloudCol.rgb += litColor * alpha * (1.0 - cloudCol.a);\\n' +
  '        cloudCol.a += alpha * (1.0 - cloudCol.a);\\n' +
  '        if (cloudCol.a > 0.95) break;\\n' +
  '      }\\n' +
  '      t += stepSize;\\n' +
  '    }\\n' +
  '  }\\n' +
  '  vec3 col = mix(sky, cloudCol.rgb, cloudCol.a);\\n' +
  '  col = pow(col, vec3(0.4545));\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';
ctx.state.prog = ctx.utils.createProgram(vert, frag);
ctx.state.quad = ctx.utils.createQuadGeometry();
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.state.quad.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(ctx.state.prog);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(ctx.state.prog, 'u_resolution'), ctx.canvas.width, ctx.canvas.height);
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.prog);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {},
    requiredUtils: ["createProgram", "createQuadGeometry", "noise.HASH", "noise.SIMPLEX_3D", "noise.FBM"],
  },

  // ─────────────────────────────────────────────
  // 3. Reaction Diffusion
  // ─────────────────────────────────────────────
  {
    id: "reaction_diffusion",
    name: "Reaction Diffusion",
    category: "simulation",
    tags: ["reaction", "diffusion", "gray-scott", "simulation", "ping-pong", "fbo", "generative", "organic", "pattern"],
    description:
      "Gray-Scott reaction diffusion simulation via ping-pong FBO. Produces organic, coral-like patterns that evolve over time with adjustable feed and kill rates.",
    difficulty: "advanced",
    template: {
      setup: `
const gl = ctx.gl;
const W = ctx.canvas.width;
const H = ctx.canvas.height;
ctx.state.pp = ctx.utils.createPingPong(W, H, {
  internalFormat: gl.RGBA32F,
  format: gl.RGBA,
  type: gl.FLOAT,
  filter: gl.NEAREST,
});

// Initialize with chemical A=1, B=0 everywhere, seed B in center
const initData = new Float32Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    initData[i] = 1.0;   // A
    initData[i+1] = 0.0; // B
    const dx = x - W / 2, dy = y - H / 2;
    if (dx * dx + dy * dy < 400) {
      initData[i+1] = 1.0;
    }
    // Add scattered seeds
    if (Math.random() < 0.001) {
      initData[i+1] = 1.0;
    }
    initData[i+2] = 0.0;
    initData[i+3] = 1.0;
  }
}
gl.bindTexture(gl.TEXTURE_2D, ctx.state.pp.read().texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, initData);
gl.bindTexture(gl.TEXTURE_2D, ctx.state.pp.write().texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, initData);

const vert = '${VERT_QUAD}';

// Simulation pass
const simFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform sampler2D u_tex;\\n' +
  'uniform vec2 u_texel;\\n' +
  'uniform float u_feed;\\n' +
  'uniform float u_kill;\\n' +
  'in vec2 v_uv;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 c = texture(u_tex, v_uv).rg;\\n' +
  '  float A = c.r, B = c.g;\\n' +
  '  // Laplacian with 3x3 kernel\\n' +
  '  vec2 lap = -c;\\n' +
  '  lap += 0.2 * texture(u_tex, v_uv + vec2(u_texel.x, 0.0)).rg;\\n' +
  '  lap += 0.2 * texture(u_tex, v_uv - vec2(u_texel.x, 0.0)).rg;\\n' +
  '  lap += 0.2 * texture(u_tex, v_uv + vec2(0.0, u_texel.y)).rg;\\n' +
  '  lap += 0.2 * texture(u_tex, v_uv - vec2(0.0, u_texel.y)).rg;\\n' +
  '  lap += 0.05 * texture(u_tex, v_uv + u_texel).rg;\\n' +
  '  lap += 0.05 * texture(u_tex, v_uv - u_texel).rg;\\n' +
  '  lap += 0.05 * texture(u_tex, v_uv + vec2(u_texel.x, -u_texel.y)).rg;\\n' +
  '  lap += 0.05 * texture(u_tex, v_uv + vec2(-u_texel.x, u_texel.y)).rg;\\n' +
  '  float dA = 1.0;\\n' +
  '  float dB = 0.5;\\n' +
  '  float feed = u_feed;\\n' +
  '  float kill = u_kill;\\n' +
  '  float ABB = A * B * B;\\n' +
  '  float newA = A + (dA * lap.r - ABB + feed * (1.0 - A));\\n' +
  '  float newB = B + (dB * lap.g + ABB - (kill + feed) * B);\\n' +
  '  fragColor = vec4(clamp(newA, 0.0, 1.0), clamp(newB, 0.0, 1.0), 0.0, 1.0);\\n' +
  '}';

// Display pass
const dispFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform sampler2D u_tex;\\n' +
  'in vec2 v_uv;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 c = texture(u_tex, v_uv).rg;\\n' +
  '  float v = 1.0 - c.g;\\n' +
  '  vec3 col = mix(vec3(0.02, 0.05, 0.15), vec3(0.95, 0.85, 0.6), c.g * 2.0);\\n' +
  '  col = mix(col, vec3(0.1, 0.6, 0.8), smoothstep(0.3, 0.6, c.g));\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

ctx.state.simProg = ctx.utils.createProgram(vert, simFrag);
ctx.state.dispProg = ctx.utils.createProgram(vert, dispFrag);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.utils.createQuadGeometry().positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
const pp = ctx.state.pp;
const W = pp.width, H = pp.height;
const feed = ctx.uniforms.u_feed || 0.037;
const kill = ctx.uniforms.u_kill || 0.06;

// Run simulation steps
for (let i = 0; i < 8; i++) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, pp.write().framebuffer);
  gl.viewport(0, 0, W, H);
  gl.useProgram(ctx.state.simProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pp.read().texture);
  gl.uniform1i(gl.getUniformLocation(ctx.state.simProg, 'u_tex'), 0);
  gl.uniform2f(gl.getUniformLocation(ctx.state.simProg, 'u_texel'), 1.0 / W, 1.0 / H);
  gl.uniform1f(gl.getUniformLocation(ctx.state.simProg, 'u_feed'), feed);
  gl.uniform1f(gl.getUniformLocation(ctx.state.simProg, 'u_kill'), kill);
  gl.bindVertexArray(ctx.state.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  pp.swap();
}

// Display
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(ctx.state.dispProg);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, pp.read().texture);
gl.uniform1i(gl.getUniformLocation(ctx.state.dispProg, 'u_tex'), 0);
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
ctx.state.pp.dispose();
gl.deleteProgram(ctx.state.simProg);
gl.deleteProgram(ctx.state.dispProg);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {
      u_feed: { type: "float", value: 0.037, min: 0.01, max: 0.08, step: 0.001 },
      u_kill: { type: "float", value: 0.06, min: 0.03, max: 0.07, step: 0.001 },
    },
    requiredUtils: ["createProgram", "createQuadGeometry", "createPingPong"],
  },

  // ─────────────────────────────────────────────
  // 4. Metaball
  // ─────────────────────────────────────────────
  {
    id: "metaball",
    name: "Metaball",
    category: "sdf",
    tags: ["metaball", "metaballs", "blob", "smooth", "blend", "2d", "organic", "sdf"],
    description:
      "2D metaballs with smooth blending. Multiple animated blobs merge organically with colorful gradients and a gooey threshold effect.",
    difficulty: "beginner",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';
const frag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 uv = gl_FragCoord.xy / u_resolution;\\n' +
  '  float aspect = u_resolution.x / u_resolution.y;\\n' +
  '  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);\\n' +
  '  float field = 0.0;\\n' +
  '  for (int i = 0; i < 6; i++) {\\n' +
  '    float fi = float(i);\\n' +
  '    float angle = u_time * (0.3 + fi * 0.1) + fi * 1.047;\\n' +
  '    vec2 center = 0.3 * vec2(sin(angle + fi), cos(angle * 0.7 + fi * 2.0));\\n' +
  '    float r = 0.08 + 0.02 * sin(u_time + fi);\\n' +
  '    float d = length(p - center);\\n' +
  '    field += r * r / (d * d + 0.0001);\\n' +
  '  }\\n' +
  '  float edge = smoothstep(0.95, 1.05, field);\\n' +
  '  vec3 col1 = vec3(0.1, 0.4, 0.8);\\n' +
  '  vec3 col2 = vec3(0.9, 0.2, 0.5);\\n' +
  '  vec3 col3 = vec3(0.1, 0.8, 0.5);\\n' +
  '  vec3 col = mix(col1, col2, sin(field * 0.5 + u_time) * 0.5 + 0.5);\\n' +
  '  col = mix(col, col3, cos(field * 0.3 - u_time * 0.5) * 0.5 + 0.5);\\n' +
  '  col *= edge;\\n' +
  '  col += vec3(0.02, 0.02, 0.04) * (1.0 - edge);\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';
ctx.state.prog = ctx.utils.createProgram(vert, frag);
ctx.state.quad = ctx.utils.createQuadGeometry();
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.state.quad.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(ctx.state.prog);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(ctx.state.prog, 'u_resolution'), ctx.canvas.width, ctx.canvas.height);
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.prog);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {},
    requiredUtils: ["createProgram", "createQuadGeometry"],
  },

  // ─────────────────────────────────────────────
  // 5. Fluid-like Distortion
  // ─────────────────────────────────────────────
  {
    id: "fluid_distortion",
    name: "Fluid-like Distortion",
    category: "post_process",
    tags: ["fluid", "distortion", "warp", "post-process", "water", "wave", "ripple", "effect"],
    description:
      "Post-process fluid distortion effect. Applies animated sine-based displacement to produce a liquid, watery look that can be layered on any scene.",
    difficulty: "beginner",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';
const frag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'uniform float u_strength;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 uv = gl_FragCoord.xy / u_resolution;\\n' +
  '  vec2 p = uv * 2.0 - 1.0;\\n' +
  '  p.x *= u_resolution.x / u_resolution.y;\\n' +
  '  float t = u_time;\\n' +
  '  // layered distortion\\n' +
  '  vec2 d = vec2(0.0);\\n' +
  '  d.x += sin(p.y * 4.0 + t * 1.2) * 0.08;\\n' +
  '  d.y += cos(p.x * 3.0 + t * 0.9) * 0.06;\\n' +
  '  d.x += sin(p.y * 8.0 - t * 2.0 + p.x * 3.0) * 0.04;\\n' +
  '  d.y += cos(p.x * 6.0 + t * 1.5 + p.y * 2.0) * 0.03;\\n' +
  '  d *= u_strength;\\n' +
  '  vec2 dp = p + d;\\n' +
  '  // Generate a pattern to distort\\n' +
  '  float c1 = sin(dp.x * 3.0 + t) * cos(dp.y * 2.0 - t * 0.5);\\n' +
  '  float c2 = sin(length(dp) * 5.0 - t * 1.5);\\n' +
  '  float c3 = cos(dp.x * dp.y * 4.0 + t * 0.8);\\n' +
  '  vec3 col = vec3(0.0);\\n' +
  '  col.r = 0.5 + 0.5 * c1;\\n' +
  '  col.g = 0.5 + 0.5 * c2;\\n' +
  '  col.b = 0.5 + 0.5 * c3;\\n' +
  '  col = pow(col, vec3(0.8));\\n' +
  '  // vignette\\n' +
  '  float vig = 1.0 - 0.4 * length(uv - 0.5);\\n' +
  '  col *= vig;\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';
ctx.state.prog = ctx.utils.createProgram(vert, frag);
ctx.state.quad = ctx.utils.createQuadGeometry();
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.state.quad.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(ctx.state.prog);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(ctx.state.prog, 'u_resolution'), ctx.canvas.width, ctx.canvas.height);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'u_strength'), ctx.uniforms.u_strength || 1.0);
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.prog);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {
      u_strength: { type: "float", value: 1.0, min: 0.0, max: 3.0, step: 0.01 },
    },
    requiredUtils: ["createProgram", "createQuadGeometry"],
  },

  // ─────────────────────────────────────────────
  // 6. Bloom
  // ─────────────────────────────────────────────
  {
    id: "bloom",
    name: "Bloom",
    category: "post_process",
    tags: ["bloom", "glow", "post-process", "hdr", "blur", "bright", "light", "effect"],
    description:
      "Multi-pass bloom post-process effect. Renders a scene to an FBO, extracts bright areas, applies Gaussian blur via ping-pong, and composites the glow back.",
    difficulty: "intermediate",
    template: {
      setup: `
const gl = ctx.gl;
const W = ctx.canvas.width;
const H = ctx.canvas.height;

const vert = '${VERT_QUAD}';

// Scene shader — renders bright shapes
const sceneFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;\\n' +
  '  vec3 col = vec3(0.01);\\n' +
  '  for (int i = 0; i < 5; i++) {\\n' +
  '    float fi = float(i);\\n' +
  '    float a = u_time * 0.5 + fi * 1.2566;\\n' +
  '    vec2 c = 0.3 * vec2(cos(a), sin(a * 0.7));\\n' +
  '    float d = length(uv - c);\\n' +
  '    float bright = 0.015 / (d + 0.01);\\n' +
  '    vec3 hue = 0.5 + 0.5 * cos(vec3(0.0, 2.094, 4.189) + fi * 0.8 + u_time);\\n' +
  '    col += hue * bright;\\n' +
  '  }\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

// Blur shader (separable Gaussian)
const blurFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform sampler2D u_tex;\\n' +
  'uniform vec2 u_dir;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'in vec2 v_uv;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 texel = u_dir / u_resolution;\\n' +
  '  vec4 col = texture(u_tex, v_uv) * 0.227027;\\n' +
  '  col += texture(u_tex, v_uv + texel * 1.0) * 0.1945946;\\n' +
  '  col += texture(u_tex, v_uv - texel * 1.0) * 0.1945946;\\n' +
  '  col += texture(u_tex, v_uv + texel * 2.0) * 0.1216216;\\n' +
  '  col += texture(u_tex, v_uv - texel * 2.0) * 0.1216216;\\n' +
  '  col += texture(u_tex, v_uv + texel * 3.0) * 0.0540541;\\n' +
  '  col += texture(u_tex, v_uv - texel * 3.0) * 0.0540541;\\n' +
  '  col += texture(u_tex, v_uv + texel * 4.0) * 0.0162162;\\n' +
  '  col += texture(u_tex, v_uv - texel * 4.0) * 0.0162162;\\n' +
  '  fragColor = col;\\n' +
  '}';

// Composite shader
const compFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform sampler2D u_scene;\\n' +
  'uniform sampler2D u_bloom;\\n' +
  'uniform float u_bloomStrength;\\n' +
  'in vec2 v_uv;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec3 scene = texture(u_scene, v_uv).rgb;\\n' +
  '  vec3 bloom = texture(u_bloom, v_uv).rgb;\\n' +
  '  vec3 col = scene + bloom * u_bloomStrength;\\n' +
  '  col = col / (col + 1.0);\\n' + // tone mapping
  '  col = pow(col, vec3(0.4545));\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

ctx.state.sceneProg = ctx.utils.createProgram(vert, sceneFrag);
ctx.state.blurProg = ctx.utils.createProgram(vert, blurFrag);
ctx.state.compProg = ctx.utils.createProgram(vert, compFrag);

ctx.state.sceneRT = ctx.utils.createRenderTarget(W, H);
ctx.state.bloomPP = ctx.utils.createPingPong(W / 2, H / 2);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.utils.createQuadGeometry().positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
const W = ctx.canvas.width, H = ctx.canvas.height;
const s = ctx.state;

// 1. Render scene to FBO
gl.bindFramebuffer(gl.FRAMEBUFFER, s.sceneRT.framebuffer);
gl.viewport(0, 0, s.sceneRT.width, s.sceneRT.height);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.useProgram(s.sceneProg);
gl.uniform1f(gl.getUniformLocation(s.sceneProg, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(s.sceneProg, 'u_resolution'), s.sceneRT.width, s.sceneRT.height);
gl.bindVertexArray(s.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);

// 2. Blur passes (ping-pong)
const pp = s.bloomPP;
const bW = pp.width, bH = pp.height;

// Seed bloom buffer with scene
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.sceneRT.framebuffer);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pp.write().framebuffer);
gl.blitFramebuffer(0, 0, s.sceneRT.width, s.sceneRT.height, 0, 0, bW, bH, gl.COLOR_BUFFER_BIT, gl.LINEAR);
pp.swap();

for (let pass = 0; pass < 4; pass++) {
  // Horizontal
  gl.bindFramebuffer(gl.FRAMEBUFFER, pp.write().framebuffer);
  gl.viewport(0, 0, bW, bH);
  gl.useProgram(s.blurProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pp.read().texture);
  gl.uniform1i(gl.getUniformLocation(s.blurProg, 'u_tex'), 0);
  gl.uniform2f(gl.getUniformLocation(s.blurProg, 'u_dir'), 1.0, 0.0);
  gl.uniform2f(gl.getUniformLocation(s.blurProg, 'u_resolution'), bW, bH);
  gl.bindVertexArray(s.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  pp.swap();
  // Vertical
  gl.bindFramebuffer(gl.FRAMEBUFFER, pp.write().framebuffer);
  gl.useProgram(s.blurProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pp.read().texture);
  gl.uniform2f(gl.getUniformLocation(s.blurProg, 'u_dir'), 0.0, 1.0);
  gl.bindVertexArray(s.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  pp.swap();
}

// 3. Composite
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, W, H);
gl.useProgram(s.compProg);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, s.sceneRT.texture);
gl.uniform1i(gl.getUniformLocation(s.compProg, 'u_scene'), 0);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, pp.read().texture);
gl.uniform1i(gl.getUniformLocation(s.compProg, 'u_bloom'), 1);
gl.uniform1f(gl.getUniformLocation(s.compProg, 'u_bloomStrength'), ctx.uniforms.u_bloomStrength || 1.5);
gl.bindVertexArray(s.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
const s = ctx.state;
gl.deleteProgram(s.sceneProg);
gl.deleteProgram(s.blurProg);
gl.deleteProgram(s.compProg);
gl.deleteFramebuffer(s.sceneRT.framebuffer);
gl.deleteTexture(s.sceneRT.texture);
s.bloomPP.dispose();
gl.deleteVertexArray(s.vao);
gl.deleteBuffer(s.buf);
`,
    },
    uniforms: {
      u_bloomStrength: { type: "float", value: 1.5, min: 0.0, max: 5.0, step: 0.1 },
    },
    requiredUtils: ["createProgram", "createQuadGeometry", "createPingPong"],
  },

  // ─────────────────────────────────────────────
  // 7. Chromatic Aberration
  // ─────────────────────────────────────────────
  {
    id: "chromatic_aberration",
    name: "Chromatic Aberration",
    category: "post_process",
    tags: ["chromatic", "aberration", "rgb", "split", "post-process", "lens", "distortion", "color"],
    description:
      "RGB channel separation post-process effect. Shifts red, green, and blue channels radially from center for a stylized lens distortion look.",
    difficulty: "beginner",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';

// Scene shader (something colorful to apply the effect to)
const sceneFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;\\n' +
  '  float d = length(uv);\\n' +
  '  float a = atan(uv.y, uv.x);\\n' +
  '  float f = sin(a * 6.0 + u_time * 2.0) * sin(d * 10.0 - u_time * 3.0);\\n' +
  '  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.094, 4.189) + d * 4.0 + u_time + f);\\n' +
  '  col *= smoothstep(1.0, 0.3, d);\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

// Chromatic aberration shader
const caFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform sampler2D u_tex;\\n' +
  'uniform float u_strength;\\n' +
  'in vec2 v_uv;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 dir = v_uv - 0.5;\\n' +
  '  float d = length(dir);\\n' +
  '  vec2 offset = dir * d * u_strength;\\n' +
  '  float r = texture(u_tex, v_uv + offset).r;\\n' +
  '  float g = texture(u_tex, v_uv).g;\\n' +
  '  float b = texture(u_tex, v_uv - offset).b;\\n' +
  '  fragColor = vec4(r, g, b, 1.0);\\n' +
  '}';

const W = ctx.canvas.width, H = ctx.canvas.height;
ctx.state.sceneProg = ctx.utils.createProgram(vert, sceneFrag);
ctx.state.caProg = ctx.utils.createProgram(vert, caFrag);
ctx.state.rt = ctx.utils.createRenderTarget(W, H);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.utils.createQuadGeometry().positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
const s = ctx.state;

// Render scene to FBO
gl.bindFramebuffer(gl.FRAMEBUFFER, s.rt.framebuffer);
gl.viewport(0, 0, s.rt.width, s.rt.height);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.useProgram(s.sceneProg);
gl.uniform1f(gl.getUniformLocation(s.sceneProg, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(s.sceneProg, 'u_resolution'), s.rt.width, s.rt.height);
gl.bindVertexArray(s.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);

// Apply chromatic aberration
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(s.caProg);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, s.rt.texture);
gl.uniform1i(gl.getUniformLocation(s.caProg, 'u_tex'), 0);
gl.uniform1f(gl.getUniformLocation(s.caProg, 'u_strength'), ctx.uniforms.u_strength || 0.05);
gl.bindVertexArray(s.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.sceneProg);
gl.deleteProgram(ctx.state.caProg);
gl.deleteFramebuffer(ctx.state.rt.framebuffer);
gl.deleteTexture(ctx.state.rt.texture);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {
      u_strength: { type: "float", value: 0.05, min: 0.0, max: 0.3, step: 0.005 },
    },
    requiredUtils: ["createProgram", "createQuadGeometry"],
  },

  // ─────────────────────────────────────────────
  // 8. CRT / Scanline
  // ─────────────────────────────────────────────
  {
    id: "crt_scanline",
    name: "CRT / Scanline",
    category: "post_process",
    tags: ["crt", "scanline", "retro", "vintage", "monitor", "curvature", "vhs", "post-process", "tv"],
    description:
      "Retro CRT monitor effect with scanlines, barrel distortion curvature, and vignette. Applies to an internal scene for an authentic old-school display look.",
    difficulty: "intermediate",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';

// Source scene
const sceneFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 uv = gl_FragCoord.xy / u_resolution;\\n' +
  '  vec3 col = vec3(0.0);\\n' +
  '  // Colorful test pattern\\n' +
  '  col.r = 0.5 + 0.5 * sin(uv.x * 20.0 + u_time);\\n' +
  '  col.g = 0.5 + 0.5 * sin(uv.y * 15.0 + u_time * 1.3);\\n' +
  '  col.b = 0.5 + 0.5 * sin((uv.x + uv.y) * 10.0 + u_time * 0.7);\\n' +
  '  // Add some shapes\\n' +
  '  vec2 p = uv - 0.5;\\n' +
  '  p.x *= u_resolution.x / u_resolution.y;\\n' +
  '  float d = length(p);\\n' +
  '  col += vec3(0.5) * smoothstep(0.3, 0.29, d);\\n' +
  '  // Text-like horizontal bars\\n' +
  '  col *= 0.8 + 0.2 * step(0.5, fract(uv.y * 20.0));\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

// CRT effect shader
const crtFrag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform sampler2D u_tex;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'uniform float u_time;\\n' +
  'uniform float u_curvature;\\n' +
  'uniform float u_scanlineIntensity;\\n' +
  'in vec2 v_uv;\\n' +
  'out vec4 fragColor;\\n' +
  'vec2 curveUV(vec2 uv, float k) {\\n' +
  '  uv = uv * 2.0 - 1.0;\\n' +
  '  vec2 offset = abs(uv.yx) / vec2(k, k);\\n' +
  '  uv += uv * offset * offset;\\n' +
  '  uv = uv * 0.5 + 0.5;\\n' +
  '  return uv;\\n' +
  '}\\n' +
  'void main() {\\n' +
  '  vec2 uv = curveUV(v_uv, u_curvature);\\n' +
  '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {\\n' +
  '    fragColor = vec4(0.0, 0.0, 0.0, 1.0); return;\\n' +
  '  }\\n' +
  '  // Slight RGB offset for sub-pixel look\\n' +
  '  float sep = 0.001;\\n' +
  '  float r = texture(u_tex, vec2(uv.x + sep, uv.y)).r;\\n' +
  '  float g = texture(u_tex, uv).g;\\n' +
  '  float b = texture(u_tex, vec2(uv.x - sep, uv.y)).b;\\n' +
  '  vec3 col = vec3(r, g, b);\\n' +
  '  // Scanlines\\n' +
  '  float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;\\n' +
  '  col *= 1.0 - u_scanlineIntensity * (1.0 - scanline);\\n' +
  '  // Flicker\\n' +
  '  col *= 0.97 + 0.03 * sin(u_time * 60.0);\\n' +
  '  // Vignette\\n' +
  '  vec2 vig = uv * (1.0 - uv);\\n' +
  '  col *= pow(vig.x * vig.y * 15.0, 0.25);\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

const W = ctx.canvas.width, H = ctx.canvas.height;
ctx.state.sceneProg = ctx.utils.createProgram(vert, sceneFrag);
ctx.state.crtProg = ctx.utils.createProgram(vert, crtFrag);
ctx.state.rt = ctx.utils.createRenderTarget(W, H);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.utils.createQuadGeometry().positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
const s = ctx.state;
const W = ctx.canvas.width, H = ctx.canvas.height;

// Render scene
gl.bindFramebuffer(gl.FRAMEBUFFER, s.rt.framebuffer);
gl.viewport(0, 0, s.rt.width, s.rt.height);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.useProgram(s.sceneProg);
gl.uniform1f(gl.getUniformLocation(s.sceneProg, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(s.sceneProg, 'u_resolution'), s.rt.width, s.rt.height);
gl.bindVertexArray(s.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);

// Apply CRT effect
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, W, H);
gl.useProgram(s.crtProg);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, s.rt.texture);
gl.uniform1i(gl.getUniformLocation(s.crtProg, 'u_tex'), 0);
gl.uniform2f(gl.getUniformLocation(s.crtProg, 'u_resolution'), W, H);
gl.uniform1f(gl.getUniformLocation(s.crtProg, 'u_time'), ctx.time);
gl.uniform1f(gl.getUniformLocation(s.crtProg, 'u_curvature'), ctx.uniforms.u_curvature || 4.0);
gl.uniform1f(gl.getUniformLocation(s.crtProg, 'u_scanlineIntensity'), ctx.uniforms.u_scanlineIntensity || 0.3);
gl.bindVertexArray(s.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.sceneProg);
gl.deleteProgram(ctx.state.crtProg);
gl.deleteFramebuffer(ctx.state.rt.framebuffer);
gl.deleteTexture(ctx.state.rt.texture);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {
      u_curvature: { type: "float", value: 4.0, min: 1.0, max: 20.0, step: 0.5 },
      u_scanlineIntensity: { type: "float", value: 0.3, min: 0.0, max: 1.0, step: 0.05 },
    },
    requiredUtils: ["createProgram", "createQuadGeometry"],
  },

  // ─────────────────────────────────────────────
  // 9. SDF Basics
  // ─────────────────────────────────────────────
  {
    id: "sdf_basics",
    name: "SDF Basics",
    category: "sdf",
    tags: ["sdf", "signed distance", "2d", "shapes", "smooth", "union", "circle", "box", "boolean"],
    description:
      "Basic 2D SDF shapes with smooth operations. Demonstrates circles, boxes, smooth union, subtraction, and intersection with animated parameters.",
    difficulty: "beginner",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';
const frag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'out vec4 fragColor;\\n' +
  'float sdCircle(vec2 p, float r) { return length(p) - r; }\\n' +
  'float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }\\n' +
  'float sdRoundedBox(vec2 p, vec2 b, float r) { return sdBox(p, b) - r; }\\n' +
  'float opSmoothUnion(float d1, float d2, float k) {\\n' +
  '  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);\\n' +
  '  return mix(d2, d1, h) - k * h * (1.0 - h);\\n' +
  '}\\n' +
  'float opSmoothSubtract(float d1, float d2, float k) {\\n' +
  '  float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);\\n' +
  '  return mix(d2, -d1, h) + k * h * (1.0 - h);\\n' +
  '}\\n' +
  'void main() {\\n' +
  '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;\\n' +
  '  float t = u_time;\\n' +
  '  // Animated shapes\\n' +
  '  float c1 = sdCircle(uv - vec2(0.2 * sin(t), 0.0), 0.2);\\n' +
  '  float c2 = sdCircle(uv - vec2(-0.2 * sin(t), 0.0), 0.15);\\n' +
  '  float b1 = sdRoundedBox(uv - vec2(0.0, 0.25 * cos(t)), vec2(0.15, 0.1), 0.03);\\n' +
  '  // Smooth union of circles\\n' +
  '  float d = opSmoothUnion(c1, c2, 0.15);\\n' +
  '  // Smooth subtract box\\n' +
  '  d = opSmoothSubtract(b1, d, 0.08);\\n' +
  '  // Coloring\\n' +
  '  vec3 col = vec3(0.95, 0.95, 0.92);\\n' +
  '  // Fill\\n' +
  '  vec3 fillCol = 0.5 + 0.5 * cos(vec3(0.0, 2.094, 4.189) + t * 0.5 + d * 8.0);\\n' +
  '  col = mix(fillCol, col, smoothstep(0.0, 0.005, d));\\n' +
  '  // Border\\n' +
  '  col = mix(vec3(0.1), col, smoothstep(0.002, 0.005, abs(d)));\\n' +
  '  // Distance field visualization in background\\n' +
  '  col = mix(col, col * (0.8 + 0.2 * cos(d * 80.0)), smoothstep(0.0, 0.005, d));\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';
ctx.state.prog = ctx.utils.createProgram(vert, frag);
ctx.state.quad = ctx.utils.createQuadGeometry();
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.state.quad.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(ctx.state.prog);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'u_time'), ctx.time);
gl.uniform2f(gl.getUniformLocation(ctx.state.prog, 'u_resolution'), ctx.canvas.width, ctx.canvas.height);
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.prog);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {},
    requiredUtils: ["createProgram", "createQuadGeometry"],
  },

  // ─────────────────────────────────────────────
  // 10. Audio-reactive Pulse
  // ─────────────────────────────────────────────
  {
    id: "audio_reactive_pulse",
    name: "Audio-reactive Pulse",
    category: "audio_reactive",
    tags: ["audio", "reactive", "music", "pulse", "frequency", "bass", "beat", "visualizer", "fft"],
    description:
      "Audio frequency data driving visual pulse. Rings expand and contract based on bass, mid, and treble energy, creating a dynamic music visualizer.",
    difficulty: "intermediate",
    template: {
      setup: `
const gl = ctx.gl;
const vert = '${VERT_QUAD}';
const frag = '#version 300 es\\nprecision highp float;\\n' +
  'uniform float u_time;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'uniform float u_bass;\\n' +
  'uniform float u_mid;\\n' +
  'uniform float u_treble;\\n' +
  'uniform float u_energy;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;\\n' +
  '  float d = length(uv);\\n' +
  '  float a = atan(uv.y, uv.x);\\n' +
  '  vec3 col = vec3(0.02);\\n' +
  '  // Bass ring\\n' +
  '  float bassR = 0.15 + u_bass * 0.25;\\n' +
  '  float ring1 = smoothstep(0.015, 0.0, abs(d - bassR));\\n' +
  '  col += vec3(0.9, 0.2, 0.3) * ring1 * (1.0 + u_bass * 2.0);\\n' +
  '  // Mid ring\\n' +
  '  float midR = 0.25 + u_mid * 0.2;\\n' +
  '  float wave = sin(a * 8.0 + u_time * 2.0) * u_mid * 0.05;\\n' +
  '  float ring2 = smoothstep(0.012, 0.0, abs(d - midR - wave));\\n' +
  '  col += vec3(0.2, 0.8, 0.4) * ring2 * (1.0 + u_mid * 2.0);\\n' +
  '  // Treble ring\\n' +
  '  float trebR = 0.35 + u_treble * 0.15;\\n' +
  '  float wave2 = sin(a * 16.0 - u_time * 4.0) * u_treble * 0.04;\\n' +
  '  float ring3 = smoothstep(0.008, 0.0, abs(d - trebR - wave2));\\n' +
  '  col += vec3(0.3, 0.4, 0.95) * ring3 * (1.0 + u_treble * 2.0);\\n' +
  '  // Center pulse\\n' +
  '  float pulse = 0.04 / (d + 0.04) * u_energy;\\n' +
  '  col += vec3(1.0, 0.8, 0.5) * pulse * 0.3;\\n' +
  '  // Radial particles\\n' +
  '  float sparkle = sin(a * 32.0 + d * 40.0 - u_time * 3.0);\\n' +
  '  sparkle = pow(max(sparkle, 0.0), 8.0) * u_energy;\\n' +
  '  col += vec3(1.0) * sparkle * 0.15 * smoothstep(0.5, 0.1, d);\\n' +
  '  // Vignette\\n' +
  '  col *= 1.0 - 0.5 * d;\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';
ctx.state.prog = ctx.utils.createProgram(vert, frag);
ctx.state.quad = ctx.utils.createQuadGeometry();
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, ctx.state.quad.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
ctx.state.vao = vao;
ctx.state.buf = buf;
`,
      render: `
const gl = ctx.gl;
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.useProgram(ctx.state.prog);
const loc = (n) => gl.getUniformLocation(ctx.state.prog, n);
gl.uniform1f(loc('u_time'), ctx.time);
gl.uniform2f(loc('u_resolution'), ctx.canvas.width, ctx.canvas.height);
gl.uniform1f(loc('u_bass'), ctx.audio.bass || 0.0);
gl.uniform1f(loc('u_mid'), ctx.audio.mid || 0.0);
gl.uniform1f(loc('u_treble'), ctx.audio.treble || 0.0);
gl.uniform1f(loc('u_energy'), ctx.audio.energy || 0.0);
gl.bindVertexArray(ctx.state.vao);
gl.drawArrays(gl.TRIANGLES, 0, 6);
`,
      cleanup: `
const gl = ctx.gl;
gl.deleteProgram(ctx.state.prog);
gl.deleteVertexArray(ctx.state.vao);
gl.deleteBuffer(ctx.state.buf);
`,
    },
    uniforms: {},
    requiredUtils: ["createProgram", "createQuadGeometry"],
  },

  // ─────────────────────────────────────────────
  // 11. Particle Burst
  // ─────────────────────────────────────────────
  {
    id: "particle_burst",
    name: "Particle Burst",
    category: "particle",
    tags: ["particle", "burst", "explosion", "gpu", "points", "firework", "emitter", "effect"],
    description:
      "GPU-simulated particle explosion. Uses transform feedback to update particle positions and velocities on the GPU, producing a continuous burst of sparks.",
    difficulty: "advanced",
    template: {
      setup: `
const gl = ctx.gl;
const NUM = 10000;

// Initialize particle data: position(2) + velocity(2) + life(1) + maxLife(1)
const initData = new Float32Array(NUM * 6);
for (let i = 0; i < NUM; i++) {
  const off = i * 6;
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.2 + Math.random() * 0.8;
  initData[off] = 0;   // x
  initData[off+1] = 0; // y
  initData[off+2] = Math.cos(angle) * speed; // vx
  initData[off+3] = Math.sin(angle) * speed; // vy
  initData[off+4] = Math.random() * 3.0; // life
  initData[off+5] = 1.0 + Math.random() * 2.0; // maxLife
}

// Transform feedback update shader
const updateVert = '#version 300 es\\n' +
  'in vec2 a_pos;\\n' +
  'in vec2 a_vel;\\n' +
  'in float a_life;\\n' +
  'in float a_maxLife;\\n' +
  'out vec2 v_pos;\\n' +
  'out vec2 v_vel;\\n' +
  'out float v_life;\\n' +
  'out float v_maxLife;\\n' +
  'uniform float u_dt;\\n' +
  'uniform float u_time;\\n' +
  '// Simple hash for pseudo-random reset\\n' +
  'float hash(float n) { return fract(sin(n) * 43758.5453); }\\n' +
  'void main() {\\n' +
  '  float life = a_life + u_dt;\\n' +
  '  if (life > a_maxLife) {\\n' +
  '    // Reset particle\\n' +
  '    float id = float(gl_VertexID);\\n' +
  '    float angle = hash(id + u_time * 0.1) * 6.2831853;\\n' +
  '    float speed = 0.2 + hash(id * 1.3 + u_time) * 0.8;\\n' +
  '    v_pos = vec2(0.0);\\n' +
  '    v_vel = vec2(cos(angle), sin(angle)) * speed;\\n' +
  '    v_life = 0.0;\\n' +
  '    v_maxLife = 1.0 + hash(id * 2.7 + u_time) * 2.0;\\n' +
  '  } else {\\n' +
  '    v_vel = a_vel * 0.995 + vec2(0.0, -0.15) * u_dt;\\n' +
  '    v_pos = a_pos + v_vel * u_dt;\\n' +
  '    v_life = life;\\n' +
  '    v_maxLife = a_maxLife;\\n' +
  '  }\\n' +
  '}';
const updateFrag = '#version 300 es\\nprecision highp float;\\nout vec4 fragColor;\\nvoid main() { fragColor = vec4(0.0); }';

// Render shader
const renderVert = '#version 300 es\\n' +
  'in vec2 a_pos;\\n' +
  'in vec2 a_vel;\\n' +
  'in float a_life;\\n' +
  'in float a_maxLife;\\n' +
  'out float v_alpha;\\n' +
  'out vec3 v_color;\\n' +
  'uniform vec2 u_resolution;\\n' +
  'void main() {\\n' +
  '  float t = a_life / a_maxLife;\\n' +
  '  v_alpha = 1.0 - t;\\n' +
  '  v_alpha *= v_alpha;\\n' +
  '  float speed = length(a_vel);\\n' +
  '  v_color = mix(vec3(1.0, 0.8, 0.3), vec3(1.0, 0.2, 0.1), t);\\n' +
  '  v_color = mix(v_color, vec3(0.3, 0.5, 1.0), smoothstep(0.3, 0.8, speed));\\n' +
  '  float aspect = u_resolution.x / u_resolution.y;\\n' +
  '  gl_Position = vec4(a_pos.x / aspect, a_pos.y, 0.0, 1.0);\\n' +
  '  gl_PointSize = mix(4.0, 1.0, t);\\n' +
  '}';
const renderFrag = '#version 300 es\\nprecision highp float;\\n' +
  'in float v_alpha;\\n' +
  'in vec3 v_color;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 pc = gl_PointCoord * 2.0 - 1.0;\\n' +
  '  float d = dot(pc, pc);\\n' +
  '  if (d > 1.0) discard;\\n' +
  '  float a = v_alpha * (1.0 - d);\\n' +
  '  fragColor = vec4(v_color * a, a);\\n' +
  '}';

// Create transform feedback program
const updateProg = gl.createProgram();
const vs = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vs, updateVert);
gl.compileShader(vs);
if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(vs));
const fs = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fs, updateFrag);
gl.compileShader(fs);
if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs));
gl.attachShader(updateProg, vs);
gl.attachShader(updateProg, fs);
gl.transformFeedbackVaryings(updateProg, ['v_pos', 'v_vel', 'v_life', 'v_maxLife'], gl.INTERLEAVED_ATTRIBS);
gl.linkProgram(updateProg);
if (!gl.getProgramParameter(updateProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(updateProg));
gl.deleteShader(vs);
gl.deleteShader(fs);

ctx.state.updateProg = updateProg;
ctx.state.renderProg = ctx.utils.createProgram(renderVert, renderFrag);

// Double-buffered particle buffers
const bufs = [gl.createBuffer(), gl.createBuffer()];
for (const b of bufs) {
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, initData, gl.DYNAMIC_COPY);
}

// VAOs for update
const updateVAOs = [gl.createVertexArray(), gl.createVertexArray()];
for (let i = 0; i < 2; i++) {
  gl.bindVertexArray(updateVAOs[i]);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]);
  const stride = 6 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);
}
gl.bindVertexArray(null);

// VAOs for render (same layout)
const renderVAOs = [gl.createVertexArray(), gl.createVertexArray()];
for (let i = 0; i < 2; i++) {
  gl.bindVertexArray(renderVAOs[i]);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]);
  const stride = 6 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);
}
gl.bindVertexArray(null);

const tf = gl.createTransformFeedback();

ctx.state.bufs = bufs;
ctx.state.updateVAOs = updateVAOs;
ctx.state.renderVAOs = renderVAOs;
ctx.state.tf = tf;
ctx.state.current = 0;
ctx.state.NUM = NUM;
`,
      render: `
const gl = ctx.gl;
const s = ctx.state;
const cur = s.current;
const next = 1 - cur;
const dt = Math.min(ctx.dt, 0.05);

// --- Update pass (transform feedback) ---
gl.useProgram(s.updateProg);
gl.uniform1f(gl.getUniformLocation(s.updateProg, 'u_dt'), dt);
gl.uniform1f(gl.getUniformLocation(s.updateProg, 'u_time'), ctx.time);

gl.bindVertexArray(s.updateVAOs[cur]);
gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, s.tf);
gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, s.bufs[next]);

gl.enable(gl.RASTERIZER_DISCARD);
gl.beginTransformFeedback(gl.POINTS);
gl.drawArrays(gl.POINTS, 0, s.NUM);
gl.endTransformFeedback();
gl.disable(gl.RASTERIZER_DISCARD);

gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

// --- Render pass ---
gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
gl.clearColor(0.01, 0.01, 0.02, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

gl.useProgram(s.renderProg);
gl.uniform2f(gl.getUniformLocation(s.renderProg, 'u_resolution'), ctx.canvas.width, ctx.canvas.height);
gl.bindVertexArray(s.renderVAOs[next]);
gl.drawArrays(gl.POINTS, 0, s.NUM);

gl.disable(gl.BLEND);
s.current = next;
`,
      cleanup: `
const gl = ctx.gl;
const s = ctx.state;
gl.deleteProgram(s.updateProg);
gl.deleteProgram(s.renderProg);
for (const b of s.bufs) gl.deleteBuffer(b);
for (const v of s.updateVAOs) gl.deleteVertexArray(v);
for (const v of s.renderVAOs) gl.deleteVertexArray(v);
gl.deleteTransformFeedback(s.tf);
`,
    },
    uniforms: {},
    requiredUtils: ["createProgram"],
  },

  // ─────────────────────────────────────────────
  // 12. Orbit Camera Template
  // ─────────────────────────────────────────────
  {
    id: "orbit_camera_template",
    name: "Orbit Camera Template",
    category: "camera",
    tags: ["orbit", "camera", "3d", "perspective", "rotation", "scene", "lighting", "template", "mvp"],
    description:
      "3D scene with orbit camera setup. Renders a lit sphere and ground plane with mouse-controlled orbit camera, providing a starting template for any 3D scene.",
    difficulty: "intermediate",
    template: {
      setup: `
const gl = ctx.gl;
const mat4 = ctx.utils.mat4;

// Create orbit camera
ctx.state.cam = ctx.utils.createOrbitCamera({
  distance: 5,
  theta: 0.5,
  phi: 1.0,
  target: [0, 0.5, 0],
});

// 3D vertex shader
const vert3d = ctx.utils.DEFAULT_3D_VERTEX_SHADER;

const frag3d = '#version 300 es\\nprecision highp float;\\n' +
  'in vec3 v_normal;\\n' +
  'in vec3 v_pos;\\n' +
  'in vec2 v_uv;\\n' +
  'uniform vec3 u_eye;\\n' +
  'uniform vec3 u_color;\\n' +
  'uniform float u_time;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec3 N = normalize(v_normal);\\n' +
  '  vec3 L = normalize(vec3(1.0, 2.0, 1.5));\\n' +
  '  vec3 V = normalize(u_eye - v_pos);\\n' +
  '  vec3 H = normalize(L + V);\\n' +
  '  float diff = max(dot(N, L), 0.0) * 0.8;\\n' +
  '  float spec = pow(max(dot(N, H), 0.0), 64.0) * 0.5;\\n' +
  '  float amb = 0.15;\\n' +
  '  vec3 col = u_color * (amb + diff) + vec3(1.0) * spec;\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

// Ground shader
const groundFrag = '#version 300 es\\nprecision highp float;\\n' +
  'in vec3 v_pos;\\n' +
  'in vec2 v_uv;\\n' +
  'in vec3 v_normal;\\n' +
  'out vec4 fragColor;\\n' +
  'void main() {\\n' +
  '  vec2 grid = abs(fract(v_pos.xz * 2.0) - 0.5);\\n' +
  '  float line = min(grid.x, grid.y);\\n' +
  '  float g = smoothstep(0.0, 0.05, line);\\n' +
  '  vec3 col = mix(vec3(0.3), vec3(0.5), g);\\n' +
  '  // Fade with distance\\n' +
  '  float d = length(v_pos.xz);\\n' +
  '  col = mix(col, vec3(0.15, 0.15, 0.2), smoothstep(3.0, 8.0, d));\\n' +
  '  fragColor = vec4(col, 1.0);\\n' +
  '}';

ctx.state.objProg = ctx.utils.createProgram(vert3d, frag3d);
ctx.state.groundProg = ctx.utils.createProgram(vert3d, groundFrag);

// Sphere geometry
const sphere = ctx.utils.createSphereGeometry(32);
const sphereVAO = gl.createVertexArray();
gl.bindVertexArray(sphereVAO);
const sBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, sBuf);
gl.bufferData(gl.ARRAY_BUFFER, sphere.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
const sNBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, sNBuf);
gl.bufferData(gl.ARRAY_BUFFER, sphere.normals, gl.STATIC_DRAW);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
const sUBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, sUBuf);
gl.bufferData(gl.ARRAY_BUFFER, sphere.uvs, gl.STATIC_DRAW);
gl.enableVertexAttribArray(2);
gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
const sIdx = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sIdx);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.indices, gl.STATIC_DRAW);
gl.bindVertexArray(null);
ctx.state.sphereVAO = sphereVAO;
ctx.state.sphereCount = sphere.vertexCount;
ctx.state.sphereBufs = [sBuf, sNBuf, sUBuf, sIdx];

// Ground plane
const plane = ctx.utils.createPlaneGeometry(20, 20, 1, 1);
const planeVAO = gl.createVertexArray();
gl.bindVertexArray(planeVAO);
const pBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
gl.bufferData(gl.ARRAY_BUFFER, plane.positions, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
const pNBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, pNBuf);
gl.bufferData(gl.ARRAY_BUFFER, plane.normals, gl.STATIC_DRAW);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
const pUBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, pUBuf);
gl.bufferData(gl.ARRAY_BUFFER, plane.uvs, gl.STATIC_DRAW);
gl.enableVertexAttribArray(2);
gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
const pIdx = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pIdx);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, plane.indices, gl.STATIC_DRAW);
gl.bindVertexArray(null);
ctx.state.planeVAO = planeVAO;
ctx.state.planeCount = plane.vertexCount;
ctx.state.planeBufs = [pBuf, pNBuf, pUBuf, pIdx];
`,
      render: `
const gl = ctx.gl;
const s = ctx.state;
const mat4 = ctx.utils.mat4;
const W = ctx.canvas.width, H = ctx.canvas.height;

// Update camera
s.cam.update(ctx.mouse, ctx.mousePrev, ctx.mouseDown, ctx.keys, ctx.dt);
const view = s.cam.getViewMatrix();
const proj = s.cam.getProjectionMatrix(W / H, 60, 0.1, 100);
const eye = s.cam.getEye();

gl.viewport(0, 0, W, H);
gl.clearColor(0.1, 0.1, 0.15, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
gl.enable(gl.DEPTH_TEST);

// Draw ground
const groundModel = mat4.identity();
const groundMVP = mat4.multiply(proj, mat4.multiply(view, groundModel));
gl.useProgram(s.groundProg);
gl.uniformMatrix4fv(gl.getUniformLocation(s.groundProg, 'u_mvp'), false, groundMVP);
gl.uniformMatrix4fv(gl.getUniformLocation(s.groundProg, 'u_model'), false, groundModel);
gl.bindVertexArray(s.planeVAO);
gl.drawElements(gl.TRIANGLES, s.planeCount, gl.UNSIGNED_SHORT, 0);

// Draw sphere
const sphereModel = mat4.translate(mat4.identity(), [0, 0.5 + 0.1 * Math.sin(ctx.time), 0]);
const sphereMVP = mat4.multiply(proj, mat4.multiply(view, sphereModel));
gl.useProgram(s.objProg);
gl.uniformMatrix4fv(gl.getUniformLocation(s.objProg, 'u_mvp'), false, sphereMVP);
gl.uniformMatrix4fv(gl.getUniformLocation(s.objProg, 'u_model'), false, sphereModel);
gl.uniform3fv(gl.getUniformLocation(s.objProg, 'u_eye'), eye);
const color = ctx.uniforms.u_color || [0.4, 0.6, 0.9];
gl.uniform3fv(gl.getUniformLocation(s.objProg, 'u_color'), color);
gl.uniform1f(gl.getUniformLocation(s.objProg, 'u_time'), ctx.time);
gl.bindVertexArray(s.sphereVAO);
gl.drawElements(gl.TRIANGLES, s.sphereCount, gl.UNSIGNED_SHORT, 0);

gl.disable(gl.DEPTH_TEST);
`,
      cleanup: `
const gl = ctx.gl;
const s = ctx.state;
gl.deleteProgram(s.objProg);
gl.deleteProgram(s.groundProg);
gl.deleteVertexArray(s.sphereVAO);
gl.deleteVertexArray(s.planeVAO);
for (const b of s.sphereBufs) gl.deleteBuffer(b);
for (const b of s.planeBufs) gl.deleteBuffer(b);
`,
    },
    uniforms: {
      u_color: { type: "vec3", value: [0.4, 0.6, 0.9] },
    },
    requiredUtils: ["createProgram", "createOrbitCamera", "createSphereGeometry", "createPlaneGeometry", "mat4"],
  },
];

// ─────────────────────────────────────────────
// Search & lookup functions
// ─────────────────────────────────────────────

/**
 * Find techniques matching a user query string.
 * Returns matching techniques sorted by relevance (simple keyword scoring).
 * @param {string} query - User prompt / search string
 * @returns {Array} - Matching technique objects sorted by relevance (highest first)
 */
export function findTechniques(query) {
  if (!query || typeof query !== "string") return [];

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (tokens.length === 0) return [];

  const scored = techniques.map((tech) => {
    const searchable = [
      tech.name.toLowerCase(),
      tech.description.toLowerCase(),
      tech.category.toLowerCase(),
      ...tech.tags.map((t) => t.toLowerCase()),
    ].join(" ");

    let score = 0;
    for (const token of tokens) {
      // Exact tag match (highest weight)
      if (tech.tags.some((tag) => tag.toLowerCase() === token)) {
        score += 10;
      }
      // Name contains token
      if (tech.name.toLowerCase().includes(token)) {
        score += 8;
      }
      // Category match
      if (tech.category.toLowerCase().includes(token)) {
        score += 6;
      }
      // Tag partial match
      if (tech.tags.some((tag) => tag.toLowerCase().includes(token))) {
        score += 4;
      }
      // Description contains token
      if (tech.description.toLowerCase().includes(token)) {
        score += 2;
      }
      // Fuzzy: any field contains token
      if (searchable.includes(token)) {
        score += 1;
      }
    }
    return { tech, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.tech);
}

/**
 * Get a single technique by its id.
 * @param {string} id - The snake_case technique identifier
 * @returns {object|undefined} - The technique object, or undefined if not found
 */
export function getTechniqueById(id) {
  return techniques.find((t) => t.id === id);
}

export default techniques;
