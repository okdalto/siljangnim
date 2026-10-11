// End-to-end check of the MCP path, the way an agent uses it: starts the
// bridge over stdio, lets "the person's browser" (an Electron window) open
// the viewer, calls the tools and checks results and what the viewer shows.
// Needs studio/dist (npm run smoke builds it first). Report in mcp/smoke-out/.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const timeout = setTimeout(() => {
  console.error("[mcp-smoke] timed out");
  process.exit(1);
}, 180_000);

let viewer = null;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(mcpDir, "bin", "siljangnim-mcp.js")],
  env: { ...process.env, SILJANGNIM_OPEN: "0", SILJANGNIM_PORT: "47911" },
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
await call("scene_edit", { timeline: { duration: 4, preserveStateOnLoop: true }, keyframes: { u_gain: [{ time: 0, value: 1 }, { time: 2, value: 1 }] } });
await call("asset_list");
await wait(2500); // controls-style version commit after edits go quiet
const history = await call("history_list");
await wait(600);
const viewerState = JSON.parse(readFileSync(join(out, "viewer.json"), "utf8"));

const checks = {
  toolsListed: ["scene_write", "viewport_capture", "history_list", "asset_list", "viewer_open"].every((n) => tools.some((t) => t.name === n)) && !tools.some((t) => t.name === "ask_user"),
  instructions: instructions.includes("Talk with the person in your own chat"),
  viewerOpened: !calls.viewer_open.isError,
  sceneWritten: !calls.scene_write.isError && /without errors/.test(text(calls.scene_write)),
  captureBlue: Boolean(rgb && rgb[2] > 150 && rgb[2] > 2 * rgb[0] && rgb[2] > rgb[1]),
  timelineEdited: !calls.scene_edit.isError,
  assetsAnswered: !calls.asset_list.isError,
  versionSaved: /"Initial scene"/.test(text(history)) && /scene write/.test(text(history)),
  viewerConnected: viewerState.status === "connected" && /Claude Code/.test(viewerState.statusText ?? ""),
  chatReplacedByActivity: viewerState.tabs.join() === "Activity,History,Assets",
  activityLogged: ["scene_write", "viewport_capture", "scene_edit"].every((n) => viewerState.activity.includes(n)),
  panelShown: viewerState.widgets.includes("knob") && viewerState.monitors.includes("frames") && viewerState.keyMarks === 2,
};

viewer?.kill("SIGTERM");
await wait(1500);
await client.close();
const ok = Object.values(checks).every(Boolean);
const report = { ok, checks, captureMeanRgb: rgb, history: text(history), viewer: viewerState };
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
clearTimeout(timeout);
process.exit(ok ? 0 : 1);
