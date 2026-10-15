// Smoke test used by `npm run smoke` and CI. Checks that the studio loads,
// the scene runtime renders in its own origin, the LLM forwarder answers
// the app and refuses the scene, and the hub starts. Saves a screenshot and
// a JSON report, then quits with a status code.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";

// Everything but the examples; each example opened adds its own allowance (there are hundreds, a few seconds each).
const TIMEOUT_MS = 600_000;
const PER_EXAMPLE_MS = 8_000;
const LLM_PROBE = "app://siljangnim/api/llm/anthropic/v1/messages";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const started = Date.now();
// Progress on stdout, so a timeout shows which step hung.
let lastStep = "start";
const log = (step) => {
  lastStep = step;
  console.log(`[smoke] ${((Date.now() - started) / 1000).toFixed(1)}s ${step}`);
};

/** frame.executeJavaScript that fails instead of hanging when the frame goes away mid-call. */
function inFrame(frame, code, label, ms = 20_000) {
  let timer;
  return Promise.race([
    frame.executeJavaScript(code),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: no answer from the frame within ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function waitForHub(hub) {
  return new Promise((resolve) => {
    const done = () => ["ready", "error"].includes(hub.status);
    if (done()) return resolve();
    const onStatus = () => {
      if (done()) {
        hub.off("status", onStatus);
        resolve();
      }
    };
    hub.on("status", onStatus);
  });
}

async function findSceneFrame(win) {
  for (let i = 0; i < 60; i++) {
    const frame = win.webContents.mainFrame.framesInSubtree.find((f) => f.url.includes("scene.html"));
    if (frame) return frame;
    await wait(250);
  }
  return null;
}

// Runs inside the scene frame: is the canvas showing something other than black?
const SAMPLE_CANVAS = `(async () => {
  const canvas = document.querySelector("#stage canvas");
  if (!canvas) return { canvas: false };
  await new Promise((r) => requestAnimationFrame(r));
  const bitmap = await createImageBitmap(canvas);
  // 96x96 with smoothing: a plain 32x32 drawImage samples one point every ~30 px, and a sparse bright
  // pattern (reaction-diffusion's dots) can fall entirely between them and read as black.
  const N = 96;
  const c = new OffscreenCanvas(N, N);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, N, N);
  const data = g.getImageData(0, 0, N, N).data;
  let lit = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 60) lit++;
    for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  }
  const rect = canvas.getBoundingClientRect();
  return {
    canvas: true,
    width: canvas.width,
    height: canvas.height,
    litFraction: lit / (N * N),
    meanRgb: sum.map((v) => Math.round(v / (N * N))),
    fillsFrame: Math.abs(rect.width - innerWidth) < 2 && Math.abs(rect.height - innerHeight) < 2,
  };
})()`;

// From the app the probe carries the forwarder token, as the studio does; the scene has no way to get it.
const probe = (url, withToken) => `(async () => {
  const headers = { "content-type": "application/json", "anthropic-version": "2023-06-01" };
  ${withToken ? 'headers["x-siljangnim-token"] = await window.siljangnim.llm.token();' : ""}
  return fetch(${JSON.stringify(url)}, { method: "POST", headers, body: "{}" }).then((r) => r.status, () => 0);
})()`;

// Types a prompt into the chat the way a person would.
const TYPE_PROMPT = `(() => {
  const ta = document.querySelector("textarea");
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setValue.call(ta, "Make a calm blue field");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
})()`;

// Uploads two assets through the chat's file picker: a blue 8x8 PNG and a JSON file.
const UPLOAD_ASSETS = `(async () => {
  const c = new OffscreenCanvas(8, 8);
  const g = c.getContext("2d");
  g.fillStyle = "rgb(26, 89, 255)";
  g.fillRect(0, 0, 8, 8);
  const png = new File([await c.convertToBlob({ type: "image/png" })], "swatch.png", { type: "image/png" });
  const json = new File(['{"tint":"blue"}'], "data.json", { type: "application/json" });
  const input = document.querySelector('[data-testid="asset-input"]');
  const dt = new DataTransfer();
  dt.items.add(png);
  dt.items.add(json);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  for (let i = 0; i < 40 && document.querySelectorAll("aside .truncate").length < 3; i++) await new Promise((r) => setTimeout(r, 100));
  return [...document.querySelectorAll("aside span.truncate")].map((e) => e.innerText);
})()`;

/** Settings → Agent, the way a person picks one. */
function chooseAgent(win, label) {
  return win.webContents.executeJavaScript(`(async () => {
    if (!document.querySelector('[data-testid="close-settings"]')) {
      document.querySelector('button[title="Settings"]')?.click();
    }
    let clicked = false;
    for (let i = 0; i < 50; i++) {
      const close = document.querySelector('[data-testid="close-settings"]');
      const dialog = close?.parentElement?.parentElement;
      const choice = [...(dialog?.querySelectorAll("button") ?? [])]
        .find((b) => b.innerText === ${JSON.stringify(label)});
      if (clicked && choice?.classList.contains("bg-raised")) {
        close.click();
        await new Promise((r) => setTimeout(r, 100));
        return;
      }
      if (choice) { choice.click(); clicked = true; }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Settings did not select agent: " + ${JSON.stringify(label)});
  })()`);
}

/** One agent run through the real UI, SDK, forwarder and tools (against the smoke test's mock API). */
async function runAgentScenario(win, sceneFrame, keys) {
  keys.set("anthropic", process.env.SILJANGNIM_SMOKE_KEY);
  // A first launch picks a signed-in Claude Code / Codex when one is found; this run is about the API key.
  await chooseAgent(win, "API key");
  const finalText = process.env.SILJANGNIM_SMOKE_FINAL_TEXT ?? "";
  log("uploading assets");
  const attached = await win.webContents.executeJavaScript(UPLOAD_ASSETS);
  log("sending prompt");
  await win.webContents.executeJavaScript(TYPE_PROMPT);
  // Answer the agent's question and approve its Python run the way a person would.
  let answered = false;
  let approved = false;
  let replied = false;
  for (let i = 0; i < 240 && !replied; i++) {
    await wait(250);
    const state = await win.webContents.executeJavaScript(`(() => {
      const option = document.querySelector('[data-question-option="Timeline"]');
      option?.click();
      const allow = document.querySelector('[data-approval="project"]');
      allow?.click();
      return { option: Boolean(option), allow: Boolean(allow), replied: document.body.innerText.includes(${JSON.stringify(finalText)}) };
    })()`);
    answered ||= state.option;
    approved ||= state.allow;
    replied = state.replied;
  }
  log(`question answered: ${answered}, python approved: ${approved}`);
  await wait(500);
  log(`agent replied: ${replied}`);
  // Press the button widget twice; each press should count exactly one frame.
  for (let i = 0; i < 2; i++) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-widget="button"]')?.click()`);
    await wait(300);
  }
  await wait(300);
  const bursts = await win.webContents.executeJavaScript(`document.querySelector('[data-monitor="bursts"] .tabular-nums')?.innerText`);
  const panel = await runPanelScenario(win);
  const sample = sceneFrame ? await inFrame(sceneFrame, SAMPLE_CANVAS, "sample scene").catch(() => null) : null;
  const chat = await win.webContents.executeJavaScript(`({
    chips: [...document.querySelectorAll("aside button")].map((b) => b.innerText).filter((t) => /scene|viewport/i.test(t)),
    images: document.querySelectorAll('aside img[alt="Viewport capture"]').length,
    keyMarks: [...document.querySelectorAll("[data-key-time]")].map((m) => m.title),
    widgets: [...document.querySelectorAll("[data-widget]")].map((w) => w.dataset.widget),
    groups: [...document.querySelectorAll('[data-testid="controls"] section > h3')].map((h) => h.textContent),
    frames: Number(document.querySelector('[data-monitor="frames"] .tabular-nums')?.innerText ?? NaN),
    timelineMenu: document.querySelector('[data-testid="timeline-menu"]')?.innerText ?? null,
  })`);
  const [r, g, b] = sample?.meanRgb ?? [0, 0, 0];
  return { attached, answered, approved, bursts, panel, replied, meanRgb: sample?.meanRgb, blue: b > 150 && b > 2 * r && b > g, ...chat };
}

// Opens the History tab and describes its rows (oldest first).
const READ_HISTORY = `(async () => {
  [...document.querySelectorAll("[role=tab]")].find((t) => t.innerText === "History")?.click();
  await new Promise((r) => setTimeout(r, 300));
  return [...document.querySelectorAll("[data-version]")].map((row) => ({
    id: row.dataset.version,
    text: row.innerText,
    current: row.innerText.includes("current"),
    thumbnail: Boolean(row.querySelector("img[src]")),
  }));
})()`;

/** The scene's custom panel: its button sets a uniform; it can't reach the app or the network. */
async function runPanelScenario(win) {
  const frame = win.webContents.mainFrame.framesInSubtree.find((f) => f.url === "about:srcdoc");
  if (!frame) return { found: false };
  const before = await inFrame(frame, `document.getElementById("v").textContent`, "panel readout");
  await inFrame(frame, `document.getElementById("half").click()`, "panel click");
  await wait(400);
  const after = await inFrame(frame, `document.getElementById("v").textContent`, "panel readout");
  const control = await win.webContents.executeJavaScript(`document.querySelector('[data-control="u_gain"] .tabular-nums')?.innerText`);
  const isolation = await inFrame(frame, `(async () => ({
    parent: (() => { try { return parent.document.title; } catch { return "blocked"; } })(),
    storage: (() => { try { return typeof localStorage.length; } catch { return "blocked"; } })(),
    network: await fetch("https://example.com").then(() => "reached", () => "blocked"),
  }))()`, "panel isolation");
  await inFrame(frame, `document.getElementById("full").click()`, "panel click");
  await wait(300);
  return { found: true, before, after, control, isolation };
}

/** After the agent run: two versions (initial + the run), then restore the first one from the panel. */
async function runHistoryScenario(win, sceneFrame) {
  let before = [];
  for (let i = 0; i < 20 && before.length < 2; i++) {
    before = await win.webContents.executeJavaScript(READ_HISTORY);
    if (before.length < 2) await wait(250);
  }
  const first = before[0];
  if (first) await win.webContents.executeJavaScript(`document.querySelector('[data-version="${first.id}"]').click()`);
  let after = [];
  for (let i = 0; i < 20; i++) {
    await wait(250);
    after = await win.webContents.executeJavaScript(READ_HISTORY);
    if (after[0]?.current) break;
  }
  await wait(500);
  const sample = sceneFrame ? await inFrame(sceneFrame, SAMPLE_CANVAS, "sample scene").catch(() => null) : null;
  const [r, , b] = sample?.meanRgb ?? [0, 0, 0];
  return {
    before,
    after,
    meanRgbAfterRestore: sample?.meanRgb,
    // Initial scene, the agent run, then the panel's gain changes (control versions) — the last one current.
    recorded:
      before.length >= 2 &&
      /Initial scene/.test(before[0]?.text ?? "") &&
      before.some((v) => /Make a calm blue field/.test(v.text)) &&
      Boolean(before.at(-1)?.current) &&
      before.every((v) => v.thumbnail),
    // The default scene is orange: restoring it must replace the blue one, without adding a version.
    restored: after.length === before.length && after[0]?.current === true && r > b,
  };
}

// Runs inside the scene frame: the canvas as a 512-wide PNG data URL.
const CAPTURE_PNG = `(async () => {
  const canvas = document.querySelector("#stage canvas");
  await new Promise((r) => requestAnimationFrame(r));
  const bitmap = await createImageBitmap(canvas);
  const out = new OffscreenCanvas(512, Math.round((512 * canvas.height) / canvas.width));
  out.getContext("2d").drawImage(bitmap, 0, 0, out.width, out.height);
  const blob = await out.convertToBlob({ type: "image/png" });
  return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
})()`;

/** A tiny stored ZIP (enough for a v1 project fixture). */
function zipStore(files) {
  const crc = (data) => {
    let c = 0xffffffff;
    for (const byte of data) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc(data), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(n.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

/** Imports a v1-style project zip through the Projects menu and checks it runs. */
/**
 * An agent's MCP bridge (the real mcp/bin, run by this Electron as Node) attaches to this
 * window instead of opening a browser: tools act here, and the chat comes back when it ends.
 */
async function runAttachScenario(win) {
  const mcpDir = process.env.SILJANGNIM_SMOKE_MCP;
  if (!mcpDir) return null;
  const require = createRequire(join(mcpDir, "package.json"));
  const { Client } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(mcpDir, "bin", "siljangnim-mcp.js")],
    // SILJANGNIM_OPEN=0: if attaching failed, nothing would open and the check fails.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", SILJANGNIM_OPEN: "0", SILJANGNIM_PORT: "47931" },
    stderr: "ignore",
  });
  const client = new Client({ name: "claude-code", version: "smoke" });
  await client.connect(transport);
  const text = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const opened = text(await client.callTool({ name: "viewer_open", arguments: {} }));
  const written = text(
    await client.callTool({
      name: "scene_write",
      arguments: {
        scene: {
          version: 2,
          script: { setup: "", render: 'ctx.gl.clearColor(0.2, 0.6, 0.3, 1); ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT); ctx.publish("attached", 1);' },
        },
      },
    }),
  );
  await wait(800);
  const ui = () =>
    win.webContents.executeJavaScript(`({
      status: document.querySelector('[data-testid="external-status"]')?.dataset.status ?? null,
      tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.innerText),
      activity: [...document.querySelectorAll('[data-activity]')].map((a) => a.dataset.activity),
      monitors: [...document.querySelectorAll('[data-monitor]')].map((m) => m.dataset.monitor),
    })`);
  const during = await ui();
  await client.close();
  await wait(4500);
  const after = await ui();
  return { opened, written, during, after };
}

/**
 * The chat on the person's own Claude Code (a stand-in CLI here): the app starts it with the bundled
 * siljangnim-mcp, whose bridge attaches to this window as part of the chat. Two messages, the second resuming.
 */
async function runLocalAgentScenario(win, outDir) {
  if (!process.env.SILJANGNIM_CLAUDE_PATH) return null;
  const state = () =>
    win.webContents.executeJavaScript(`({
      text: document.querySelector("aside")?.innerText ?? "",
      status: document.querySelector('[data-testid="external-status"]')?.dataset.status ?? null,
      tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.innerText),
      monitors: [...document.querySelectorAll('[data-monitor]')].map((m) => m.dataset.monitor),
      busy: Boolean(document.querySelector('button[title="Stop"]')),
    })`);
  const engines = await win.webContents.executeJavaScript("window.siljangnim.localAgent.detect()");
  await chooseAgent(win, "Claude Code");
  // What Settings shows for it (release/smoke/settings-agent.png).
  await win.webContents.executeJavaScript(`document.querySelector('button[title="Settings"]')?.click()`);
  await wait(600);
  writeFileSync(join(outDir, "settings-agent.png"), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="close-settings"]')?.click()`);
  const send = async (text) => {
    // The previous scenario may have left another sidebar tab (or the examples view) on screen.
    await win.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 50 && !document.querySelector("aside textarea"); i++) {
        if (!document.querySelector("aside")) document.querySelector('[data-testid="view-studio"]')?.click();
        [...document.querySelectorAll('[role="tab"]')].find((t) => t.innerText === "Chat")?.click();
        await new Promise((r) => setTimeout(r, 100));
      }
    })()`);
    await win.webContents.executeJavaScript(TYPE_PROMPT.replace('"Make a calm blue field"', JSON.stringify(text)));
  };
  const waitFor = async (needle) => {
    let s = await state();
    for (let i = 0; i < 120 && (!s.text.includes(needle) || s.busy); i++) {
      await wait(250);
      s = await state();
    }
    await wait(500);
    return state();
  };
  await send("Make it orange");
  const first = await waitFor("asked: Make it orange");
  await wait(800);
  await send("Again");
  const second = await waitFor("resumed mock-session-1");
  return { engines, first, second };
}

async function runV1ImportScenario(win) {
  const fs = `#version 300 es
