import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain, session, shell } from "electron";
import { startAttachServer } from "./attach.js";
import { Hub } from "./hub.js";
import { KeyStore } from "./keys.js";
import { originOf, resolveOrigins } from "./origins.js";
import { handleAppProtocol, registerScheme } from "./protocol.js";
import { runSmokeTest } from "./smoke.js";

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
  ipcMain.handle("hub:info", (event) => (fromApp(event) ? hub.info() : null));
  ipcMain.handle("keys:status", (event) => (fromApp(event) ? keys.status() : null));
  ipcMain.handle("llm:token", (event) => (fromApp(event) ? forwarderToken : null));
  ipcMain.handle("keys:set", (event, provider, key) => {
    if (!fromApp(event)) throw new Error("forbidden");
    keys.set(provider, key);
  });
  hub.on("status", (info) => mainWindow?.webContents.send("hub:status", info));
  ipcMain.handle("agent:pending", (event) => {
    if (!fromApp(event)) return null;
    const request = pendingAttach;
    pendingAttach = null;
    return request;
  });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
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
      pendingAttach = request;
      mainWindow.webContents.send("agent:attach", request);
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
});
