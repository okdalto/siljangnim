// Shader compilation with structured, agent-readable errors.
import type { ShaderDiagnostic } from "../protocol";

/** Attribute locations bound before linking, so shared VAOs work with any program. */
export const ATTRIB = { position: 0, normal: 1, uv: 2 } as const;

export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const MESH_VERTEX_SHADER = `#version 300 es
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

export class ShaderError extends Error {
  readonly stage: "vertex" | "fragment" | "link";
  readonly diagnostics: ShaderDiagnostic[];
  readonly excerpt: string;

  constructor(stage: "vertex" | "fragment" | "link", log: string, source: string) {
    super(`${stage} shader ${stage === "link" ? "link" : "compile"} failed: ${firstLine(log)}`);
    this.name = "ShaderError";
    this.stage = stage;
    this.diagnostics = parseShaderLog(log);
    this.excerpt = excerptAround(source, this.diagnostics[0]?.line);
  }
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

/** Parse ANGLE/driver logs: `ERROR: 0:12: 'x' : undeclared identifier`. */
export function parseShaderLog(log: string): ShaderDiagnostic[] {
  const out: ShaderDiagnostic[] = [];
  for (const line of log.split("\n")) {
    const match = line.match(/(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)/);
    if (match?.[1] && match[2] !== undefined) out.push({ line: Number(match[1]), message: match[2].trim() });
  }
  return out;
}

/** Numbered source lines around `line` (1-based), marking the line itself. */
export function excerptAround(source: string, line: number | undefined, radius = 3): string {
  if (!line) return "";
  const lines = source.split("\n");
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(`${n === line ? ">" : " "} ${String(n).padStart(4)} | ${lines[n - 1]}`);
  return out.join("\n");
}

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("gl.createShader returned null (WebGL context lost?)");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new ShaderError(type === gl.VERTEX_SHADER ? "vertex" : "fragment", log, source);
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, ATTRIB.position, "a_position");
  gl.bindAttribLocation(program, ATTRIB.normal, "a_normal");
  gl.bindAttribLocation(program, ATTRIB.uv, "a_uv");
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new ShaderError("link", log, fragmentSource);
  }
  return program;
}