precision highp float; out vec4 outColor; uniform float u_glow;
void main() { outColor = vec4(0.9 * u_glow, 0.4, 0.1, 1.0); }`;
  const zip = zipStore([
    { name: "Old Piece/siljangnim-project.json", data: Buffer.from(JSON.stringify({ name: "old-piece", display_name: "Old Piece" })) },
    {
      name: "Old Piece/scene.json",
      data: Buffer.from(
        JSON.stringify({
          version: 1,
          render_mode: "script",
          script: {
            setup: `if (!ctx.uploads["tile.png"]) throw new Error("upload missing"); ctx.state.p = ctx.utils.createProgram(ctx.utils.FULLSCREEN_VERTEX_SHADER, ${JSON.stringify(fs)});`,
            render: "ctx.utils.drawFullscreen(ctx.state.p);",
          },
          uniforms: { u_glow: { type: "float", value: 1 } },
        }),
      ),
    },
    { name: "Old Piece/panels.json", data: Buffer.from(JSON.stringify({ controls: { title: "Controls", controls: [{ type: "slider", label: "Glow", uniform: "u_glow", min: 0, max: 2, default: 1 }] } })) },
    { name: "Old Piece/uploads/tile.png", data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
  ]);
  await win.webContents.executeJavaScript(`(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(zip.toString("base64"))}), (c) => c.charCodeAt(0));
    const input = document.querySelector('[data-testid="import-v1"]');
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "old-piece.zip", { type: "application/zip" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  log("v1 zip handed to the import input");
  let state = null;
  for (let i = 0; i < 40; i++) {
    await wait(250);
    state = await win.webContents.executeJavaScript(`(() => {
      const s = document.querySelector("[data-runtime-state]");
      return {
        project: document.querySelector('header button[title="Rename project"]')?.innerText,
        state: s?.dataset.runtimeState,
        errors: Number(s?.dataset.runtimeErrors),
        glow: document.querySelector('[data-control="u_glow"] .tabular-nums')?.innerText ?? null,
      };
    })()`);
    if (state.project === "Old Piece" && state.state === "running") break;
  }
  await wait(800);
  state.errors = await win.webContents.executeJavaScript(`Number(document.querySelector("[data-runtime-state]")?.dataset.runtimeErrors)`);
  return state;
}

