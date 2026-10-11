// Scene format v2. See docs/studio.md#씬-형식-v2.
import { z } from "zod";

export const UNIFORM_TYPES = ["float", "int", "bool", "vec2", "vec3", "vec4", "color"] as const;
export const SCENE_INPUTS = ["mouse", "keyboard", "camera", "microphone", "midi"] as const;

export type UniformType = (typeof UNIFORM_TYPES)[number];
export type SceneInput = (typeof SCENE_INPUTS)[number];
export type UniformValue = number | boolean | number[];

const VECTOR_SIZE: Partial<Record<UniformType, number>> = { vec2: 2, vec3: 3, vec4: 4, color: 3 };

export const UniformDefSchema = z
  .object({
    type: z.enum(UNIFORM_TYPES),
    value: z.union([z.number(), z.boolean(), z.array(z.number())]),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    label: z.string().optional(),
  })
  .superRefine((def, ctx) => {
    const size = VECTOR_SIZE[def.type];
    if (size !== undefined) {
      // color also accepts an alpha channel
      const ok = Array.isArray(def.value) && (def.value.length === size || (def.type === "color" && def.value.length === 4));
      if (!ok) ctx.addIssue({ code: "custom", message: `${def.type} value must be an array of ${size} numbers` });
    } else if (def.type === "bool") {
      if (typeof def.value !== "boolean") ctx.addIssue({ code: "custom", message: "bool value must be true or false" });
    } else if (typeof def.value !== "number") {
      ctx.addIssue({ code: "custom", message: `${def.type} value must be a number` });
    }
  });

export const SceneSchema = z.object({
  version: z.literal(2),
  backend: z.enum(["webgl2", "webgpu"]).default("webgl2"),
  script: z.object({
    setup: z.string().default(""),
    render: z.string().min(1, "script.render is required"),
    cleanup: z.string().default(""),
  }),
  uniforms: z
    .record(z.string(), UniformDefSchema)
    .default({})
    .superRefine((uniforms, ctx) => {
      for (const name of Object.keys(uniforms)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          ctx.addIssue({ code: "custom", path: [name], message: `"${name}" is not a valid GLSL identifier` });
        }
      }
    }),
  inputs: z.array(z.enum(SCENE_INPUTS)).default([]),
});

export type UniformDef = z.infer<typeof UniformDefSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export type ParseResult = { ok: true; scene: Scene } | { ok: false; errors: string[] };

/** Parse a scene, migrating the v1 format (`render_mode: "script"`) when needed. */
export function parseScene(input: unknown): ParseResult {
  const candidate = isV1Scene(input) ? migrateV1(input) : input;
  const result = SceneSchema.safeParse(candidate);
  if (result.success) return { ok: true, scene: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "scene"}: ${issue.message}`),
  };
}

interface V1Scene {
  render_mode?: string;
  script: { setup?: string; render?: string; cleanup?: string };
  uniforms?: Record<string, { type?: string; value?: unknown }>;
  backendTarget?: string;
}

function isV1Scene(input: unknown): input is V1Scene {
  if (typeof input !== "object" || input === null) return false;
  const obj = input as Record<string, unknown>;
  return obj.version !== 2 && typeof obj.script === "object" && obj.script !== null;
}

function migrateV1(v1: V1Scene) {
  const uniforms: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(v1.uniforms ?? {})) {
    if (def && UNIFORM_TYPES.includes(def.type as UniformType)) uniforms[name] = { type: def.type, value: def.value };
  }
  return {
    version: 2,
    backend: v1.backendTarget === "webgpu" ? "webgpu" : "webgl2",
    script: { setup: v1.script.setup ?? "", render: v1.script.render ?? "", cleanup: v1.script.cleanup ?? "" },
    uniforms,
    inputs: ["mouse"],
  };
}

/** Current values of every scene uniform, keyed by name. */
export function uniformValues(scene: Scene): Record<string, UniformValue> {
  return Object.fromEntries(Object.entries(scene.uniforms).map(([name, def]) => [name, def.value]));
}

export const DEFAULT_SCENE: Scene = {
  version: 2,
  backend: "webgl2",
  script: {
    setup: `const fs = \`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_speed;
uniform vec3 u_tint;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(p);
  float a = atan(p.y, p.x);
  float w = sin(10.0 * r - u_time * u_speed * 2.0 + 3.0 * sin(a * 3.0 + u_time * 0.3));
  vec3 col = mix(vec3(0.07), u_tint, smoothstep(0.0, 1.0, 0.5 + 0.5 * w) * smoothstep(0.9, 0.1, r));
  outColor = vec4(col, 1.0);
}\`;
ctx.state.program = ctx.utils.createProgram(ctx.utils.FULLSCREEN_VERTEX_SHADER, fs);`,
    render: "ctx.utils.drawFullscreen(ctx.state.program);",
    cleanup: "",
  },
  uniforms: {
    u_speed: { type: "float", value: 1, min: 0, max: 4, step: 0.01, label: "Speed" },
    u_tint: { type: "color", value: [1, 0.3, 0.18], label: "Tint" },
  },
  inputs: ["mouse"],
};
