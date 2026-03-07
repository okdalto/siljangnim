/**
 * shaderTarget — Shader source dispatch for WebGL2 (GLSL) and WebGPU (WGSL).
 *
 * Provides:
 * - Dual-target shader definitions (GLSL + WGSL side-by-side)
 * - Built-in shader library (quad vertex, 3D vertex)
 * - Shader template helpers for common patterns
 * - Backend-aware shader selection
 */

import { BackendType } from "./RendererInterface.js";
import { transpileFragmentGLSL, transpileVertexGLSL } from "./glslToWgsl.js";

// ─── Shader Definition ───────────────────────────────────

/**
 * Create a dual-target shader definition.
 * @param {{ glsl: string, wgsl: string, label?: string }} sources
 * @returns {{ glsl: string, wgsl: string, label?: string }}
 */
export function shaderSource(sources) {
  return {
    glsl: sources.glsl || null,
    wgsl: sources.wgsl || null,
    label: sources.label || "unnamed",
  };
}

/**
 * Select the appropriate shader code for the current backend.
 * @param {{ glsl: string, wgsl: string }} source
 * @param {BackendType} backendType
 * @returns {string}
 */
export function selectShader(source, backendType) {
  if (backendType === BackendType.WEBGPU) {
    if (source.wgsl) return source.wgsl;
    // Auto-transpile GLSL → WGSL if only GLSL is available
    if (source.glsl) {
      const isVertex = /\bgl_Position\b/.test(source.glsl) || /\bin\s+vec[23]\s+a_/.test(source.glsl);
      const result = isVertex
        ? transpileVertexGLSL(source.glsl)
        : transpileFragmentGLSL(source.glsl);
      if (result.wgsl && result.errors.length === 0) {
        // Cache the transpiled result
        source.wgsl = result.wgsl;
        return result.wgsl;
      }
      const errMsg = result.errors.length > 0 ? result.errors.join("; ") : "unknown transpilation error";
      throw new Error(`GLSL→WGSL transpilation failed for ${source.label || "unknown"}: ${errMsg}`);
    }
    throw new Error(`No WGSL source available for shader: ${source.label || "unknown"}`);
  }
  if (!source.glsl) throw new Error(`No GLSL source available for shader: ${source.label || "unknown"}`);
  return source.glsl;
}

// ─── Built-in Shaders ────────────────────────────────────

/**
 * Fullscreen quad vertex shader.
 * Outputs v_uv (0..1 range) from NDC positions.
 */
export const QUAD_VERTEX = shaderSource({
  label: "quad-vertex",

  glsl: `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`,

  wgsl: `struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@location(0) a_position: vec2f) -> VSOutput {
  var out: VSOutput;
  out.uv = a_position * 0.5 + 0.5;
  out.position = vec4f(a_position, 0.0, 1.0);
  return out;
}
`,
});

/**
 * Basic 3D vertex shader with MVP transform.
 */
export const VERTEX_3D = shaderSource({
  label: "vertex-3d",

  glsl: `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
uniform mat4 u_mvp;
uniform mat4 u_model;
out vec3 v_normal;
out vec3 v_pos;
out vec2 v_uv;
void main() {
  v_normal = mat3(u_model) * a_normal;
  v_pos = (u_model * vec4(a_position, 1.0)).xyz;
  v_uv = a_uv;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`,

  wgsl: `struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) pos: vec3f,
  @location(2) uv: vec2f,
};

@vertex
fn vs_main(
  @location(0) a_position: vec3f,
  @location(1) a_normal: vec3f,
  @location(2) a_uv: vec2f,
) -> VSOutput {
  var out: VSOutput;
  let model3 = mat3x3f(u.model[0].xyz, u.model[1].xyz, u.model[2].xyz);
  out.normal = model3 * a_normal;
  out.pos = (u.model * vec4f(a_position, 1.0)).xyz;
  out.uv = a_uv;
  out.position = u.mvp * vec4f(a_position, 1.0);
  return out;
}
`,
});

/**
 * Solid color fragment shader (useful for testing).
 */
export const SOLID_COLOR_FRAGMENT = shaderSource({
  label: "solid-color-fragment",

  glsl: `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 fragColor;
void main() {
  fragColor = u_color;
}
`,

  wgsl: `struct Uniforms {
  color: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn fs_main() -> @location(0) vec4f {
  return u.color;
}
`,
});

/**
 * UV-gradient test fragment shader.
 */
export const UV_GRADIENT_FRAGMENT = shaderSource({
  label: "uv-gradient-fragment",

  glsl: `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_uv, 0.5, 1.0);
}
`,

  wgsl: `@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(uv, 0.5, 1.0);
}
`,
});

/**
 * Texture sampling fragment shader.
 */
export const TEXTURE_SAMPLE_FRAGMENT = shaderSource({
  label: "texture-sample-fragment",

  glsl: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_uv);
}
`,

  wgsl: `@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var u_texture: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(u_texture, u_sampler, uv);
}
`,
});

// ─── Shader Template Helpers ─────────────────────────────

/**
 * Wrap a GLSL fragment body into a full fragment shader.
 * The user provides the body (after `void main() {`).
 * Uniforms: u_time, u_resolution, u_mouse.
 */
export function wrapFragmentGLSL(body, extraUniforms = "") {
  return `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec4 u_mouse;
${extraUniforms}
out vec4 fragColor;
void main() {
${body}
}
`;
}

/**
 * Wrap a WGSL fragment body into a full fragment shader.
 * The user provides the body of fs_main.
 */
export function wrapFragmentWGSL(body, extraBindings = "") {
  return `struct Uniforms {
  time: f32,
  _pad0: f32,
  resolution: vec2f,
  mouse: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
${extraBindings}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
${body}
}
`;
}

/**
 * Convenience: create a dual-target fragment shader from bodies.
 */
export function dualFragment(glslBody, wgslBody, options = {}) {
  return shaderSource({
    label: options.label || "custom-fragment",
    glsl: wrapFragmentGLSL(glslBody, options.glslUniforms),
    wgsl: wrapFragmentWGSL(wgslBody, options.wgslBindings),
  });
}