/** Viewport frame menu: an exact size renders at those pixels in a box of that shape; Fit goes back. */
async function runFrameScenario(win) {
  const pick = (label) => win.webContents.executeJavaScript(`(async () => {
    document.querySelector('[data-testid="frame-button"]').click();
    await new Promise((r) => setTimeout(r, 200));
    [...document.querySelectorAll('[data-testid="frame-menu"] button')].find((b) => b.innerText === ${JSON.stringify(label)})?.click();
  })()`);
  const read = async () => {
    const frame = await findSceneFrame(win);
    const canvas = frame ? await inFrame(frame, `(() => { const c = document.querySelector("#stage canvas"); return c && [c.width, c.height]; })()`, "canvas size").catch(() => null) : null;
    const box = await win.webContents.executeJavaScript(`(() => { const b = document.querySelector("[data-frame]"); return { label: b.dataset.frame, w: b.clientWidth, h: b.clientHeight }; })()`);
    return { canvas, box };
  };
  await pick("1080×1920");
  let portrait = null;
  for (let i = 0; i < 20; i++) {
    await wait(250);
    portrait = await read();
    if (portrait.canvas?.[0] === 1080) break;
  }
  await pick("Fit window");
  await wait(1500);
  const fit = await read();
  return { portrait, fit };
}

