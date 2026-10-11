// Smoke test used by `npm run smoke` and CI. Checks that the studio loads,
// the scene runtime renders in its own origin, the LLM forwarder answers
// the app and refuses the scene, and the hub starts. Saves a screenshot and
// a JSON report, then quits with a status code.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

const TIMEOUT_MS = 240_000;
const LLM_PROBE = "app://siljangnim/api/llm/anthropic/v1/messages";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const c = new OffscreenCanvas(32, 32);
  const g = c.getContext("2d");
  g.drawImage(bitmap, 0, 0, 32, 32);
  const data = g.getImageData(0, 0, 32, 32).data;
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
    litFraction: lit / 1024,
    meanRgb: sum.map((v) => Math.round(v / 1024)),
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

/** One agent run through the real UI, SDK, forwarder and tools (against the smoke test's mock API). */
async function runAgentScenario(win, sceneFrame, keys) {
  keys.set("anthropic", process.env.SILJANGNIM_SMOKE_KEY);
  const finalText = process.env.SILJANGNIM_SMOKE_FINAL_TEXT ?? "";
  const attached = await win.webContents.executeJavaScript(UPLOAD_ASSETS);
  await win.webContents.executeJavaScript(TYPE_PROMPT);
  let replied = false;
  for (let i = 0; i < 120 && !replied; i++) {
    await wait(500);
    replied = await win.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(finalText)})`);
  }
  await wait(500);
  const sample = sceneFrame ? await sceneFrame.executeJavaScript(SAMPLE_CANVAS).catch(() => null) : null;
  const chat = await win.webContents.executeJavaScript(`({
    chips: [...document.querySelectorAll("aside button")].map((b) => b.innerText).filter((t) => /scene|viewport/i.test(t)),
    images: document.querySelectorAll('aside img[alt="Viewport capture"]').length,
  })`);
  const [r, g, b] = sample?.meanRgb ?? [0, 0, 0];
  return { attached, replied, meanRgb: sample?.meanRgb, blue: b > 150 && b > 2 * r && b > g, ...chat };
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
  const sample = sceneFrame ? await sceneFrame.executeJavaScript(SAMPLE_CANVAS).catch(() => null) : null;
  const [r, , b] = sample?.meanRgb ?? [0, 0, 0];
  return {
    before,
    after,
    meanRgbAfterRestore: sample?.meanRgb,
    recorded: before.length === 2 && /Make a calm blue field/.test(before[1]?.text ?? "") && before[1]?.current && before.every((v) => v.thumbnail),
    // The default scene is orange: restoring it must replace the blue one, without adding a version.
    restored: after.length === 2 && after[0]?.current === true && r > b,
  };
}

export async function runSmokeTest(win, hub, keys, outDir) {
  mkdirSync(outDir, { recursive: true });
  const consoleErrors = [];
  win.webContents.on("console-message", ({ level, message }) => {
    if (level === "error") consoleErrors.push(message);
  });
  const report = (data) => writeFileSync(join(outDir, "report.json"), JSON.stringify(data, null, 2));

  const timer = setTimeout(() => {
    report({ ok: false, reason: "timeout", hub: { ...hub.info(), token: undefined } });
    app.exit(1);
  }, TIMEOUT_MS);

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
      sample = await sceneFrame.executeJavaScript(SAMPLE_CANVAS).catch((err) => ({ error: String(err) }));
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
    fromScene: sceneFrame ? await sceneFrame.executeJavaScript(probe(LLM_PROBE, false)) : null,
  };
  const bridge = await win.webContents.executeJavaScript(
    "window.siljangnim ? window.siljangnim.keys.status().then((keys) => ({ desktop: window.siljangnim.desktop, keys })) : null",
  );

  const agent = process.env.SILJANGNIM_SMOKE_KEY ? await runAgentScenario(win, sceneFrame, keys) : null;
  const history = agent ? await runHistoryScenario(win, sceneFrame) : null;

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
          agentReplied: agent.replied,
          agentSceneApplied: agent.blue,
          agentShowsCapture: agent.images > 0,
        }
      : {}),
    ...(history ? { historyRecorded: history.recorded, historyRestored: history.restored } : {}),
  };
  const ok = Object.values(checks).every(Boolean);
  report({ ok, checks, scene, iframe, llm, agent, history, bridge, hub: { ...info, token: undefined }, system, consoleErrors });
  clearTimeout(timer);
  app.exit(ok ? 0 : 1);
}
