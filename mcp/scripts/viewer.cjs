// Electron main used by the smoke test as "the person's browser": loads the
// viewer URL, reports what the page shows, and saves a screenshot on exit.
const { app, BrowserWindow, session } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const url = process.env.SILJANGNIM_VIEWER_URL;
const out = process.env.SILJANGNIM_SMOKE_OUT;
app.setPath("userData", join(out, "profile"));

const READ_STATE = `(() => ({
  status: document.querySelector('[data-testid="external-status"]')?.dataset.status ?? null,
  statusText: document.querySelector('[data-testid="external-status"]')?.innerText ?? null,
  tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.innerText),
  activity: [...document.querySelectorAll('[data-activity]')].map((a) => a.dataset.activity),
  widgets: [...document.querySelectorAll('[data-widget]')].map((w) => w.dataset.widget),
  monitors: [...document.querySelectorAll('[data-monitor]')].map((m) => m.dataset.monitor),
  keyMarks: document.querySelectorAll('[data-key-time]').length,
  assets: [...document.querySelectorAll('[data-asset]')].map((a) => a.dataset.asset),
}))()`;

app.whenReady().then(async () => {
  // Recordings download without a save dialog, into the smoke output.
  session.defaultSession.on("will-download", (_e, item) => item.setSavePath(join(out, "downloads", item.getFilename())));
  const win = new BrowserWindow({ width: 1280, height: 800, show: true });
  await win.loadURL(url);
  const report = async () => {
    try {
      // The person approves the agent's Python run when asked.
      await win.webContents.executeJavaScript(`document.querySelector('[data-approval="project"]')?.click()`);
      writeFileSync(join(out, "viewer.json"), JSON.stringify(await win.webContents.executeJavaScript(READ_STATE)));
    } catch {
      // page navigating; next tick
    }
  };
  setInterval(report, 300);
  process.on("SIGTERM", async () => {
    await report();
    writeFileSync(join(out, "viewer.png"), (await win.webContents.capturePage()).toPNG());
    app.exit(0);
  });
});
