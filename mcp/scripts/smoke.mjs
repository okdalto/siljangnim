// End-to-end check of the MCP path, the way an agent uses it: starts the
// bridge over stdio, lets "the person's browser" (an Electron window) open
// the viewer, calls the tools and checks results and what the viewer shows.
// Needs studio/dist (npm run smoke builds it first). Report in mcp/smoke-out/.
import { spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { meanColor } from "./png.mjs";

const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(mcpDir, "smoke-out");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const electronPath = createRequire(join(mcpDir, "..", "desktop", "package.json"))("electron");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let viewer = null;
// Never leave the viewer window behind (an orphan keeps writing viewer.json into the next run).
process.on("exit", () => viewer?.kill("SIGKILL"));
const timeout = setTimeout(() => {
  console.error("[mcp-smoke] timed out");
  process.exit(1);
}, 180_000);
const transport = new StdioClientTransport({
  command: process.execPath,
  // SILJANGNIM_SMOKE_BIN: an installed package's bin instead of the repo's (checks a packed release).
  args: [process.env.SILJANGNIM_SMOKE_BIN || join(mcpDir, "bin", "siljangnim-mcp.js")],
  env: {
    ...process.env,
    SILJANGNIM_OPEN: "0",
    SILJANGNIM_PORT: "47911",
    // Reuse the desktop smoke's Python install instead of setting one up in ~/.siljangnim.
    SILJANGNIM_RUNTIME_ROOT: process.env.SILJANGNIM_SMOKE_RUNTIME || join(mcpDir, "..", "desktop", "release", "smoke-profile", "runtime"),
    SILJANGNIM_RECIPES_DIR: join(out, "recipes"),
    // The repository's own registry folder stands in for the published one.
    SILJANGNIM_REGISTRY_URL: join(mcpDir, "..", "registry"),
  },
  stderr: "pipe",
});
transport.stderr.on("data", (chunk) => {
  const text = String(chunk);
  process.stderr.write(text);
  const url = text.match(/opening the viewer: (\S+)/)?.[1];
  if (url && !viewer) {
    const extra = process.platform === "linux" ? ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];
    viewer = spawn(electronPath, [join(mcpDir, "scripts", "viewer.cjs"), ...extra], {
      env: { ...process.env, SILJANGNIM_VIEWER_URL: url, SILJANGNIM_SMOKE_OUT: out },
      stdio: "ignore",
    });
  }
});

const client = new Client({ name: "claude-code", version: "smoke" });
await client.connect(transport);
const calls = {};
const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  calls[name] = result;
  return result;
};
const text = (result) => result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

const SCENE = {
  version: 2,
  script: {
    setup: `ctx.state.p = ctx.utils.createProgram(ctx.utils.FULLSCREEN_VERTEX_SHADER, \`#version 300 es
precision highp float;
out vec4 outColor; uniform float u_gain;
void main(){ outColor = vec4(vec3(0.1, 0.35, 1.0) * u_gain, 1.0); }\`);`,
    render: "ctx.publish('frames', ctx.frame); ctx.utils.drawFullscreen(ctx.state.p);",
  },
  uniforms: { u_gain: { type: "float", value: 1, min: 0, max: 1, label: "Gain", widget: "knob" } },
};

const { tools } = await client.listTools();
const instructions = client.getInstructions() ?? "";
await call("viewer_open");
await call("scene_write", { scene: SCENE });
const capture = await call("viewport_capture", { max_size: 256 });
const image = capture.content.find((c) => c.type === "image");
const rgb = image ? meanColor(Buffer.from(image.data, "base64")) : null;
// M3: recording, offline (MP4, PNG frames) and realtime (WebM).
const mp4 = await call("viewport_record", { format: "mp4", duration: 1, fps: 30, width: 320, height: 240 });
const png = await call("viewport_record", { format: "png", duration: 0.2, fps: 10 });
const live = await call("viewport_record", { mode: "realtime", duration: 1 });
await call("scene_edit", { timeline: { duration: 4, preserveStateOnLoop: true }, keyframes: { u_gain: [{ time: 0, value: 1 }, { time: 2, value: 1 }] } });
await call("python_run", {
  code: "import json, pathlib\npathlib.Path('out/points.json').write_text(json.dumps([[0, 0], [1, 1]]))\nprint('wrote 2 points')",
});
// D grade: a CLI on PATH (node is there wherever this smoke runs), no shell.
await call("command_run", { argv: ["node", "-e", "require('fs').writeFileSync('out/cli.txt', 'cli ok')"] });
const status = await call("runtime_status");
const catalog = await call("catalog_search", { query: "plotter svg" });
const registrySearch = await client.callTool({ name: "recipe_search", arguments: { query: "torus" } });
const registryInstall = await client.callTool({ name: "recipe_install", arguments: { id: "trimesh.torus-knot" } });
const installedRecipe = existsSync(join(out, "recipes", "trimesh.torus-knot", "recipe.md")) ? readFileSync(join(out, "recipes", "trimesh.torus-knot", "recipe.md"), "utf8") : "";

