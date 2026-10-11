// Where things live in dev (running from the repo) vs. in the packaged app.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(desktopDir, "..");

export function rendererDir() {
  return join(app.getAppPath(), "stage", "renderer");
}

export function proxyModulePath() {
  return join(app.getAppPath(), "stage", "proxy", "proxy.js");
}

export function hubDir() {
  return app.isPackaged ? join(process.resourcesPath, "hub") : join(repoRoot, "hub");
}

export function uvPath() {
  const exe = process.platform === "win32" ? "uv.exe" : "uv";
  const bundled = app.isPackaged ? join(process.resourcesPath, "bin", exe) : join(desktopDir, "vendor", "bin", exe);
  return existsSync(bundled) ? bundled : exe; // fall back to uv on PATH
}

export function runtimeDir() {
  return join(app.getPath("userData"), "runtime");
}

export function logsDir() {
  return join(app.getPath("userData"), "logs");
}
