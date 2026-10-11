// Pure WebGPU helpers: packing scene uniforms into a WGSL uniform struct, and
// turning compilation messages into the same diagnostics GLSL errors give.
import type { ShaderDiagnostic } from "../protocol";
import type { UniformDef, UniformValue } from "../schema";

interface Field {
  name: string;
  wgsl: "f32" | "vec2f" | "vec3f" | "vec4f";
  /** Byte offset in the buffer. */
  offset: number;
  components: number;
}

export interface UniformLayout {
  fields: Field[];
  /** Buffer size in bytes (a multiple of 16). */
  size: number;
  /** `struct Uniforms { ... }` to paste into WGSL. */
  wgsl: string;
}

const SHAPES = {
  f32: { size: 4, align: 4, components: 1 },
  vec2f: { size: 8, align: 8, components: 2 },
  vec3f: { size: 12, align: 16, components: 3 },
  vec4f: { size: 16, align: 16, components: 4 },
} as const;

/** The standard values every scene gets, then the scene's own uniforms in order. */
export const STANDARD_FIELDS: Array<[string, Field["wgsl"]]> = [
  ["time", "f32"],
  ["dt", "f32"],
  ["frame", "f32"],
  ["resolution", "vec2f"],
  ["mouse", "vec4f"],
];

function wgslType(def: UniformDef): Field["wgsl"] {
  switch (def.type) {
    case "vec2":
      return "vec2f";
    case "vec3":
      return "vec3f";
    case "vec4":
      return "vec4f";
    case "color":
      return Array.isArray(def.value) && def.value.length === 4 ? "vec4f" : "vec3f";
    default:
      // int and bool are passed as f32 so one buffer layout fits every scene.
      return "f32";
  }
}

export function uniformLayout(uniforms: Record<string, UniformDef>): UniformLayout {
  const entries: Array<[string, Field["wgsl"]]> = [...STANDARD_FIELDS, ...Object.entries(uniforms).map(([name, def]) => [name, wgslType(def)] as [string, Field["wgsl"]])];
  const fields: Field[] = [];
  let offset = 0;
  for (const [name, wgsl] of entries) {
    const shape = SHAPES[wgsl];
    offset = Math.ceil(offset / shape.align) * shape.align;
    fields.push({ name, wgsl, offset, components: shape.components });
    offset += shape.size;
  }
  const size = Math.max(16, Math.ceil(offset / 16) * 16);
  const body = fields.map((f) => `  ${f.name}: ${f.wgsl},`).join("\n");
  return { fields, size, wgsl: `struct Uniforms {\n${body}\n}` };
}

export function packUniforms(layout: UniformLayout, values: Record<string, UniformValue | number[] | undefined>, into = new Float32Array(layout.size / 4)): Float32Array {
  into.fill(0);
  for (const field of layout.fields) {
    const value = values[field.name];
    const start = field.offset / 4;
    if (typeof value === "number") into[start] = value;
    else if (typeof value === "boolean") into[start] = value ? 1 : 0;
    else if (Array.isArray(value)) for (let i = 0; i < field.components; i++) into[start + i] = value[i] ?? 0;
  }
  return into;
}

interface CompilationMessage {
  type: string;
  lineNum: number;
  linePos: number;
  message: string;
}

/** Errors from GPUShaderModule.getCompilationInfo(), as diagnostics with 1-based lines. */
export function wgslDiagnostics(messages: readonly CompilationMessage[]): ShaderDiagnostic[] {
  return messages.filter((m) => m.type === "error").map((m) => ({ line: m.lineNum, message: m.linePos ? `${m.message} (column ${m.linePos})` : m.message }));
}

/** Fullscreen triangle vertex stage; pass `@location(0) uv: vec2f` (0..1, origin bottom-left) to the fragment stage. */
export const FULLSCREEN_VERTEX_WGSL = `struct FullscreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn fullscreen_vertex(@builtin(vertex_index) i: u32) -> FullscreenOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var out: FullscreenOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + 0.5;
  return out;
}
`;