// Stage 4: save what worked as a recipe, verify it, find it, run it with new params.
await call("recipe_save", {
  id: "smoke.points",
  title: "Points on a circle",
  capability: "points-generate circle",
  kind: "python",
  code: "import json, math, pathlib\np = pathlib.Path('in/params.json')\nparams = json.loads(p.read_text()) if p.exists() else {}\nn = int(params.get('n', 4))\npts = [[math.cos(2*math.pi*i/n), math.sin(2*math.pi*i/n)] for i in range(n)]\npathlib.Path('out/circle.json').write_text(json.dumps(pts))\nprint('points', n)",
  source: { name: "python stdlib", license: "PSF" },
  verify: { params: { n: 3 }, expect_outputs: ["circle.json"] },
});
await call("recipe_verify", { id: "smoke.points" });
const found = await call("recipe_search", { query: "circle" });
await call("recipe_run", { id: "smoke.points", params: { n: 12 } });
await call("asset_list");
await wait(2500); // controls-style version commit after edits go quiet
const history = await call("history_list");
await wait(600);
const viewerState = JSON.parse(readFileSync(join(out, "viewer.json"), "utf8"));

// M3: inputs. Chromium's fake camera, and audio analysis of a tone the scene
// generates (the fake microphone hangs on macOS, where capture needs OS permission).
const inputScene = await client.callTool({ name: "scene_write", arguments: {
  scene: {
    version: 2,
    inputs: ["camera"],
    script: {
      setup: `const rate = 22050, seconds = 2, samples = rate * seconds;
const wav = new DataView(new ArrayBuffer(44 + samples * 2));
const text = (o, s) => [...s].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
text(0, "RIFF"); wav.setUint32(4, 36 + samples * 2, true); text(8, "WAVEfmt "); wav.setUint32(16, 16, true);
wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, rate, true); wav.setUint32(28, rate * 2, true);
wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); text(36, "data"); wav.setUint32(40, samples * 2, true);
for (let i = 0; i < samples; i++) wav.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 110 * i / rate) * 20000, true);
await ctx.utils.audio.play(URL.createObjectURL(new Blob([wav.buffer], { type: "audio/wav" })), { loop: true, output: false });
ctx.state.cam = await ctx.utils.createCameraTexture({ width: 640, height: 480 });
ctx.state.p = ctx.utils.createProgram(ctx.utils.FULLSCREEN_VERTEX_SHADER, \`#version 300 es
precision highp float; in vec2 v_uv; out vec4 outColor; uniform sampler2D u_cam; uniform vec4 u_audio;
void main() { outColor = vec4(texture(u_cam, v_uv).rgb + u_audio.x, 1.0); }\`);
ctx.state.max = 0;`,
      render: `ctx.state.cam.update();
const p = ctx.state.p;
ctx.gl.useProgram(p);
ctx.utils.bindTexture(p, "u_cam", ctx.state.cam.texture, 0);
ctx.utils.drawFullscreen(p);
ctx.state.max = Math.max(ctx.state.max, ctx.audio.level);
ctx.publish("audioActive", ctx.audio.active);
ctx.publish("bass", ctx.audio.bass);
ctx.publish("maxLevel", ctx.state.max);
ctx.publish("camWidth", ctx.state.cam.width);`,
    },
  },
} });
await wait(2500);
const inputs = await client.callTool({ name: "viewport_status", arguments: {} });

