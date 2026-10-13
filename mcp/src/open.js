// Opens the viewer: in a Chromium-based browser's app mode when one is installed (its own window without tabs or
// an address bar, so it feels like an app), otherwise as a tab in the person's default browser.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

// Chrome first, then Edge (preinstalled on Windows), Brave and Chromium.
export function appBrowserCandidates(platform = process.platform, env = process.env) {
  if (platform === "darwin") {
    const apps = [
      "Google Chrome.app/Contents/MacOS/Google Chrome",
      "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "Brave Browser.app/Contents/MacOS/Brave Browser",
      "Chromium.app/Contents/MacOS/Chromium",
    ];
    return apps.flatMap((app) => [join("/Applications", app), join(homedir(), "Applications", app)]);
  }
  if (platform === "win32") {
    const roots = [env.LOCALAPPDATA, env.PROGRAMFILES, env["PROGRAMFILES(X86)"]].filter(Boolean);
    const exes = ["Google\\Chrome\\Application\\chrome.exe", "Microsoft\\Edge\\Application\\msedge.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"];
    return exes.flatMap((exe) => roots.map((root) => `${root}\\${exe}`));
  }
  const names = ["google-chrome", "google-chrome-stable", "microsoft-edge", "brave-browser", "chromium", "chromium-browser"];
  const dirs = (env.PATH || "").split(delimiter).filter(Boolean);
  return names.flatMap((name) => dirs.map((dir) => join(dir, name)));
}

export function findAppBrowser(platform = process.platform, env = process.env, exists = existsSync) {
  return appBrowserCandidates(platform, env).find((path) => exists(path)) ?? null;
}

function openTab(url, log) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? // start's first quoted argument is the window title.
          ["cmd", ["/c", "start", '""', url.replace(/&/g, "^&")]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", (err) => log(`could not open a browser (${err.message}); open ${url} yourself`));
    child.unref();
  } catch (err) {
    log(`could not open a browser (${err instanceof Error ? err.message : err}); open ${url} yourself`);
  }
}

// SILJANGNIM_APP_WINDOW=0 opens a normal tab instead of an app window.
export function openBrowser(url, log = () => undefined) {
  const browser = process.env.SILJANGNIM_APP_WINDOW === "0" ? null : findAppBrowser();
  if (!browser) return openTab(url, log);
  try {
    // If the browser is already running, this hands the window to it and exits.
    const child = spawn(browser, [`--app=${url}`, "--window-size=1440,900"], { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", (err) => {
      log(`could not open ${browser} (${err.message}); opening a tab instead`);
      openTab(url, log);
    });
    child.unref();
  } catch {
    openTab(url, log);
  }
}
