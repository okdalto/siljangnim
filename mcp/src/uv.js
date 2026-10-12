// uv for an installed package (npx siljangnim-mcp), where the repo's bundled
// copy isn't there: downloaded once, the same pinned release the desktop app
// ships (desktop/scripts/fetch-uv.mjs), and checked against its published sha256.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
export const UV_VERSION = "0.12.16";

const TARGETS = {
  "darwin-arm64": "uv-aarch64-apple-darwin.tar.gz",
  "darwin-x64": "uv-x86_64-apple-darwin.tar.gz",
  "win32-x64": "uv-x86_64-pc-windows-msvc.zip",
  "win32-arm64": "uv-aarch64-pc-windows-msvc.zip",
  "linux-x64": "uv-x86_64-unknown-linux-gnu.tar.gz",
  "linux-arm64": "uv-aarch64-unknown-linux-gnu.tar.gz",
};

const exeName = process.platform === "win32" ? "uv.exe" : "uv";

// Windows: the built-in curl/bsdtar (a GNU tar from Git for Windows can't unpack .zip).
function systemTool(name) {
  if (process.platform !== "win32") return name;
  const builtIn = join(process.env.SystemRoot || "C:\\Windows", "System32", `${name}.exe`);
  return existsSync(builtIn) ? builtIn : name;
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

/** Whether a program answers --version (uv on PATH). */
export async function works(program) {
  try {
    await run(program, ["--version"], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Path to a uv binary under `dir` (<runtime>/uv), downloading it the first time.
 * @param {string} dir
 * @param {(m: string) => void} [log]
 */
export async function ensureUv(dir, log = () => undefined) {
  const target = join(dir, UV_VERSION, exeName);
  if (existsSync(target)) return target;
  const asset = TARGETS[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error(`no uv build for ${process.platform}-${process.arch}; install uv (https://docs.astral.sh/uv/) or set SILJANGNIM_UV`);
  const base = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`;
  const work = join(tmpdir(), `siljangnim-uv-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    log(`downloading uv ${UV_VERSION} (${asset}), once`);
    const archive = join(work, asset);
    await run(systemTool("curl"), ["-fsSL", "--retry", "3", "-o", archive, `${base}/${asset}`], { windowsHide: true });
    const { stdout } = await run(systemTool("curl"), ["-fsSL", "--retry", "3", `${base}/${asset}.sha256`], { windowsHide: true });
    const expected = stdout.trim().split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
    if (expected !== actual) throw new Error(`checksum mismatch for ${asset}: expected ${expected}, got ${actual}`);
    const out = join(work, "out");
    mkdirSync(out);
    await run(systemTool("tar"), ["-xf", archive, "-C", out], { windowsHide: true });
    const found = findFile(out, exeName);
    if (!found) throw new Error(`${exeName} not found in ${asset}`);
    mkdirSync(join(dir, UV_VERSION), { recursive: true });
    cpSync(found, target);
    if (process.platform !== "win32") chmodSync(target, 0o755);
    return target;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
