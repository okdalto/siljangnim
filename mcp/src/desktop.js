// Hand the bridge to a running Siljangnim desktop app instead of opening a
// browser tab (desktop/src/attach.js writes the discovery file it reads).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TIMEOUT_MS = 3000;

export function discoveryFile() {
  return process.env.SILJANGNIM_DESKTOP_FILE || join(homedir(), ".siljangnim", "desktop.json");
}

/**
 * Ask the desktop app to connect to this bridge. Resolves true when it took it,
 * false when no app is running (or it refused): then the browser viewer opens.
 * @param {{ ws: string, token: string }} request
 */
export async function attachToDesktop(request, log = () => undefined) {
  let info;
  try {
    info = JSON.parse(readFileSync(discoveryFile(), "utf8"));
  } catch {
    return false;
  }
  try {
    process.kill(info.pid, 0);
  } catch {
    return false; // stale file from an app that crashed
  }
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/connect`, {
      method: "POST",
      headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
      // Started by the app for its own chat (desktop/src/localAgents.js): the app checks this run token.
      body: JSON.stringify(process.env.SILJANGNIM_EMBEDDED ? { ...request, embedded: process.env.SILJANGNIM_EMBEDDED } : request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return true;
    log(`the desktop app declined: ${res.status}`);
  } catch (err) {
    log(`the desktop app didn't answer: ${err instanceof Error ? err.message : err}`);
  }
  return false;
}
