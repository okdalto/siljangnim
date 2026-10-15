import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain, session, shell } from "electron";
import { startAttachServer } from "./attach.js";
import { Hub } from "./hub.js";
import { KeyStore } from "./keys.js";
import { detect as detectLocalAgents, setup as setupLocalAgent, startRun } from "./localAgents.js";
import { originOf, resolveOrigins } from "./origins.js";
import { projectsRoot, writeProjectFolder } from "./projectFolder.js";
import { handleAppProtocol, registerScheme } from "./protocol.js";
import { runSmokeTest } from "./smoke.js";

import { createUpdates } from "./updates.js";

const srcDir = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.SILJANGNIM_DEV_URL || null;
const ORIGINS = resolveOrigins(DEV_URL);
const START_URL = DEV_URL || `${ORIGINS.app}/`;

// Permissions the app and its scenes use: camera/mic (tracking, audio input),
// MIDI controllers, fullscreen, clipboard, pointer lock for orbit controls.
const ALLOWED_PERMISSIONS = new Set(["media", "midi", "midiSysex", "fullscreen", "clipboard-sanitized-write", "pointerLock"]);

app.setName("Siljangnim");
// Lets the smoke test run against a throwaway profile instead of the user's projects and keys.
if (process.env.SILJANGNIM_USER_DATA) app.setPath("userData", process.env.SILJANGNIM_USER_DATA);
registerScheme();
// The smoke test's window may sit behind others; Chromium would pause an occluded window's
// rendering and timers, and every scene would look stuck in "loading".
if (process.env.SILJANGNIM_SMOKE_OUT) {
  for (const flag of ["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"]) {
    app.commandLine.appendSwitch(flag);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const hub = new Hub();
const forwarderToken = randomBytes(32).toString("hex");
let keys = null;
let mainWindow = null;
let attachServer = null;
/** A bridge that asked to attach before the UI was listening; the UI takes it on startup. */
let pendingAttach = null;
/** Chat runs on the person's Claude Code / Codex, by run id; their bridges attach with the run's token. */
const localRuns = new Map();
let runSerial = 0;

/** siljangnim-mcp for a local run, started by the CLI with this app's Electron as Node. */
function mcpLauncher() {
  const dir = app.isPackaged ? join(process.resourcesPath, "mcp") : join(srcDir, "..", "..", "mcp");
  return { command: process.execPath, args: [join(dir, "bin", "siljangnim-mcp.js")], env: { ELECTRON_RUN_AS_NODE: "1" } };
}

const isAppOrigin = (url) => originOf(url) === ORIGINS.app;
const isOurOrigin = (url) => isAppOrigin(url) || originOf(url) === ORIGINS.scene;

function configureSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requester = details?.requestingUrl ?? webContents.getURL();
    callback(isAppOrigin(webContents.getURL()) && isOurOrigin(requester) && ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isOurOrigin(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0d0d0f",
    autoHideMenuBar: true,
    title: "Siljangnim",
    // macOS takes the icon from the app bundle; elsewhere the window needs it.
    ...(process.platform === "darwin" ? {} : { icon: join(srcDir, "..", "assets", "icon.png") }),
    webPreferences: {
      preload: join(srcDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !process.env.SILJANGNIM_SMOKE_OUT,
    },
  });

  const { webContents } = mainWindow;
  // External links open in the user's browser; the app window never leaves the app.
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (!isAppOrigin(url)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(START_URL);
  return mainWindow;
}

/** IPC handlers answer only the app UI's main frame, never a scene or other frame. */
function fromApp(event) {
  return event.senderFrame?.parent === null && isAppOrigin(event.senderFrame.url);
}

function registerIpc() {
  const updates = createUpdates({ currentVersion: app.getVersion(), platform: process.platform, arch: process.arch, openExternal: (url) => shell.openExternal(url) });
  for (const action of ["info", "check", "download", "releases"]) {
    ipcMain.handle(`updates:${action}`, (event) => {
      if (!fromApp(event)) throw new Error("forbidden");
      return updates[action]();
    });
  }
  ipcMain.handle("hub:info", (event) => (fromApp(event) ? hub.info() : null));
  ipcMain.handle("keys:status", (event) => (fromApp(event) ? keys.status() : null));
  ipcMain.handle("llm:token", (event) => (fromApp(event) ? forwarderToken : null));
  ipcMain.handle("keys:set", (event, provider, key) => {
    if (!fromApp(event)) throw new Error("forbidden");
    keys.set(provider, key);
  });
  hub.on("status", (info) => mainWindow?.webContents.send("hub:status", info));
  ipcMain.handle("localAgent:detect", (event) => (fromApp(event) ? detectLocalAgents() : null));
  ipcMain.handle("localAgent:setup", (event, engine, action) => {
    if (!fromApp(event)) throw new Error("forbidden");
    return setupLocalAgent(engine, action);
  });
  ipcMain.handle("localAgent:run", async (event, engine, prompt, sessionId) => {
    if (!fromApp(event)) throw new Error("forbidden");
    if (typeof prompt !== "string" || (sessionId != null && typeof sessionId !== "string")) throw new Error("bad request");
    const id = `run-${++runSerial}`;
    const sender = event.sender;
    const run = await startRun({
      engineId: engine,
      prompt,
      sessionId: sessionId || null,
      mcp: mcpLauncher(),
      onEvent(e) {
        if (e.type === "done") localRuns.delete(id);
        if (!sender.isDestroyed()) sender.send("localAgent:event", id, e);
      },
    });
    localRuns.set(id, run);
    return id;
  });
  ipcMain.handle("localAgent:stop", (event, id) => {
    if (fromApp(event)) localRuns.get(id)?.stop();
  });
  ipcMain.handle("agent:pending", (event) => {
    if (!fromApp(event)) return null;
    const request = pendingAttach;
    pendingAttach = null;
    return request;
  });
  // Write the open project out as files and show the folder (Assets tab → Open folder).
  ipcMain.handle("project:reveal", async (event, folder, files) => {
    if (!fromApp(event)) throw new Error("forbidden");
    if (!Array.isArray(files)) throw new Error("files must be a list");
    const dir = writeProjectFolder(projectsRoot(), folder, files);
    // The smoke test checks the files; it shouldn't pop a Finder window.
    const failed = process.env.SILJANGNIM_SMOKE_OUT ? "" : await shell.openPath(dir);
    if (failed) throw new Error(failed);
    return dir;
  });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  // Run from source, macOS shows Electron's own Dock icon; the packaged app gets ours from the bundle.
  if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(join(srcDir, "..", "assets", "icon.png"));
  keys = new KeyStore();
  configureSession();
  // In dev the UI comes from Vite, but the LLM forwarder (with keys) is still served here.
  await handleAppProtocol({ origins: ORIGINS, keys, forwarderToken, serveRenderer: !DEV_URL });
  registerIpc();

  const win = createWindow();
  hub.start();
  // An agent's MCP bridge can use this window as its viewer.
  attachServer = await startAttachServer({
    version: app.getVersion(),
    onConnect(request) {
      if (!mainWindow) return false;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      // A local run's own bridge belongs to the chat; any other is an outside agent.
      const embedded = Boolean(request.embedded) && [...localRuns.values()].some((r) => r.token === request.embedded);
      const forUi = { ws: request.ws, token: request.token, ...(embedded ? { embedded: true } : {}) };
      if (!embedded) pendingAttach = forUi;
      mainWindow.webContents.send("agent:attach", forUi);
      return true;
    },
  }).catch((err) => {
    console.error(`[siljangnim] agents can't attach to this window: ${err.message}`);
    return null;
  });

  if (process.env.SILJANGNIM_SMOKE_OUT) {
    runSmokeTest(win, hub, keys, process.env.SILJANGNIM_SMOKE_OUT);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  hub.stop();
  attachServer?.close();
  for (const run of localRuns.values()) run.stop();
});
