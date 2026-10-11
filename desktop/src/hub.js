// Runs the Python hub as a sidecar process.
//
// First launch: the bundled uv downloads a managed Python and installs the
// hub's locked dependencies into the app's data folder. Later launches only
// re-check the lock (fast) and start the hub. Nothing touches the user's own
// Python installation.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { createWriteStream, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { hubDir, logsDir, runtimeDir, uvPath } from "./paths.js";

const READY_TIMEOUT_MS = 30_000;
// Keep in sync with hub/.python-version (dotfiles are not packaged).
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

function venvPython(venv) {
  return process.platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
}

export class Hub extends EventEmitter {
  constructor() {
    super();
    this.status = "idle"; // idle | installing | starting | ready | error | stopped
    this.error = null;
    this.port = null;
    this.token = randomBytes(32).toString("hex");
    this.child = null;
    this.stopping = false;
    this.logPath = join(logsDir(), "hub.log");
  }

  info() {
    return {
      status: this.status,
      error: this.error,
      url: this.port ? `http://127.0.0.1:${this.port}` : null,
      token: this.status === "ready" ? this.token : null,
      logPath: this.logPath,
    };
  }

  #set(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit("status", this.info());
  }

  #log(line) {
    this.logStream?.write(`[${new Date().toISOString()}] ${line}\n`);
  }

  #env() {
    const runtime = runtimeDir();
    return {
      ...process.env,
      UV_PROJECT_ENVIRONMENT: join(runtime, "hub-venv"),
      UV_PYTHON_INSTALL_DIR: join(runtime, "python"),
      UV_CACHE_DIR: join(runtime, "uv-cache"),
      UV_PYTHON_PREFERENCE: "only-managed",
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1",
      SILJANGNIM_HUB_TOKEN: this.token,
    };
  }

  #run(cmd, args, opts) {
    return new Promise((resolve, reject) => {
      this.#log(`$ ${cmd} ${args.join(" ")}`);
      const child = spawn(cmd, args, { ...opts, windowsHide: true });
      child.stdout.pipe(this.logStream, { end: false });
      child.stderr.pipe(this.logStream, { end: false });
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
    });
  }

  async start() {
    mkdirSync(logsDir(), { recursive: true });
    mkdirSync(runtimeDir(), { recursive: true });
    this.logStream = createWriteStream(this.logPath, { flags: "a" });
    const env = this.#env();
    const cwd = hubDir();

    try {
      this.#set("installing");
      await this.#run(uvPath(), ["sync", "--frozen", "--no-dev", "--python", HUB_PYTHON, "--project", cwd], { cwd, env });

      this.#set("starting");
      this.port = await freePort();
      // Start the venv's Python directly (not via `uv run`) so stopping it
      // never leaves an orphaned child behind on Windows.
      const child = spawn(venvPython(env.UV_PROJECT_ENVIRONMENT), ["-m", "siljangnim_hub", "--port", String(this.port)], {
        cwd,
        env,
        windowsHide: true,
      });
      this.child = child;
      child.stdout.pipe(this.logStream, { end: false });
      child.stderr.pipe(this.logStream, { end: false });
      child.on("exit", (code) => {
        this.child = null;
        if (this.stopping) return this.#set("stopped");
        this.#set("error", `hub exited unexpectedly (code ${code}); see ${this.logPath}`);
      });
      child.on("error", (err) => this.#set("error", err.message));

      await this.#waitReady();
      this.#set("ready");
    } catch (err) {
      this.#log(`start failed: ${err.message}`);
      this.#set("error", `${err.message}; see ${this.logPath}`);
    }
  }

  async #waitReady() {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.child) throw new Error("hub process exited during startup");
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (res.ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("hub did not become ready in time");
  }

  stop() {
    this.stopping = true;
    this.child?.kill();
  }
}
