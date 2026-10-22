import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const isThreadId = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const run = promisify(execFile);
const localCli = join(homedir(), ".local", "bin", process.platform === "win32" ? "codex.exe" : "codex");

/** Queue into an explicitly bound existing conversation. Never start/resume a separate agent run. */
export async function queueCodexMessage(threadId, text, execute = run) {
  if (!isThreadId(threadId)) throw new Error("Connect an exact Codex conversation ID first.");
  if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text, "utf8") > 16000) {
    throw new Error("The request must be nonempty and at most 16 KB. Copy longer remixes into Codex.");
  }
  try {
    const binary = process.env.SILJANGNIM_CODEX_PATH || (existsSync(localCli) ? localCli : "codex");
    await execute(binary, ["queue", "--thread", threadId, "--message", text], { timeout: 15000, maxBuffer: 128 * 1024, windowsHide: true });
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Codex CLI was not found. Install a version with codex queue, or set SILJANGNIM_CODEX_PATH.");
    // A timeout/disconnect may happen after acceptance: do not retry or claim delivery.
    throw new Error("Codex did not confirm queuing the message. Check the target chat before retrying. Make sure codex queue can reach the app's session.");
  }
}