/** Assets tab → Show in Finder: the open project (the imported v1 one) written out as files. */
async function runProjectFolderScenario(win) {
  const root = process.env.SILJANGNIM_PROJECTS_DIR;
  const opened = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // The tab strip when the side panel is open, the icon rail when it is folded.
    const tab = () => [...document.querySelectorAll('[role="tab"]')].find((t) => t.innerText === "Assets") ?? document.querySelector('[data-testid="sidebar-rail"] button[title="Assets"]');
    for (let i = 0; i < 20 && !tab(); i++) await wait(100);
    tab()?.click();
    for (let i = 0; i < 20 && !document.querySelector('[data-testid="open-folder"]'); i++) await wait(100);
    const code = [...document.querySelectorAll("[data-code]")].map((e) => e.dataset.code);
    document.querySelector('[data-testid="open-folder"]')?.click();
    return code;
  })()`);
  let files = [];
  for (let i = 0; i < 40; i++) {
    await wait(250);
    const dir = existsSync(root) ? readdirSync(root).find((d) => d.startsWith("Old-Piece-")) : null;
    const manifest = dir && join(root, dir, ".siljangnim-files.json");
    if (manifest && existsSync(manifest)) {
      files = JSON.parse(readFileSync(manifest, "utf8")).files;
      break;
    }
  }
  return { code: opened, files };
}

/** Opens every bundled example through the gallery and checks it runs, error-free, and draws something. */
/** Examples a virtual GPU can't draw (see runExamplesScenario). */
const VIRTUAL_GPU_DARK = new Set(["oss-babylonjs"]);

async function runExamplesScenario(win, examplesOut, onCount = () => undefined) {
  const slugs = await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('[title="Projects"]').click();
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('[data-testid="open-examples"]').click();
    await new Promise((r) => setTimeout(r, 300));
    for (const button of document.querySelectorAll('[data-example-folder] > button[aria-expanded="false"]')) button.click();
    await new Promise((r) => setTimeout(r, 100));
    const slugs = [...document.querySelectorAll("[data-example]")].map((e) => ({ slug: e.dataset.example, requires: e.dataset.requires }));
    document.querySelector('[data-testid="examples"]')?.parentElement?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    return slugs;
  })()`);
  const results = {};
  // WebGPU examples run where WebGPU does (macOS/Windows; not SwiftShader on Linux CI).
  const frameForGpu = await findSceneFrame(win);
  const gpu = frameForGpu ? await inFrame(frameForGpu, "(async () => Boolean(navigator.gpu && (await navigator.gpu.requestAdapter())))()", "webgpu check").catch(() => false) : false;
  // CI's macOS runners have a virtual GPU (Apple Paravirtual device) that draws Babylon's PBR + GPU particle + post
  // pipeline as black; it renders on real GPUs and on Linux CI's SwiftShader.
  const renderer = frameForGpu
    ? await inFrame(frameForGpu, `(() => { const g = document.createElement("canvas").getContext("webgl2"); const x = g?.getExtension("WEBGL_debug_renderer_info"); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : ""; })()`, "gpu name").catch(() => "")
    : "";
  const virtualGpu = /paravirtual/i.test(renderer);
  log(`gpu: ${renderer || "unknown"}`);
  // SILJANGNIM_SMOKE_EXAMPLE_SAMPLE=n: n examples spread evenly over the list instead of all of them.
  const sample = Number(process.env.SILJANGNIM_SMOKE_EXAMPLE_SAMPLE) || 0;
  // oss-blender always: the example-cache scenario reopens it from the cache afterwards.
  // Include newly added examples explicitly even when sampling the broader gallery.
  const included = new Set((process.env.SILJANGNIM_SMOKE_EXAMPLE_INCLUDE ?? "").split(",").filter(Boolean));
  for (const slug of included) {
    if (!slugs.some((e) => e.slug === slug)) throw new Error(`requested smoke example is missing: ${slug}`);
  }
  const picked = sample && slugs.length > sample ? slugs.filter((e, i) => i % Math.ceil(slugs.length / sample) === 0 || e.slug === "oss-blender" || included.has(e.slug)) : slugs;
  onCount(picked.length);
  for (const { slug, requires } of picked) {
    if (requires?.includes("webgpu") && !gpu) {
      results[slug] = { skipped: "no WebGPU here" };
      log(`example ${slug}: skipped (no WebGPU)`);
      continue;
    }
    if (virtualGpu && VIRTUAL_GPU_DARK.has(slug)) {
      results[slug] = { skipped: `draws black on a virtual GPU (${renderer})` };
      log(`example ${slug}: skipped (virtual GPU)`);
      continue;
    }
    // A camera and the network can't be assumed on a test machine.
    const needs = (requires ?? "").split(" ").filter((r) => r === "camera" || r === "network");
    if (needs.length) {
      results[slug] = { skipped: `needs ${needs.join(", ")}` };
      log(`example ${slug}: skipped (needs ${needs.join(", ")})`);
      continue;
    }
    // The Examples tab in the top bar; wait for the card rather than a fixed delay.
    await win.webContents.executeJavaScript(`(async () => {
      let card = null;
      for (let i = 0; i < 100 && !(card = document.querySelector('[data-example="${slug}"]')); i++) {
        // (Re)open the view if it isn't showing; the previous example may still be settling.
        if (!document.querySelector('[data-testid="examples"]')) document.querySelector('[data-testid="view-examples"]').click();
        for (const button of document.querySelectorAll('[data-example-folder] > button[aria-expanded="false"]')) button.click();
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!card) throw new Error("no card for ${slug}");
      card.click();
    })()`);
    const readState = () => win.webContents.executeJavaScript(`(() => {
        const s = document.querySelector("[data-runtime-state]");
        // An example that can't open shows why in the gallery (download or integrity errors); keep it for the report.
        const alert = document.querySelector('[data-testid="examples"] [role="alert"]')?.innerText;
        return s && { state: s.dataset.runtimeState, errors: Number(s.dataset.runtimeErrors), project: document.querySelector('header button[title="Rename project"]')?.innerText, ...(alert ? { alert } : {}) };
      })()`);
    let state = null;
    for (let i = 0; i < 60; i++) {
      await wait(250);
      state = await readState();
      const opened = await win.webContents.executeJavaScript(`!document.querySelector('[data-testid="examples"]')`);
      if ((opened && state?.state === "running" && state.project !== "Untitled") || state?.alert) break;
    }
    await wait(1200);
    const frame = await findSceneFrame(win);
    // Libraries come from a CDN with an empty cache here, and heavy setups (reaction-diffusion's warm-up)
    // crawl on CI's software GPU: give setup up to ~15 s. Only a dark canvas is retried; a frame that
    // doesn't answer has failed already.
    let sample = null;
    for (let i = 0; i < 20 && frame; i++) {
      if (i) await wait(750);
      sample = await inFrame(frame, SAMPLE_CANVAS, `sample ${slug}`, 10_000).catch(() => null);
      if (!sample || sample.litFraction > 0.01) break;
    }
    // Setup can finish while the first visible frame is being sampled. Report its current state.
    state = await readState();
    const after = state?.errors ?? 0;
    const errorText = after ? await win.webContents.executeJavaScript(`document.querySelector("[data-runtime-state]")?.dataset.runtimeError ?? null`) : null;
    results[slug] = { ...state, errors: after, ...(errorText ? { error: errorText } : {}), litFraction: sample?.litFraction ?? 0 };
    // A capture per example (thumbnails, and a look at what ran).
    const png = frame ? await inFrame(frame, CAPTURE_PNG, `capture ${slug}`).catch(() => null) : null;
    if (png) {
      mkdirSync(join(examplesOut, "examples"), { recursive: true });
      writeFileSync(join(examplesOut, "examples", `${slug}.png`), Buffer.from(png.split(",")[1], "base64"));
    }
    log(`example ${slug}: ${JSON.stringify(results[slug])}`);
  }
  return results;
}

