// C/D-grade open source: Python packages in isolated environments and CLIs
// installed on the machine, run through the hub (docs/runtime.md).
import { z } from "zod";
import { defineTool, type RuntimeJob, type ToolDefinition, type ToolEnv, type ToolOutput } from "./tools";

const LOG_TAIL = 4000;
const DEFAULT_WAIT_S = 90;
// Below common MCP client tool timeouts, so long jobs come back as "still running" instead of timing out.
const MAX_WAIT_S = 110;

/** Appended when a hand-written run works: the next request should be able to reuse it. */
export const SAVE_RECIPE_HINT =
  "It worked. Before you finish, save this as a recipe (recipe_save with params read from in/params.json, then recipe_verify) so the next request for this can run it directly.";

export function jobReport(job: RuntimeJob, options: { suggestRecipe?: boolean } = {}): ToolOutput {
  const log = job.log.length > LOG_TAIL ? `…${job.log.slice(-LOG_TAIL)}` : job.log;
  const logBlock = log.trim() ? `\n\nOutput (stdout + stderr):\n${log.trimEnd()}` : "";
  if (job.state === "queued" || job.state === "installing" || job.state === "running") {
    const what = job.state === "installing" ? "installing packages" : job.state;
    return { content: `Job ${job.id} is still ${what} (${job.seconds}s so far). Call job_status with id "${job.id}" to wait for it.${logBlock}` };
  }
  const replaced = job.replaced?.length
    ? ` ${job.replaced.join(", ")} replaced the earlier run's file${job.replaced.length === 1 ? "" : "s"}; scenes see the new contents when they load again (scene_write or scene_edit).`
    : "";
  const assets = job.assets.length ? `\nSaved to the project as assets: ${job.assets.join(", ")} (use them by name, e.g. ctx.assets[name]).${replaced}` : "\nNo files were written to out/.";
  if (job.state === "done") {
    return { content: `Job ${job.id} finished in ${job.seconds}s.${assets}${logBlock}${options.suggestRecipe ? `\n\n${SAVE_RECIPE_HINT}` : ""}` };
  }
  const why = job.state === "cancelled" ? "was cancelled" : `failed: ${job.error ?? `exit code ${job.exitCode}`}`;
  return { isError: true, content: `Job ${job.id} ${why}.${job.assets.length ? assets : ""}${logBlock}\n\nFix the problem and run it again.` };
}

async function guard(env: ToolEnv): Promise<ToolOutput | null> {
  const reason = await env.runtime.unavailable();
  return reason ? { isError: true, content: reason } : null;
}

const common = {
  inputs: z.array(z.string()).default([]).describe("Project asset names to copy into the job's in/ folder."),
  timeout_s: z.number().int().min(1).max(1800).default(120).describe("Kill the job after this many seconds of running (installing doesn't count)."),
  wait_s: z.number().int().min(0).max(MAX_WAIT_S).default(DEFAULT_WAIT_S).describe("Return after this long even if the job is still going; then use job_status."),
};

const runtimeStatus = defineTool({
  name: "runtime_status",
  description:
    "What this computer can run: platform and GPU, Python environments already set up (reused when you ask for the same " +
    "packages), and which common CLIs are installed (ffmpeg, blender, openscad, magick, inkscape, vpype, potrace).",
  input: z.object({}),
  readOnly: true,
  async run(_input, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const info = await env.runtime.info();
    const programs = Object.entries(info.programs);
    return {
      content: [
        `Platform: ${info.platform}; accelerators: ${info.accelerators.join(", ") || "none"}; GPUs: ${info.gpus.join(", ") || "none"}`,
        `Python environments: ${info.environments.length ? info.environments.map((p) => (p.length ? p.join(" ") : "(no packages)")).join(" | ") : "none yet"}`,
        `CLIs installed: ${programs.filter(([, ok]) => ok).map(([n]) => n).join(", ") || "none"}; missing: ${programs.filter(([, ok]) => !ok).map(([n]) => n).join(", ") || "none"}`,
      ].join("\n"),
    };
  },
});

const pythonRun = defineTool({
  name: "python_run",
  description:
    "Run Python code with pip packages on this computer, in an isolated environment (created once per package set, then " +
    "reused). The working directory has in/ (the inputs) and out/: write result files to out/ and they become project " +
    "assets the scene can load (meshes, SVGs, images, JSON, audio). Print a short summary to stdout. Pin versions " +
    '(e.g. "trimesh==4.5.3"). The person is asked before code first runs and before new packages are installed. ' +
    "Use it for what the browser can't do well: geometry, image or audio processing, data wrangling, file conversion.",
  input: z.object({
    code: z.string().min(1).describe("A complete Python 3.12 script."),
    packages: z.array(z.string()).max(30).default([]).describe('Pip requirement specs, e.g. ["trimesh==4.5.3", "numpy"].'),
    params: z.record(z.string(), z.unknown()).optional().describe("Written to in/params.json for the script to read."),
    ...common,
  }),
  readOnly: false,
  async run({ code, packages, params, inputs, timeout_s, wait_s }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const job = await env.runtime.run({ kind: "python", code, packages, argv: [], inputs, ...(params ? { params } : {}), timeoutS: timeout_s, waitS: wait_s }, env.signal);
    return jobReport(job, { suggestRecipe: true });
  },
});

const commandRun = defineTool({
  name: "command_run",
  description:
    "Run a command-line program installed on this computer (see runtime_status), e.g. ffmpeg or blender. argv[0] is the " +
    "program, the rest its arguments, with no shell (no pipes or globs). The working directory has in/ (the inputs) and " +
    "out/; files written to out/ become project assets. The person is asked before a program first runs.",
  input: z.object({
    argv: z.array(z.string()).min(1).describe('Program and arguments, e.g. ["ffmpeg", "-i", "in/clip.mp4", "out/frame_%03d.png"].'),
    ...common,
  }),
  readOnly: false,
  async run({ argv, inputs, timeout_s, wait_s }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    const job = await env.runtime.run({ kind: "command", code: "", packages: [], argv, inputs, timeoutS: timeout_s, waitS: wait_s }, env.signal);
    return jobReport(job, { suggestRecipe: true });
  },
});

const jobStatus = defineTool({
  name: "job_status",
  description: "Wait for a python_run or command_run job that was still going, and get its result.",
  input: z.object({
    id: z.string().min(1),
    wait_s: z.number().int().min(0).max(MAX_WAIT_S).default(DEFAULT_WAIT_S),
  }),
  readOnly: true,
  async run({ id, wait_s }, env) {
    const blocked = await guard(env);
    if (blocked) return blocked;
    return jobReport(await env.runtime.job(id, wait_s), { suggestRecipe: true });
  },
});

export const RUNTIME_TOOLS: ToolDefinition[] = [runtimeStatus, pythonRun, commandRun, jobStatus] as ToolDefinition[];
