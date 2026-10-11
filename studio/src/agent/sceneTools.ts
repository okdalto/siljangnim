import { z } from "zod";
import type { LoadResult, RuntimeStatus, SceneError } from "../scene/protocol";
import { parseScene, UniformDefSchema, SCENE_INPUTS, type Scene } from "../scene/schema";
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
  const head = `state=${status.state} time=${status.time.toFixed(2)}s frame=${status.frame} fps=${status.fps} size=${status.width}x${status.height}`;
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
    "(it must occur exactly once). Uniform entries are added or replaced; set one to null to remove it.",
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
  }),
  readOnly: false,
  async run({ edits, uniforms, inputs }, env) {
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

const viewportStatus = defineTool({
  name: "viewport_status",
  description: "Runtime status of the scene: state, time, fps, size and any errors collected since it loaded.",
  input: z.object({}),
  readOnly: true,
  async run(_input, env) {
    return { content: statusText(await env.scene.status()) };
  },
});

export const SCENE_TOOLS: ToolDefinition[] = [sceneRead, sceneWrite, sceneEdit, viewportCapture, viewportStatus] as ToolDefinition[];

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