// Shadertoy-style code through ctx.utils.shadertoy: an Image pass reading a feedback Buffer A.
const toyScene = await client.callTool({ name: "scene_write", arguments: {
  scene: {
    version: 2,
    script: {
      setup: `ctx.state.toy = ctx.utils.shadertoy(
  "void mainImage(out vec4 o, in vec2 p) { o = vec4(texture(iChannel0, p / iResolution.xy).rgb, 1.0); }",
  { channels: ["A"], buffers: { A: { channels: ["A"], code: "void mainImage(out vec4 o, in vec2 p) { vec2 uv = p / iResolution.xy; o = vec4(texture(iChannel0, uv).rgb * 0.9 + vec3(uv, 0.5 + 0.5 * sin(iTime)) * 0.1, 1.0); }" } } });`,
      render: `ctx.state.toy.draw();`,
    },
  },
} });
await wait(1200);
const toyCapture = await client.callTool({ name: "viewport_capture", arguments: { max_size: 128 } });

// OSC: the hub listens on UDP, the viewer streams it into ctx.osc. Sent from here with dgram.
const oscPort = await new Promise((resolve) => {
  const probe = createSocket("udp4");
  probe.bind(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const oscScene = await client.callTool({ name: "scene_write", arguments: {
  scene: {
    version: 2,
    script: {
      setup: `ctx.utils.listenOsc(${oscPort}); ctx.state.count = 0;`,
      render: `ctx.state.count += ctx.osc.messages.length;
ctx.publish("oscActive", ctx.osc.active);
ctx.publish("oscFader", ctx.osc.get("/fader", 0, -1));
ctx.publish("oscText", String(ctx.osc.values["/label"]?.[0] ?? ""));
ctx.publish("oscCount", ctx.state.count);
ctx.gl.clearColor(0, 0, ctx.osc.get("/fader"), 1); ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);`,
    },
  },
} });
await wait(1500);
const oscSender = createSocket("udp4");
const pad4 = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const oscMessage = (address, tags, payload) => Buffer.concat([pad4(Buffer.from(address)), pad4(Buffer.from(tags)), payload]);
const float = Buffer.alloc(4);
float.writeFloatBE(0.75);
for (const msg of [oscMessage("/fader", ",f", float), oscMessage("/label", ",s", pad4(Buffer.from("hello")))]) {
  await new Promise((resolve) => oscSender.send(msg, oscPort, "127.0.0.1", resolve));
}
oscSender.close();
await wait(1000);
const oscStatus = await client.callTool({ name: "viewport_status", arguments: {} });

// Stage 5: project.md. The agent's export, the person's bundle (.zip) and an import of each.
let commandSerial = 0;
/** Run JS in the viewer page, as the person would act there. */
const inPage = async (code, timeoutMs = 15_000) => {
  const dir = join(out, "commands");
  mkdirSync(dir, { recursive: true });
  const name = `c${++commandSerial}`;
  writeFileSync(join(dir, `${name}.js`), code);
  for (const end = Date.now() + timeoutMs; Date.now() < end; await wait(150)) {
    if (existsSync(join(dir, `${name}.json`))) return JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
  }
  return { ok: false, error: "timed out" };
};
// Stage 6: the job queue. A long job comes back "still running"; the person cancels it in the Jobs tab.
const longJob = await client.callTool({ name: "python_run", arguments: { code: "import time\nprint('working', flush=True)\ntime.sleep(60)", wait_s: 1 } });
const longId = text(longJob).match(/Job (\w+) is still/)?.[1];
const jobsPanel = await inPage(`(async () => {
  [...document.querySelectorAll('[role="tab"]')].find((t) => t.innerText === "Jobs").click();
  for (let i = 0; i < 40 && !document.querySelector('[data-cancel-job="${longId}"]'); i++) await new Promise((r) => setTimeout(r, 100));
  const row = document.querySelector('[data-job="${longId}"]');
  const label = row?.innerText ?? "";
  document.querySelector('[data-cancel-job="${longId}"]')?.click();
  for (let i = 0; i < 60 && row?.dataset.jobState !== "cancelled"; i++) await new Promise((r) => setTimeout(r, 100));
  const state = document.querySelector('[data-job="${longId}"]')?.dataset.jobState;
  [...document.querySelectorAll('[role="tab"]')].find((t) => t.innerText === "Activity").click();
  return { label, state, rows: document.querySelectorAll("[data-job]").length };
})()`);
const longAfter = longId ? await client.callTool({ name: "job_status", arguments: { id: longId, wait_s: 5 } }) : null;
const exported = await call("project_export_md");
const md = text(exported);
// The menu may take a moment to render: wait for the button rather than a fixed delay.
await inPage(`(async () => {
  document.querySelector('[title="Projects"]').click();
  for (let i = 0; i < 50 && !document.querySelector('[data-testid="export-project"]'); i++) await new Promise((r) => setTimeout(r, 100));
  document.querySelector('[data-testid="export-project"]').click();
})()`);
let bundle = null;
for (let i = 0; i < 60 && !bundle; i++) {
  await wait(250);
  bundle = (existsSync(join(out, "downloads")) ? readdirSync(join(out, "downloads")) : []).find((f) => f.endsWith(".siljangnim.zip")) ?? null;
}
await wait(500);
// As if on another machine: the recipe isn't here until the bundle brings it.
rmSync(join(out, "recipes", "smoke.points"), { recursive: true, force: true });
const bundleImport = bundle
  ? await inPage(`(async () => {
  const bytes = Uint8Array.from(atob(${JSON.stringify(readFileSync(join(out, "downloads", bundle)).toString("base64"))}), (c) => c.charCodeAt(0));
  const input = document.querySelector('[data-testid="import-project"]');
  const files = new DataTransfer();
  files.items.add(new File([bytes], ${JSON.stringify(bundle)}, { type: "application/zip" }));
  input.files = files.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  for (let i = 0; i < 40 && !document.querySelector('[data-testid="notice"]'); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 1500));
  return {
    notice: document.querySelector('[data-testid="notice"]')?.innerText ?? null,
    project: document.querySelector('header button[title="Rename project"]')?.innerText ?? null,
    assets: [...document.querySelectorAll("[data-asset]")].map((a) => a.dataset.asset),
    state: document.querySelector("[data-runtime-state]")?.dataset.runtimeState,
  };
})()`)
  : { ok: false, error: "no bundle downloaded" };
const bundleAssets = text(await client.callTool({ name: "asset_list", arguments: {} }));
const importedRecipe = existsSync(join(out, "recipes", "smoke.points", "recipe.md")) ? readFileSync(join(out, "recipes", "smoke.points", "recipe.md"), "utf8") : "";
const mdImport = await call("project_import_md", { markdown: md });
await wait(1500);
const afterImport = await client.callTool({ name: "viewport_status", arguments: {} });


const checks = {
  toolsListed: ["scene_write", "viewport_capture", "history_list", "asset_list", "viewer_open"].every((n) => tools.some((t) => t.name === n)) && !tools.some((t) => t.name === "ask_user"),
  instructions: instructions.includes("Talk with the person in your own chat"),
  viewerOpened: !calls.viewer_open.isError,
  sceneWritten: !calls.scene_write.isError && /without errors/.test(text(calls.scene_write)),
  shadertoyRuns: !toyScene.isError && /without errors/.test(text(toyScene)) && /No errors/.test(text(toyCapture)),
  captureBlue: Boolean(rgb && rgb[2] > 150 && rgb[2] > 2 * rgb[0] && rgb[2] > rgb[1]),
  timelineEdited: !calls.scene_edit.isError,
  assetsAnswered: !calls.asset_list.isError && /points\.json/.test(text(calls.asset_list)),
  pythonRan: !calls.python_run.isError && /Saved to the project as assets: points\.json/.test(text(calls.python_run)) && /wrote 2 points/.test(text(calls.python_run)),
  commandRan: !calls.command_run.isError && /assets: cli\.txt/.test(text(calls.command_run)),
  recipeSaved: !calls.recipe_save.isError && /smoke\.points v1 \[draft/.test(text(calls.recipe_save)),
  recipeVerified: !calls.recipe_verify.isError && /^Verified: smoke\.points v1 \[verified here/.test(text(calls.recipe_verify)),
  recipeFound: /smoke\.points v1 \[verified here/.test(text(found)),
  recipeRan: !calls.recipe_run.isError && /Recipe smoke\.points v1 \(verified here\)/.test(text(calls.recipe_run)) && /points 12/.test(text(calls.recipe_run)),
  recipeFile: existsSync(join(out, "recipes", "smoke.points", "recipe.md")),
  recordedMp4: !mp4.isError && /Recorded 30 frames at 320x240 \(1s, 30 fps\) to recording-[\w-]+\.mp4/.test(text(mp4)),
  recordedPng: !png.isError && /Recorded 2 frames .* to recording-[\w-]+\.zip/.test(text(png)),
  recordedRealtime: !live.isError && /to recording-[\w-]+\.webm/.test(text(live)),
  recordingsDecode: /recording-[\w-]+\.mp4 .* video 320x240 1\.00s/.test(text(calls.asset_list)),
  recordingsDownloaded: (() => {
    try {
      return readdirSync(join(out, "downloads")).filter((f) => f.startsWith("recording-")).length === 3;
    } catch {
      return false;
    }
  })(),
  inputsWork:
    !inputScene.isError &&
    /Monitors: .*audioActive=true/.test(text(inputs)) &&
    /camWidth=640/.test(text(inputs)) &&
    Number(text(inputs).match(/maxLevel=([\d.]+)/)?.[1] ?? 0) > 0,
  oscWorks:
    !oscScene.isError &&
    /oscActive=true/.test(text(oscStatus)) &&
    /oscFader=0\.75/.test(text(oscStatus)) &&
    /oscText=hello/.test(text(oscStatus)) &&
    /oscCount=2/.test(text(oscStatus)),
  projectExported:
    !exported.isError && /^---\ntitle: /.test(md) && /### Step \d+: Python \(recipe smoke\.points@1\)/.test(md) && /```python\n/.test(md) && /"version": 2/.test(md),
  bundleImported:
    Boolean(bundle) &&
    bundleImport.ok &&
    /^Imported "[^"]+"\. All assets came with it\. Recipes added/.test(bundleImport.value?.notice ?? "") &&
    ["points.json", "cli.txt"].every((a) => bundleAssets.includes(a)) &&
    /origin: imported/.test(importedRecipe) &&
    /status: draft/.test(importedRecipe),
  mdImported: !mdImport.isError && /Missing generated assets: .*points\.json \(step \d\)/.test(text(mdImport)) && /No errors/.test(text(afterImport)),
  catalogFound: !catalog.isError && /^Catalog matches[^\n]*\nvpype \[C: Python via python_run\]/.test(text(catalog)),
  jobQueue:
    Boolean(longId) &&
    jobsPanel.ok &&
    /python/.test(jobsPanel.value.label) &&
    jobsPanel.value.state === "cancelled" &&
    /cancelled/.test(text(longAfter)),
  registryWorks:
    /In the shared registry, not on this machine[^\n]*\ntrimesh\.torus-knot v1 /.test(text(registrySearch)) &&
    /^Installed from the registry: trimesh\.torus-knot v1 \[draft/.test(text(registryInstall)) &&
    /origin: imported/.test(installedRecipe),
  runtimeStatus: !status.isError && /Python environments:.*\(no packages\)/.test(text(status)),
  // Edits close together share a version; slow steps between them (recordings) split them.
  versionSaved: /"Initial scene"/.test(text(history)) && /Claude Code: scene write/.test(text(history)) && /scene edit/.test(text(history)),
  viewerConnected: viewerState.status === "connected" && /Claude Code/.test(viewerState.statusText ?? ""),
  chatReplacedByActivity: viewerState.tabs.join() === "Activity,History,Assets,Jobs",
  activityLogged: ["scene_write", "viewport_capture", "scene_edit", "python_run"].every((n) => viewerState.activity.includes(n)),
  panelShown: viewerState.widgets.includes("knob") && viewerState.monitors.includes("frames") && viewerState.keyMarks === 2,
};

viewer?.kill("SIGTERM");
await wait(1500);
await client.close();
const ok = Object.values(checks).every(Boolean);
const report = { ok, checks, captureMeanRgb: rgb, history: text(history), inputs: [text(inputScene), text(inputs)], osc: text(oscStatus), project: { bundle, bundleImport, mdImport: text(mdImport) }, jobs: { jobsPanel, longAfter: longAfter && text(longAfter) }, viewer: viewerState };
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
clearTimeout(timeout);
process.exit(ok ? 0 : 1);
