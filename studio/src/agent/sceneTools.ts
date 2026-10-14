import { z } from "zod";
import type { LoadResult, RuntimeStatus, SceneError } from "../scene/protocol";
import { blobToBase64 } from "../project/assets";
import { KeyframeSchema, parseScene, SCENE_INPUTS, TimelineSchema, UniformDefSchema, type Scene } from "../scene/schema";
import { defineTool, type ToolDefinition, type ToolOutput } from "./tools";

export function formatSceneError(e: SceneError): string {
  const where = [e.source, e.stage].filter(Boolean).join("/");
  const at = e.line ? ` line ${e.line}${e.column ? `:${e.column}` : ""}` : "";
  let text = `[${where}]${at} ${e.message}`;
  if (e.diagnostics && e.diagnostics.length > 1) {
    text += "\n" + e.diagnostics.map((d) => `  line ${d.line}: ${d.message}`).join("\n");
  }
  if (e.excerpt) text += "\n" + e.excerpt;
  return text;
}

export function loadReport(result: LoadResult): ToolOutput {
  if (result.ok) return { content: "Scene loaded and rendering without errors. Capture the viewport to check that it looks right." };
  const errors = result.errors.map(formatSceneError).join("\n\n");
  return { isError: true, content: `The scene was saved but failed to run:\n\n${errors}\n\nFix these and apply the scene again.` };
}

function statusText(status: RuntimeStatus): string {
  const monitors = Object.entries(status.monitors ?? {});
  const head =
    `state=${status.state} time=${status.time.toFixed(2)}s frame=${status.frame} fps=${status.fps} size=${status.width}x${status.height}` +
    (monitors.length ? `\nMonitors: ${monitors.map(([k, v]) => `${k}=${typeof v === "number" ? Number(v.toFixed(4)) : v}`).join(", ")}` : "");
  if (!status.errors.length) return `${head}\nNo errors.`;
  return `${head}\nErrors:\n${status.errors.map(formatSceneError).join("\n\n")}`;
}

function invalid(errors: string[]): ToolOutput {
  return { isError: true, content: `The scene is not valid, nothing was applied:\n${errors.map((e) => `- ${e}`).join("\n")}` };
}

const sceneRead = defineTool({
  name: "scene_read",
  description: "Return the current scene JSON (script, uniforms, inputs).",
  input: z.object({}),
  readOnly: true,
  async run(_input, env) {
    return { content: JSON.stringify(env.scene.get(), null, 2) };
  },
});

const sceneWrite = defineTool({
  name: "scene_write",
  description:
    "Replace the whole scene and run it. Returns load errors (shader compile errors with line numbers, script exceptions) if any. " +
    "Use for new scenes or large rewrites; use scene_edit for targeted changes.",
  input: z.object({
    scene: z.record(z.string(), z.unknown()).describe("Complete scene object in format version 2."),
  }),
  readOnly: false,
  async run({ scene }, env) {
    const parsed = parseScene(scene);
    if (!parsed.ok) return invalid(parsed.errors);
    return loadReport(await env.scene.apply(parsed.scene));
  },
});

const ScriptPhase = z.enum(["setup", "render", "cleanup"]);