/** Cache reuse must survive a renderer reload, with all example fetches blocked. */
async function runExampleCacheScenario(win) {
  win.webContents.reload();
  await new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  await wait(1000);
  return win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // CI machines under load are slow to render after a reload: wait for each control to exist before clicking it.
    const el = async (selector) => {
      for (let i = 0; i < 100; i++) {
        const found = document.querySelector(selector);
        if (found) return found;
        await sleep(100);
      }
      throw new Error("not found: " + selector);
    };
    // Opening an example closes the gallery once more when it finishes, which can land after it was reopened:
    // reopen it until the card is there.
    const galleryCard = async (slug) => {
      for (let i = 0; i < 150; i++) {
        const found = document.querySelector('[data-example="' + slug + '"]');
        if (found) return found;
        if (!document.querySelector('[data-testid="examples"]')) document.querySelector('[data-testid="view-examples"]')?.click();
        for (const button of document.querySelectorAll('[data-example-folder] > button[aria-expanded="false"]')) button.click();
        await sleep(100);
      }
      throw new Error("no gallery card for " + slug);
    };
    const fetchOriginal = window.fetch;
    let requests = 0;
    window.fetch = (...args) => {
      const url = String(args[0]);
      if (url.includes("/example-library/") || url.includes("/examples/")) {
        requests++;
        return Promise.reject(new Error("offline cache smoke"));
      }
      return fetchOriginal(...args);
    };
    try {
      // The app may still be starting after the reload: (re)open the gallery until the card is there.
      const card = await galleryCard("oss-blender");
      await sleep(300);
      const cachedLabel = /Downloaded|다운로드됨/.test(card?.textContent ?? "");
      card.click();
      for (let i = 0; i < 100; i++) {
        await sleep(100);
        if (!document.querySelector('[data-testid="examples"]')) break;
      }
      const opened = !document.querySelector('[data-testid="examples"]');
      await sleep(1500);
      const offlineRequests = requests;
      const countProjects = () => new Promise((resolve, reject) => {
        const request = indexedDB.open("siljangnim-studio");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const count = db.transaction("projects").objectStore("projects").count();
          count.onsuccess = () => { resolve(count.result); db.close(); };
          count.onerror = () => reject(count.error);
        };
      });
      const before = await countProjects();
      await galleryCard("oss-blender");
      await sleep(300);
      (await el('[data-testid="clear-example-downloads"]')).click();
      await sleep(300);
      (await galleryCard("oss-blender")).click();
      await sleep(500);
      for (let i = 0; i < 30 && !document.querySelector('[role="alert"]'); i++) await sleep(100);
      const failedCleanly = Boolean(document.querySelector('[role="alert"]')) && await countProjects() === before;
      window.fetch = (...args) => {
        const url = String(args[0]);
        if (url.includes("/example-library/") || url.includes("/examples/")) return new Promise((_resolve, reject) => {
          args[1].signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
        });
        return fetchOriginal(...args);
      };
      (await galleryCard("oss-blender")).click();
      await sleep(300);
      (await el('[data-testid="cancel-example-download"]')).click();
      await sleep(300);
      for (let i = 0; i < 30 && document.querySelector('[data-testid="example-download"]'); i++) await sleep(100);
      const cancelledCleanly = !document.querySelector('[data-testid="example-download"]') && await countProjects() === before;
      window.fetch = fetchOriginal;
      (await galleryCard("oss-blender")).click();
      for (let i = 0; i < 100; i++) {
        await sleep(100);
        if (!document.querySelector('[data-testid="examples"]')) break;
      }
      const retried = !document.querySelector('[data-testid="examples"]') && await countProjects() === before + 1;
      return { cachedLabel, opened, requests: offlineRequests, failedCleanly, cancelledCleanly, retried };
    } finally { window.fetch = fetchOriginal; }
  })()`);
}

export async function runSmokeTest(win, hub, keys, outDir) {
  try {
    await runSmoke(win, hub, keys, outDir);
  } catch (err) {
    // A scenario threw: say where and why instead of waiting for the timeout, with what the window showed.
    mkdirSync(outDir, { recursive: true });
    try {
      writeFileSync(join(outDir, "error-window.png"), (await win.webContents.capturePage()).toPNG());
    } catch {
      // the window is gone
    }
    writeFileSync(join(outDir, "report.json"), JSON.stringify({ ok: false, reason: `error after step ${lastStep}: ${err instanceof Error ? err.stack : err}` }, null, 2));
    quit(hub, 1);
  }
}

async function runSmoke(win, hub, keys, outDir) {
  mkdirSync(outDir, { recursive: true });
  const consoleErrors = [];
  win.webContents.on("console-message", ({ level, message }) => {
    if (level === "error") consoleErrors.push(message);
  });
  const report = (data) => writeFileSync(join(outDir, "report.json"), JSON.stringify(data, null, 2));

  let timer;
  const arm = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      report({ ok: false, reason: `timeout after step: ${lastStep}`, hub: { ...hub.info(), token: undefined } });
      quit(hub, 1);
    }, ms);
  };
  arm(TIMEOUT_MS);

  // Examples play audio; keep the machine running the smoke quiet.
  win.webContents.setAudioMuted(true);
  await new Promise((resolve) => {
    if (!win.webContents.isLoading()) return resolve();
    win.webContents.once("did-finish-load", resolve);
  });

  const sceneFrame = await findSceneFrame(win);
  let scene = { frame: false };
  if (sceneFrame) {
    // Give the default scene time to load and draw.
    let sample = null;
    for (let i = 0; i < 40; i++) {
      sample = await inFrame(sceneFrame, SAMPLE_CANVAS, "sample default scene").catch((err) => ({ error: String(err) }));
      if (sample?.litFraction > 0.02) break;
      await wait(250);
    }
    scene = { frame: true, url: sceneFrame.url, origin: sceneFrame.origin, ...sample };
  }

  // The iframe should cover the viewport area of the app.
  const iframe = await win.webContents.executeJavaScript(`(() => {
    const f = document.querySelector("iframe");
    if (!f) return null;
    const r = f.getBoundingClientRect(), p = f.parentElement.getBoundingClientRect();
    return { width: r.width, height: r.height, fills: Math.abs(r.width - p.width) < 2 && Math.abs(r.height - p.height) < 2 };
  })()`);

  const llm = {
    fromApp: await win.webContents.executeJavaScript(probe(LLM_PROBE, true)),
    fromAppWithoutToken: await win.webContents.executeJavaScript(probe(LLM_PROBE, false)),
    fromScene: sceneFrame ? await inFrame(sceneFrame, probe(LLM_PROBE, false), "probe from scene") : null,
  };
  const bridge = await win.webContents.executeJavaScript(
    "window.siljangnim ? window.siljangnim.keys.status().then((keys) => ({ desktop: window.siljangnim.desktop, keys })) : null",
  );

  // The agent run uses the hub (python_run), so it waits for the hub first.
  log("waiting for hub");
  await waitForHub(hub);
  const agent = process.env.SILJANGNIM_SMOKE_KEY ? await runAgentScenario(win, sceneFrame, keys) : null;
  log("history scenario");
  const history = agent ? await runHistoryScenario(win, sceneFrame) : null;
  log("examples");
  const examples = await runExamplesScenario(win, outDir, (count) => arm(TIMEOUT_MS + count * PER_EXAMPLE_MS));
  log("example cache offline reopen");
  const exampleCache = await runExampleCacheScenario(win);
  log("frame menu");
  const frameCheck = await runFrameScenario(win).catch((err) => ({ error: String(err) }));
  log("v1 import");
  const v1 = await runV1ImportScenario(win);
  log("project folder");
  const folder = await runProjectFolderScenario(win).catch((err) => ({ error: String(err), code: [], files: [] }));
  log("agent attaches over MCP");
  const attach = await runAttachScenario(win).catch((err) => ({ error: String(err) }));
  log("chat on a local CLI");
  const localAgent = await runLocalAgentScenario(win, outDir).catch((err) => ({ error: String(err) }));
  log("waiting for hub");

  await waitForHub(hub);
  let system = null;
  const info = hub.info();
  if (info.status === "ready") {
    const res = await fetch(`${info.url}/system`, { headers: { Authorization: `Bearer ${hub.token}` } });
    system = await res.json();
  }

  await wait(500);
  const image = await win.webContents.capturePage();
  writeFileSync(join(outDir, "window.png"), image.toPNG());

  const checks = {
    hubReady: info.status === "ready",
    bridge: bridge?.desktop === true,
    sceneRenders: scene.frame && scene.litFraction > 0.02 && scene.fillsFrame,
    viewportFilled: iframe?.fills === true,
    // 401 without a stored key, 400 with one (the probe body is empty): either way routed with app origin accepted.
    llmAnswersApp: [400, 401].includes(llm.fromApp),
    llmRefusesScene: [0, 403].includes(llm.fromScene),
    llmRequiresToken: llm.fromAppWithoutToken === 403,
    ...(agent
      ? {
          assetsUploaded: ["swatch.png", "data.json"].every((n) => agent.attached.includes(n)),
          questionShown: agent.answered,
          approvalShown: agent.approved,
          panelWidgets: agent.widgets.includes("knob") && agent.widgets.includes("button") && agent.groups.join() === "Look,Other,Monitors",
          monitorsShown: agent.frames > 0 && agent.bursts === "2",
          panelWorks:
            agent.panel.found &&
            agent.panel.before === "gain 1" &&
            agent.panel.after === "gain 0.5" &&
            agent.panel.control === "0.50" &&
            Object.values(agent.panel.isolation).every((v) => v === "blocked"),
          agentReplied: agent.replied,
          agentSceneApplied: agent.blue,
          agentShowsCapture: agent.images > 0,
          timelineShown: agent.timelineMenu === "4s · loop" && agent.keyMarks.length === 2 && agent.keyMarks.every((t) => t.includes("Gain")),
        }
      : {}),
    ...(history ? { historyRecorded: history.recorded, historyRestored: history.restored } : {}),
    framesWork:
      frameCheck.portrait?.canvas?.join("x") === "1080x1920" &&
      frameCheck.portrait.box.label === "1080×1920" &&
      Math.abs(frameCheck.portrait.box.w / frameCheck.portrait.box.h - 1080 / 1920) < 0.01 &&
      frameCheck.fit?.box.label === "Fit",
    projectFolderWritten:
      ["code/setup.js", "code/shaders/p.glsl", "scene.json"].every((f) => folder.code.includes(f)) &&
      ["project.md", "scene.json", "code/setup.js", "code/render.js", "code/shaders/p.glsl", "assets/tile.png"].every((f) => folder.files.includes(f)),
    v1Imported: v1.project === "Old Piece" && v1.state === "running" && v1.errors === 0 && v1.glow === "1.00",
    ...(attach
      ? {
          agentAttached:
            /in the Siljangnim desktop app/.test(attach.opened ?? "") &&
            /without errors/.test(attach.written ?? "") &&
            attach.during?.status === "connected" &&
            attach.during.tabs[0] === "Activity" &&
            attach.during.activity.includes("scene_write") &&
            attach.during.monitors.includes("attached"),
          agentDetached: attach.after?.tabs[0] === "Chat" && attach.after.status === null,
        }
      : {}),
    ...(localAgent
      ? {
          // The stand-in Claude Code is found and signed in, its tool call reaches this window through the bundled
          // bridge without an outside-agent takeover, and the second message resumes its session.
          localAgentChat:
            localAgent.engines?.["claude-code"]?.loggedIn === true &&
            localAgent.first?.text.includes("asked: Make it orange") &&
            localAgent.first.monitors.includes("local") &&
            localAgent.first.status === null &&
            localAgent.first.tabs[0] === "Chat",
          localAgentResumes: Boolean(localAgent.second?.text.includes("resumed mock-session-1")),
        }
      : {}),
    exampleCacheReused: exampleCache.cachedLabel && exampleCache.opened && exampleCache.requests === 0,
    exampleDownloadRecovery: exampleCache.failedCleanly && exampleCache.cancelledCleanly && exampleCache.retried,
    examplesRun:
      Object.keys(examples).length >= 10 && // 1% lit: sparse pieces (a graph of dots and thin lines on black) are real output too.
      Object.values(examples).every((e) => e.skipped || (e.state === "running" && e.errors === 0 && e.litFraction > 0.01)),
  };
  const ok = Object.values(checks).every(Boolean);
  report({ ok, checks, scene, iframe, llm, agent, history, examples, exampleCache, frameCheck, v1, folder, attach, localAgent, bridge, hub: { ...info, token: undefined }, system, consoleErrors });
  clearTimeout(timer);
  quit(hub, ok ? 0 : 1);
}

// app.exit skips before-quit, where the app normally stops the hub; without
// this every smoke run left a Python process behind.
function quit(hub, code) {
  hub.stop();
  app.exit(code);
}
