// Opens a URL in the person's default browser.
import { spawn } from "node:child_process";

export function openBrowser(url, log = () => undefined) {
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
