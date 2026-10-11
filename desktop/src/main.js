import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain, session, shell } from "electron";
import { Hub } from "./hub.js";
import { ORIGIN, handleAppProtocol, registerScheme } from "./protocol.js";
import { runSmokeTest } from "./smoke.js";

const srcDir = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.SILJANGNIM_DEV_URL || null;
const START_URL = DEV_URL || `${ORIGIN}/`;

// Permissions the renderer actually uses: camera/mic (MediaPipe, audio input),
// MIDI controllers, fullscreen, clipboard, pointer lock for orbit controls.
const ALLOWED_PERMISSIONS = new Set([
  "media",
  "midi",
  "midiSysex",
  "fullscreen",
  "clipboard-sanitized-write",
  "pointerLock",
]);

app.setName("Siljangnim");
registerScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const hub = new Hub();
let mainWindow = null;

// Compare scheme + host rather than URL.origin: for custom schemes like
// app:// the origin is the opaque "null", which data: URLs share.
function isAppUrl(url) {
  try {
    const u = new URL(url);
    if (DEV_URL) return u.origin === new URL(DEV_URL).origin;
    return `${u.protocol}//${u.host}` === ORIGIN;
  } catch {
    return false;
  }
}

function configureSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isAppUrl(webContents.getURL()) && ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isAppUrl(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b0b0d",
    autoHideMenuBar: true,
    title: "Siljangnim",
    // macOS takes the icon from the app bundle; elsewhere the window needs it.
    ...(process.platform === "darwin" ? {} : { icon: join(srcDir, "..", "assets", "icon.png") }),
    webPreferences: {
      preload: join(srcDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const { webContents } = mainWindow;
  // External links open in the user's browser; the app window never leaves the app.
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
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

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  configureSession();
  if (!DEV_URL) await handleAppProtocol();

  ipcMain.handle("hub:info", () => hub.info());
  hub.on("status", (info) => mainWindow?.webContents.send("hub:status", info));

  const win = createWindow();
  hub.start();

  if (process.env.SILJANGNIM_SMOKE_OUT) {
    runSmokeTest(win, hub, process.env.SILJANGNIM_SMOKE_OUT);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => hub.stop());
