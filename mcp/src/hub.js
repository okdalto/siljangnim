// Starts the Python hub (runtime jobs) for viewers opened by the bridge, the
// way desktop/src/hub.js does for the app: uv installs a managed Python and
// the hub's locked dependencies into ~/.siljangnim/runtime, then the hub runs
// on a free 127.0.0.1 port with a per-launch token.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureUv, works } from "./uv.js";

const READY_TIMEOUT_MS = 60_000;
// Keep in sync with hub/.python-version.
const HUB_PYTHON = "3.12";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * uv: SILJANGNIM_UV or the desktop's bundled copy in the repo; null means "uv on PATH, or download it"
 * (an installed package has no bundled copy), decided when the hub first starts.
 */
export function findUv(pkgDir) {
  if (process.env.SILJANGNIM_UV) return process.env.SILJANGNIM_UV;
  const bundled = join(pkgDir, "..", "desktop", "vendor", "bin", process.platform === "win32" ? "uv.exe" : "uv");
  return existsSync(bundled) ? bundled : null;
}

/** The hub's source: SILJANGNIM_HUB_DIR, a packaged copy in ./hub, or ../hub in the repo. */
export function findHubDir(pkgDir) {
  if (process.env.SILJANGNIM_HUB_DIR) return process.env.SILJANGNIM_HUB_DIR;
  return existsSync(join(pkgDir, "hub", "pyproject.toml")) ? join(pkgDir, "hub") : join(pkgDir, "..", "hub");
}

export function createHubLauncher({ uv, hubDir, runtimeDir = join(homedir(), ".siljangnim", "runtime"), origins = () => [], log = () => undefined }) {
  let starting = null;
  let child = null;

  const run = (cmd, args, env) =>
    new Promise((resolve, reject) => {
      const p = spawn(cmd, args, { cwd: hubDir, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
      let err = "";
      p.stderr.on("data", (c) => (err = (err + c).slice(-2000)));
      p.on("error", (e) => reject(new Error(`${cmd}: ${e.message}`)));
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} failed (${code}): ${err.trim()}`))));
    });

  async function start() {
    mkdirSync(runtimeDir, { recursive: true });
    if (!uv) uv = (await works("uv")) ? "uv" : await ensureUv(join(runtimeDir, "uv"), log);
    const token = randomBytes(32).toString("hex");
    const env = {
      ...process.env,
      UV_PROJECT_ENVIRONMENT: join(runtimeDir, "hub-venv"),
      UV_PYTHON_INSTALL_DIR: join(runtimeDir, "python"),
      UV_CACHE_DIR: join(runtimeDir, "uv-cache"),
      UV_PYTHON_PREFERENCE: "only-managed",
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1",
      SILJANGNIM_HUB_TOKEN: token,
      SILJANGNIM_UV: uv,
      SILJANGNIM_RUNTIME_DIR: join(runtimeDir, "tools"),
      SILJANGNIM_HUB_ORIGINS: origins().join(","),
    };
    log("setting up the runtime hub (first time installs Python)");
    await run(uv, ["sync", "--frozen", "--no-dev", "--python", HUB_PYTHON, "--project", hubDir], env);
    const port = await freePort();
    const python = join(env.UV_PROJECT_ENVIRONMENT, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    child = spawn(python, ["-m", "siljangnim_hub", "--port", String(port)], { cwd: hubDir, env, stdio: "ignore", windowsHide: true });
    child.on("exit", () => {
      child = null;
      starting = null;
    });
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!child) throw new Error("the runtime hub exited during startup");
      const ok = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok, () => false);
      if (ok) {
        log(`runtime hub ready at ${url}`);
        return { url, token };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("the runtime hub did not start in time");
  }

  return {
    /** The running hub, starting it on first use. */
    get() {
      starting ??= start().catch((err) => {
        starting = null;
        throw err;
      });
      return starting;
    },
    stop() {
      child?.kill();
    },
  };
}
