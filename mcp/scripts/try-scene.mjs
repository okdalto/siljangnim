// Runs a scene file in a throwaway viewer the way an agent would (scene_write), reports what scene_write
// said (errors with line numbers), then records it offline and saves frames, for building examples
// without rebuilding the studio. Needs a studio build (npm --prefix studio run build).
//   node mcp/scripts/try-scene.mjs <scene.json> <out dir> <seconds> <width>x<height> [frame times, e.g. 1,3,6]
// SILJANGNIM_TRY_STEPS=<steps.json>: tool calls to make first, [{ "tool": "python_run", "args": {…} }, …], e.g. to
// make assets with Python (files written to out/ become assets; the viewer approves runs, and has a fake microphone
// and camera). Python environments and recipes go to a throwaway runtime, not ~/.siljangnim or ~/Siljangnim.
import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [sceneArg, outArg, secondsArg, sizeArg, timesArg] = process.argv.slice(2);
const size = sizeArg?.match(/^(\d+)x(\d+)$/);
if (!sceneArg || !outArg || !Number(secondsArg) || !size) {
  console.error("usage: try-scene.mjs <scene.json> <out dir> <seconds> <width>x<height> [frame times]");
  process.exit(2);
}
const scene = JSON.parse(readFileSync(resolve(sceneArg), "utf8"));
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = createRequire(join(mcpDir, "..", "desktop", "package.json"))("electron");
const scratch = mkdtempSync(join(tmpdir(), "siljangnim-try-"));
const downloads = join(scratch, "downloads");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let viewer = null;
process.on("exit", () => viewer?.kill("SIGKILL"));
// A port of its own per run, so several of these can run at once.
const port = process.env.SILJANGNIM_PORT || String(48000 + Math.floor(Math.random() * 1500));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(mcpDir, "bin", "siljangnim-mcp.js")],
  env: {
    ...process.env,
    SILJANGNIM_OPEN: "0",
    SILJANGNIM_VIEWER: "browser",
    SILJANGNIM_PORT: port,
    // Shared between runs (Python environments take a while to set up), but never the person's own.
    SILJANGNIM_RUNTIME_ROOT: process.env.SILJANGNIM_RUNTIME_ROOT || join(mcpDir, "..", "desktop", "release", "try-runtime"),
    SILJANGNIM_RECIPES_DIR: join(scratch, "recipes"),
  },
  stderr: "pipe",
});
transport.stderr.on("data", (chunk) => {
  const url = String(chunk).match(/opening the viewer: (\S+)/)?.[1];
  if (url && !viewer) {
    viewer = spawn(electronPath, [join(mcpDir, "scripts", "viewer.cjs")], {
      env: { ...process.env, SILJANGNIM_VIEWER_URL: url, SILJANGNIM_SMOKE_OUT: scratch },
      stdio: "ignore",
    });
  }
});
const client = new Client({ name: "try-scene", version: "1" });
await client.connect(transport);
const text = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
async function call(name, args, timeout = 120_000) {
  let result = await client.callTool({ name, arguments: args }, undefined, { timeout });
  for (;;) {
    const pending = !result.isError && text(result).match(/call_id "([^"]+)"/);
    if (!pending) return result;
    result = await client.callTool({ name: "viewer_call_status", arguments: { call_id: pending[1] } }, undefined, { timeout });
  }
}
try {
  await call("viewer_open", {});
  const steps = process.env.SILJANGNIM_TRY_STEPS ? JSON.parse(readFileSync(resolve(process.env.SILJANGNIM_TRY_STEPS), "utf8")) : [];
  for (const step of steps) {
    // Long jobs come back as still running; wait them out.
    let result = await call(step.tool, step.args ?? {}, 1_800_000);
    for (let job; (job = text(result).match(/Call job_status with id "([^"]+)"/)?.[1]); ) {
      result = await call("job_status", { id: job }, 1_800_000);
    }
    console.log(`${step.tool}: ${result.isError ? "ERROR " : ""}${text(result).slice(0, 3000)}`);
    if (result.isError) process.exitCode = 1;
  }
  const written = await call("scene_write", { scene });
  console.log(`scene_write: ${written.isError ? "ERROR " : ""}${text(written)}`);
  if (written.isError || !/without errors/.test(text(written))) process.exitCode = 1;
  await wait(1500);
  const status = await call("viewport_status", {});
  console.log(`viewport_status: ${text(status).slice(0, 1200)}`);
  const before = new Set(existsSync(downloads) ? readdirSync(downloads) : []);
  const rec = await call(
    "viewport_record",
    { format: "mp4", mode: "offline", duration: Number(secondsArg), fps: 30, width: Number(size[1]), height: Number(size[2]), quality: "high" },
    600_000,
  );
  console.log(`viewport_record: ${rec.isError ? "ERROR " : ""}${text(rec).split("\n")[0]}`);
  let file = null;
  for (let i = 0; i < 100 && !file; i++) {
    file = existsSync(downloads) ? readdirSync(downloads).find((f) => !before.has(f) && f.endsWith(".mp4")) : null;
    if (!file) await wait(200);
  }
  if (file) {
    const video = join(out, "clip.mp4");
    copyFileSync(join(downloads, file), video);
    for (const t of (timesArg || `${Number(secondsArg) / 2}`).split(",").map(Number)) {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", join(out, `frame-${t}.png`)]);
    }
    console.log(`saved ${video} and frames in ${out}`);
  } else {
    console.log("no recording");
    process.exitCode = 1;
  }
  writeFileSync(join(out, "report.txt"), `${text(written)}\n\n${text(status)}\n\n${text(rec)}\n`);
} finally {
  viewer?.kill("SIGTERM");
  await client.close();
}
