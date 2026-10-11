// Downloads the uv binary for the current platform into vendor/bin/.
// The desktop app uses it to install Python and the hub's dependencies on
// first launch, so users never need Python on their machine.
//
// Uses the system curl and tar (both ship with macOS and Windows 10+) so it
// honours the user's proxy settings the same way other tools do.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UV_VERSION = "0.12.16";

const TARGETS = {
  "darwin-arm64": "uv-aarch64-apple-darwin.tar.gz",
  "darwin-x64": "uv-x86_64-apple-darwin.tar.gz",
  "win32-x64": "uv-x86_64-pc-windows-msvc.zip",
  "win32-arm64": "uv-aarch64-pc-windows-msvc.zip",
  "linux-x64": "uv-x86_64-unknown-linux-gnu.tar.gz",
  "linux-arm64": "uv-aarch64-unknown-linux-gnu.tar.gz",
};

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(desktopDir, "vendor", "bin");
const exeName = process.platform === "win32" ? "uv.exe" : "uv";
const marker = join(binDir, ".uv-version");

// On Windows prefer the built-in bsdtar/curl: a GNU tar from Git for Windows
// may come first on PATH and cannot unpack .zip files.
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

function main() {
  if (process.env.SILJANGNIM_SKIP_UV_DOWNLOAD) {
    console.log("[fetch-uv] skipped (SILJANGNIM_SKIP_UV_DOWNLOAD set)");
    return;
  }
  const key = `${process.platform}-${process.arch}`;
  const asset = TARGETS[key];
  if (!asset) {
    console.warn(`[fetch-uv] no uv build for ${key}; the app will look for uv on PATH`);
    return;
  }
  if (existsSync(join(binDir, exeName)) && existsSync(marker) && readFileSync(marker, "utf8").trim() === `${UV_VERSION} ${asset}`) {
    return;
  }

  const base = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`;
  const work = join(tmpdir(), `siljangnim-uv-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    const archive = join(work, asset);
    console.log(`[fetch-uv] downloading uv ${UV_VERSION} (${asset})`);
    execFileSync(systemTool("curl"), ["-fsSL", "--retry", "3", "-o", archive, `${base}/${asset}`], { stdio: "inherit" });
    const expected = execFileSync(systemTool("curl"), ["-fsSL", "--retry", "3", `${base}/${asset}.sha256`]).toString().trim().split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
    if (expected !== actual) throw new Error(`checksum mismatch for ${asset}: expected ${expected}, got ${actual}`);

    const out = join(work, "out");
    mkdirSync(out);
    execFileSync(systemTool("tar"), ["-xf", archive, "-C", out], { stdio: "inherit" });
    const exe = findFile(out, exeName);
    if (!exe) throw new Error(`${exeName} not found in ${asset}`);

    mkdirSync(binDir, { recursive: true });
    cpSync(exe, join(binDir, exeName));
    if (process.platform !== "win32") chmodSync(join(binDir, exeName), 0o755);
    writeFileSync(marker, `${UV_VERSION} ${asset}\n`);
    console.log(`[fetch-uv] installed ${join(binDir, exeName)}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
