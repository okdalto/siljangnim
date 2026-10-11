// Scene format v2. See docs/studio.md#씬-형식-v2.
import { z } from "zod";
import { EASES } from "./gl/keyframes";

export const UNIFORM_TYPES = ["float", "int", "bool", "vec2", "vec3", "vec4", "color"] as const;
export const SCENE_INPUTS = ["mouse", "keyboard", "camera", "microphone", "midi", "osc"] as const;

export type UniformType = (typeof UNIFORM_TYPES)[number];
export type SceneInput = (typeof SCENE_INPUTS)[number];
export type UniformValue = number | boolean | number[];

const VECTOR_SIZE: Partial<Record<UniformType, number>> = { vec2: 2, vec3: 3, vec4: 4, color: 3 };

/** How a uniform is shown. Each widget accepts only some uniform types (see WIDGET_TYPES). */
export const WIDGETS = ["slider", "knob", "pad", "select", "button", "toggle"] as const;
export type Widget = (typeof WIDGETS)[number];

export const WIDGET_TYPES: Record<Widget, readonly UniformType[]> = {
  slider: ["float", "int"],
  knob: ["float", "int"],
  pad: ["vec2"],
  select: ["int", "float"],
  // Pulses: true for exactly one rendered frame per press.
  button: ["bool"],
  toggle: ["bool"],
};

export const UniformDefSchema = z
  .object({
    type: z.enum(UNIFORM_TYPES),
    value: z.union([z.number(), z.boolean(), z.array(z.number())]),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    label: z.string().optional(),
    widget: z.enum(WIDGETS).optional(),
    /** Choices for widget "select". */
    options: z.array(z.object({ label: z.string(), value: z.number() })).min(1).optional(),
  })
  .superRefine((def, ctx) => {
    if (def.widget && !WIDGET_TYPES[def.widget].includes(def.type)) {
      ctx.addIssue({ code: "custom", message: `widget "${def.widget}" needs a ${WIDGET_TYPES[def.widget].join(" or ")} uniform, not ${def.type}` });
    }
    if (def.widget === "select" && !def.options) ctx.addIssue({ code: "custom", message: 'widget "select" needs options: [{ "label": "…", "value": 0 }, …]' });
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

export const TimelineSchema = z.object({
  duration: z.number().positive().max(3600),
  loop: z.boolean().default(true),
  /** On loop, keep running instead of re-running setup (stateless scenes, or ones that should evolve). */
  preserveStateOnLoop: z.boolean().default(false),
});

export const KeyframeSchema = z.object({
  time: z.number().min(0),
  value: z.number(),
  ease: z.enum(EASES).optional(),
});

/** Uniform types keyframes can animate. Vectors and colors come later (per component). */
export const KEYFRAMABLE: readonly UniformType[] = ["float", "int"];

export const SceneSchema = z
  .object({
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
  timeline: TimelineSchema.optional(),
  /** Optional custom panel: agent-written HTML in a sandboxed iframe (see app/panel.ts). */
  panel: z.object({ html: z.string().min(1).max(200_000), height: z.number().int().min(60).max(800).default(220) }).optional(),
  /** Optional grouping of the controls panel; uniforms not listed show after the groups. */
  controls: z.array(z.object({ label: z.string(), uniforms: z.array(z.string()).min(1) })).optional(),
  /** Uniform name → keys. Requires a timeline. */
  keyframes: z.record(z.string(), z.array(KeyframeSchema)).default({}),
})
  .superRefine((scene, ctx) => {
    for (const [i, group] of (scene.controls ?? []).entries()) {
      for (const name of group.uniforms) {
        if (!scene.uniforms[name]) ctx.addIssue({ code: "custom", path: ["controls", i], message: `group "${group.label}" lists "${name}", which is not a uniform` });
      }
    }
    const tracks = Object.entries(scene.keyframes);
    if (tracks.length && !scene.timeline) {
      ctx.addIssue({ code: "custom", path: ["keyframes"], message: 'keyframes need a timeline, e.g. "timeline": { "duration": 10, "loop": true }' });
    }
    for (const [name, keys] of tracks) {
      const def = scene.uniforms[name];
      if (!def) {
        ctx.addIssue({ code: "custom", path: ["keyframes", name], message: `no uniform "${name}"; keyframes animate existing uniforms` });
      } else if (!KEYFRAMABLE.includes(def.type)) {
        ctx.addIssue({ code: "custom", path: ["keyframes", name], message: `"${name}" is ${def.type}; only float and int uniforms can have keyframes` });
      }
      if (!keys.length) ctx.addIssue({ code: "custom", path: ["keyframes", name], message: "empty track; remove it instead" });
      const late = scene.timeline && keys.find((k) => k.time > scene.timeline!.duration);
      if (late) {
        ctx.addIssue({ code: "custom", path: ["keyframes", name], message: `key at ${late.time}s is after the timeline end (${scene.timeline!.duration}s)` });
      }
    }
  });

export type UniformDef = z.infer<typeof UniformDefSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;

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
    keyframes: {},
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
  keyframes: {},
};