const sceneEdit = defineTool({
  name: "scene_edit",
  description:
    "Edit the current scene in place and run it. Text edits replace an exact snippet of a script phase " +
    "(it must occur exactly once). Uniform entries are added or replaced; set one to null to remove it. " +
    "timeline sets the animation length and looping (null removes it and all keyframes). keyframes replaces a " +
    "uniform's whole key list (null removes that track); only float/int uniforms can be keyed.",
  input: z.object({
    edits: z
      .array(
        z.object({
          phase: ScriptPhase,
          find: z.string().min(1).describe("Exact text currently in that phase, including whitespace."),
          replace: z.string(),
        }),
      )
      .default([]),
    uniforms: z.record(z.string(), UniformDefSchema.nullable()).optional(),
    inputs: z.array(z.enum(SCENE_INPUTS)).optional(),
    controls: z
      .array(z.object({ label: z.string(), uniforms: z.array(z.string()).min(1) }))
      .nullable()
      .optional()
      .describe("Control panel groups; replaces the current grouping. null removes it (flat panel)."),
    panel: z
      .object({ html: z.string().min(1), height: z.number().int().min(60).max(800).optional() })
      .nullable()
      .optional()
      .describe("Custom HTML panel (see the system prompt); null removes it."),
    timeline: TimelineSchema.nullable().optional(),
    keyframes: z
      .record(z.string(), z.array(KeyframeSchema).nullable())
      .optional()
      .describe('Uniform name → keys [{ "time": s, "value": n, "ease"?: "smooth"|"linear"|"easeIn"|"easeOut"|"easeInOut"|"step" }].'),
  }),
  readOnly: false,
  async run({ edits, uniforms, inputs, controls, panel, timeline, keyframes }, env) {
    const scene: Scene = structuredClone(env.scene.get());
    const problems: string[] = [];
    for (const [i, edit] of edits.entries()) {
      const source = scene.script[edit.phase];
      const count = source.split(edit.find).length - 1;
      if (count !== 1) {
        problems.push(`edit ${i + 1}: "find" occurs ${count} times in script.${edit.phase} (must be exactly once)`);
        continue;
      }
      scene.script[edit.phase] = source.replace(edit.find, () => edit.replace);
    }
    if (problems.length) {
      return { isError: true, content: `No edits were applied:\n${problems.join("\n")}\nRead the scene and retry with exact snippets.` };
    }
    for (const [name, def] of Object.entries(uniforms ?? {})) {
      if (def === null) delete scene.uniforms[name];
      else scene.uniforms[name] = def;
    }
    if (inputs) scene.inputs = inputs;
    if (panel === null) delete scene.panel;
    else if (panel) scene.panel = { html: panel.html, height: panel.height ?? 220 };
    if (controls === null) delete scene.controls;
    else if (controls) scene.controls = controls;
    if (timeline === null) {
      delete scene.timeline;
      scene.keyframes = {};
    } else if (timeline) {
      scene.timeline = timeline;
    }
    for (const [name, keys] of Object.entries(keyframes ?? {})) {
      if (keys === null) delete scene.keyframes[name];
      else scene.keyframes[name] = keys;
    }
    // Removing a uniform takes its keyframes and group entries with it.
    for (const name of Object.keys(scene.keyframes)) if (!scene.uniforms[name]) delete scene.keyframes[name];
    if (scene.controls) {
      scene.controls = scene.controls.map((g) => ({ ...g, uniforms: g.uniforms.filter((n) => scene.uniforms[n]) })).filter((g) => g.uniforms.length);
    }
    const parsed = parseScene(scene);
    if (!parsed.ok) return invalid(parsed.errors);
    return loadReport(await env.scene.apply(parsed.scene));
  },
});

const viewportCapture = defineTool({
  name: "viewport_capture",
  description: "Take a screenshot of the running scene to check what it looks like. Returns a PNG plus the runtime status.",
  input: z.object({
    max_size: z.number().int().min(128).max(1536).default(768).describe("Longest side of the returned image in pixels."),
  }),
  readOnly: true,
  async run({ max_size }, env) {
    const [capture, status] = await Promise.all([env.scene.capture(max_size), env.scene.status()]);
    return {
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: await blobToBase64(capture.png) } },
        { type: "text", text: statusText(status) },
      ],
    };
  },
});

const viewportRecord = defineTool({
  name: "viewport_record",
  description:
    "Record the scene to a file saved as a project asset (the viewer also starts a browser download, which a browser may block when it is not the first from this page): MP4 or WebM video, or PNG frames " +
    "in a zip. Offline mode renders frame by frame from the start at exact timestamps (smooth at any size); realtime mode " +
    "captures what plays, including the person's interaction (WebM only). Duration defaults to the timeline length, or 5 s. " +
    "Audio the scene plays out loud (ctx.utils.audio.play) goes in as the soundtrack, from the scene's start, and offline " +
    "renders compute ctx.audio from it at each frame's time, so audio-reactive scenes and music videos come out in sync.",
  input: z.object({
    format: z.enum(["mp4", "webm", "png"]).default("mp4"),
    mode: z.enum(["offline", "realtime"]).default("offline"),
    duration: z.number().positive().max(600).optional().describe("Seconds."),
    fps: z.number().int().min(1).max(120).default(30),
    width: z.number().int().min(0).max(7680).default(0).describe("0 keeps the viewport size."),
    height: z.number().int().min(0).max(4320).default(0),
    quality: z.enum(["low", "medium", "high", "very-high"]).default("high"),
    audio: z.boolean().default(true).describe("Include the scene's soundtrack (video formats)."),
  }),
  readOnly: false,
  async run(input, env) {
    const duration = input.duration ?? env.scene.get().timeline?.duration ?? 5;
    const format = input.mode === "realtime" ? "webm" : input.format;
    const saved = await env.scene.record({ ...input, format, duration });
    const mb = (saved.bytes / 1024 / 1024).toFixed(1);
    const sound = saved.audio ? " with the scene's soundtrack" : "";
    return { content: `Recorded ${saved.frames} frames at ${saved.width}x${saved.height} (${duration}s, ${input.fps} fps)${sound} to ${saved.asset} (${mb} MB). It is saved as a project asset, and a browser download was started for the person; browsers can block repeated automatic downloads from the same page, so if they don't see the file, ask them to allow downloads for the viewer.` };
  },
});

const viewportStatus = defineTool({
  name: "viewport_status",
  description: "Runtime status of the scene: state, time, fps, size and any errors collected since it loaded.",
  input: z.object({}),
  readOnly: true,
  async run(_input, env) {
    return { content: statusText(await env.scene.status()) };
  },
});

export const SCENE_TOOLS: ToolDefinition[] = [sceneRead, sceneWrite, sceneEdit, viewportCapture, viewportStatus, viewportRecord] as ToolDefinition[];
