// Smoke test used by `npm run smoke` and CI: wait for the page and the hub,
// save a screenshot plus a JSON report, then quit with a status code.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

const TIMEOUT_MS = 240_000;

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

export async function runSmokeTest(win, hub, outDir) {
  mkdirSync(outDir, { recursive: true });
  const consoleErrors = [];
  win.webContents.on("console-message", ({ level, message }) => {
    if (level === "error") consoleErrors.push(message);
  });

  const timer = setTimeout(() => {
    writeFileSync(join(outDir, "report.json"), JSON.stringify({ ok: false, reason: "timeout", hub: hub.info() }, null, 2));
    app.exit(1);
  }, TIMEOUT_MS);

  await new Promise((resolve) => {
    if (!win.webContents.isLoading()) return resolve();
    win.webContents.once("did-finish-load", resolve);
  });
  await waitForHub(hub);
  // Let the renderer settle (lazy chunks, first frames).
  await new Promise((r) => setTimeout(r, 3000));

  const image = await win.webContents.capturePage();
  writeFileSync(join(outDir, "window.png"), image.toPNG());

  const bridge = await win.webContents.executeJavaScript(`(async () => {
    if (!window.siljangnim) return null;
    const hubInfo = await window.siljangnim.hub.info();
    // Any answer other than 403/404/405 means /api/proxy is routed (upstream may still fail offline).
    const proxy = await fetch("/api/proxy?target=fetch", { method: "POST", headers: { "x-fetch-url": "https://example.com" } })
      .then((r) => r.status, () => 0);
    return {
      desktop: window.siljangnim.desktop,
      hubStatus: hubInfo.status,
      proxyStatus: proxy,
      webgl2: !!document.createElement("canvas").getContext("webgl2"),
      webgpu: "gpu" in navigator,
    };
  })()`);
  let system = null;
  const info = hub.info();
  if (info.status === "ready") {
    const res = await fetch(`${info.url}/system`, { headers: { Authorization: `Bearer ${hub.token}` } });
    system = await res.json();
  }

  const proxyRouted = bridge && ![0, 403, 404, 405].includes(bridge.proxyStatus);
  const ok = info.status === "ready" && bridge?.desktop === true && proxyRouted;
  writeFileSync(
    join(outDir, "report.json"),
    JSON.stringify({ ok, hub: { ...info, token: undefined }, bridge, system, consoleErrors }, null, 2),
  );
  clearTimeout(timer);
  app.exit(ok ? 0 : 1);
}
