/**
 * WebGL2 shader compilation utilities.
 */

export const DEFAULT_QUAD_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const DEFAULT_3D_VERTEX_SHADER = `#version 300 es
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
`;

/**
 * Compile a single shader (vertex or fragment).
 * @returns {WebGLShader}
 */
export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const errors = parseGLSLErrors(log);
    const err = new Error(`Shader compile error:\n${log}`);
    err.glslErrors = errors;
    throw err;
  }
  return shader;
}

/**
 * Create a linked WebGL program from vertex + fragment source.
 * @returns {WebGLProgram}
 */
export function createProgram(gl, vertSource, fragSource) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  // Shaders can be deleted after linking
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error:\n${log}`);
  }
  return program;
}

/**
 * Parse GLSL error log into structured error objects.
 * @returns {Array<{line: number, message: string}>}
 */
export function parseGLSLErrors(errorLog) {
  if (!errorLog) return [];
  const errors = [];
  const lines = errorLog.split("\n");
  for (const line of lines) {
    // Typical format: ERROR: 0:12: 'something' : error message
    const match = line.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
    if (match) {
      errors.push({ line: parseInt(match[1], 10), message: match[2].trim() });
    }
  }
  return errors;
}
