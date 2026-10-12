// Electron main used by the smoke test as "the person's browser": loads the
// viewer URL, reports what the page shows, and saves a screenshot on exit.
const { app, BrowserWindow, session } = require("electron");
const { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const url = process.env.SILJANGNIM_VIEWER_URL;
const out = process.env.SILJANGNIM_SMOKE_OUT;
app.setPath("userData", join(out, "profile"));
// Chromium's fake microphone (a beep) and camera (a test pattern), with permission prompts accepted.
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
// Keep rendering when the window is behind others (Chromium pauses occluded windows).
for (const flag of ["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"]) app.commandLine.appendSwitch(flag);

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
  const win = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { backgroundThrottling: false } });
  // The page's console, for when something goes wrong.
  const logLines = [];
  win.webContents.on("console-message", ({ level, message }) => {
    logLines.push(`[${level}] ${message}`);
    writeFileSync(join(out, "viewer-console.log"), logLines.slice(-300).join("\n"));
  });
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
  // The smoke test acts as the person: it drops <name>.js into commands/, which runs in the page;
  // the result lands in <name>.json.
  const commands = join(out, "commands");
  setInterval(async () => {
    if (!existsSync(commands)) return;
    for (const file of readdirSync(commands).filter((f) => f.endsWith(".js"))) {
      const path = join(commands, file);
      const code = readFileSync(path, "utf8");
      renameSync(path, `${path}.taken`);
      let result;
      try {
        result = { ok: true, value: await win.webContents.executeJavaScript(code) };
      } catch (err) {
        result = { ok: false, error: String(err) };
      }
      writeFileSync(path.replace(/\.js$/, ".json"), JSON.stringify(result));
    }
  }, 200);
  process.on("SIGTERM", async () => {
    await report();
    writeFileSync(join(out, "viewer.png"), (await win.webContents.capturePage()).toPNG());
    app.exit(0);
  });
});
