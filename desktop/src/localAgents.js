// Runs the person's own Claude Code or Codex CLI as the app's chat agent, so the chat works on their Claude or
// ChatGPT plan instead of an API key. The CLI gets siljangnim-mcp as its only MCP server; that bridge attaches to
// this window (attach.js) like any external agent, so tools still run in the viewer through runTool.
//
// Each run is one CLI process: the prompt goes in on stdin, the CLI's JSON event stream is turned into a few
// provider-neutral events for the renderer, and the CLI's session id is handed back so the next message resumes it.
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** Our MCP tools as the CLIs name them. */
const MCP_SERVER = "siljangnim";

/** Read-only tools Claude Code may use besides ours; anything else (Bash, Edit, Write…) is denied in print mode. */
const CLAUDE_ALLOWED = [`mcp__${MCP_SERVER}`, "Read", "Glob", "Grep", "WebSearch", "WebFetch"];

const APPEND_PROMPT =
  "You are the chat agent inside the Siljangnim desktop app. The person is talking to you in the app's chat panel, " +
  "next to the viewer your siljangnim tools act on (it is already open; never ask them to open a browser). " +
  "Do the work with the siljangnim tools; you can't run shell commands or edit files here (use the runtime tools for " +
  "code that must run on this machine). Reply in the person's language, briefly.";

export const ENGINES = {
  "claude-code": {
    label: "Claude Code",
    names: ["claude"],
    override: "SILJANGNIM_CLAUDE_PATH",
    install: {
      darwin: "curl -fsSL https://claude.ai/install.sh | bash",
      linux: "curl -fsSL https://claude.ai/install.sh | bash",
      win32: "irm https://claude.ai/install.ps1 | iex",
    },
    docs: "https://docs.claude.com/en/docs/claude-code/setup",
  },
  codex: {
    label: "Codex",
    names: ["codex"],
    override: "SILJANGNIM_CODEX_PATH",
    install: {
      darwin: "npm install -g @openai/codex",
      linux: "npm install -g @openai/codex",
      win32: "npm install -g @openai/codex",
    },
    docs: "https://github.com/openai/codex",
  },
};

/** Where the CLIs install themselves; a GUI app on macOS doesn't inherit the shell's PATH. */
export function extraDirs(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === "win32") {
    return [env.APPDATA && join(env.APPDATA, "npm"), env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Programs", "claude"), join(home, ".local", "bin")].filter(Boolean);
  }
  return [join(home, ".local", "bin"), join(home, ".claude", "local"), join(home, ".npm-global", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
}

export function findExecutable(names, dirs, platform = process.platform, exists = existsSync) {
  const exts = platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const dir of dirs) {
    for (const name of names) {
      for (const ext of exts) {
        const path = join(dir, name + ext);
        if (exists(path)) return path;
      }
    }
  }
  return null;
}

let loginPath = null;
/** The PATH a terminal would have (login shell), so the CLIs and what they start (node, git) are found. */
export function shellPath() {
  if (loginPath) return loginPath;
  const base = process.env.PATH || "";
  if (process.platform === "win32") return (loginPath = Promise.resolve(base));
  const shell = process.env.SHELL || "/bin/zsh";
  loginPath = new Promise((resolve) => {
    // Markers around the value, since profile scripts may print their own output.
    execFile(shell, ["-ilc", 'printf "__SJ_PATH__%s__SJ_PATH__" "$PATH"'], { timeout: 5000, env: process.env }, (err, stdout) => {
      const found = String(stdout ?? "").match(/__SJ_PATH__(.*)__SJ_PATH__/s)?.[1];
      resolve(!err && found ? found : base);
    });
  });
  return loginPath;
}

async function searchDirs() {
  const path = await shellPath();
  return [...path.split(delimiter).filter(Boolean), ...extraDirs()];
}

/** The CLI's path; an env override (smoke test's mock) wins. */
async function locate(engine) {
  return process.env[engine.override] || findExecutable(engine.names, await searchDirs());
}

/** How to start a CLI: a .mjs stand-in runs on this Electron as Node, so the smoke test works on every OS. */
function launch(path, args, env) {
  if (/\.m?js$/.test(path)) return [process.execPath, [path, ...args], { ...env, ELECTRON_RUN_AS_NODE: "1" }];
  return [path, args, env];
}

function run(path, args, baseEnv, timeout = 10_000) {
  const [file, fullArgs, env] = launch(path, args, baseEnv);
  return new Promise((resolve) => {
    execFile(file, fullArgs, { timeout, env, windowsHide: true, shell: process.platform === "win32" && file.endsWith(".cmd") }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

async function childEnv() {
  const env = { ...process.env, PATH: await shellPath() };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/** Whether each CLI is installed and signed in. */
export async function detect() {
  const dirs = await searchDirs();
  const env = await childEnv();
  const result = {};
  for (const [id, engine] of Object.entries(ENGINES)) {
    const path = process.env[engine.override] || findExecutable(engine.names, dirs);
    if (!path) {
      result[id] = { installed: false, loggedIn: false, install: engine.install[process.platform] ?? null, docs: engine.docs };
      continue;
    }
    const version = (await run(path, ["--version"], env)).stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
    let loggedIn = false;
    if (id === "claude-code") {
      const status = await run(path, ["auth", "status", "--json"], env);
      try {
        loggedIn = Boolean(JSON.parse(status.stdout).loggedIn);
      } catch {
        loggedIn = status.ok;
      }
    } else {
      const status = await run(path, ["login", "status"], env);
      loggedIn = status.ok && /logged in/i.test(status.stdout + status.stderr);
    }
    result[id] = { installed: true, path, version, loggedIn, install: engine.install[process.platform] ?? null, docs: engine.docs };
  }
  return result;
}

/** Runs the official installer, or the CLI's sign-in (which opens the browser). Resolves with its output. */
export async function setup(engineId, action) {
  const engine = ENGINES[engineId];
  if (!engine) throw new Error(`unknown engine ${engineId}`);
  const env = await childEnv();
  if (action === "install") {
    const command = engine.install[process.platform];
    if (!command) throw new Error("no installer for this platform");
    const [file, args] = process.platform === "win32" ? ["powershell.exe", ["-NoProfile", "-Command", command]] : [process.env.SHELL || "/bin/zsh", ["-lc", command]];
    loginPath = null; // the installer may add a directory to PATH
    return run(file, args, env, 300_000);
  }
  if (action === "login") {
    const path = await locate(engine);
    if (!path) throw new Error(`${engine.label} is not installed`);
    return run(path, engineId === "claude-code" ? ["auth", "login"] : ["login"], env, 300_000);
  }
  throw new Error(`unknown action ${action}`);
}

/** Folder the CLIs run in; a fixed one, since Claude Code keeps sessions per folder. */
export function workspace() {
  const dir = process.env.SILJANGNIM_AGENT_DIR || join(homedir(), "Siljangnim", "agent");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// --- event streams ---

const stripTool = (name) => String(name).replace(new RegExp(`^mcp__${MCP_SERVER}__`), "");

function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);
  return content.map((c) => (c?.type === "text" ? c.text : c?.type === "image" ? "[image]" : "")).filter(Boolean).join("\n");
}

/**
 * Claude Code's `--output-format stream-json`. Emits:
 *   {type:"session", id} · {type:"text", delta} · {type:"assistant", content:[text|tool_use]}
 *   {type:"tool_result", id, isError, text} · {type:"error", message, auth?}
 */
export function claudeParser(emit) {
  let failed = false;
  return (line) => {
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      return;
    }
    if (d.type === "system" && d.subtype === "init" && d.session_id) emit({ type: "session", id: d.session_id });
    else if (d.type === "stream_event" && !d.parent_tool_use_id) {
      const e = d.event;
      if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") emit({ type: "text", delta: e.delta.text });
    } else if (d.type === "assistant" && !d.parent_tool_use_id) {
      const blocks = d.message?.content ?? [];
      if (d.error || d.is_api_error_message) {
        failed = true;
        emit({ type: "error", message: resultText(blocks) || String(d.error), auth: d.error === "authentication_failed" });
        return;
      }
      const content = blocks
        .filter((b) => (b.type === "text" && b.text) || b.type === "tool_use")
        .map((b) => (b.type === "text" ? { type: "text", text: b.text } : { type: "tool_use", id: b.id, name: stripTool(b.name), input: b.input ?? {} }));
      if (content.length) emit({ type: "assistant", content });
    } else if (d.type === "user" && !d.parent_tool_use_id && Array.isArray(d.message?.content)) {
      for (const b of d.message.content) {
        if (b.type === "tool_result") emit({ type: "tool_result", id: b.tool_use_id, isError: Boolean(b.is_error), text: resultText(b.content) });
      }
    } else if (d.type === "result") {
      if (d.session_id) emit({ type: "session", id: d.session_id });
      if (d.is_error && !failed) emit({ type: "error", message: String(d.result || d.subtype || "Claude Code stopped with an error.") });
    }
  };
}

/** Codex's `exec --json` (thread/turn/item events). Same output events as claudeParser. */
export function codexParser(emit) {
  return (line) => {
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      return;
    }
    const item = d.item;
    if (d.type === "thread.started" && d.thread_id) emit({ type: "session", id: d.thread_id });
    else if (d.type === "item.started" && item?.type === "mcp_tool_call") {
      emit({ type: "assistant", content: [{ type: "tool_use", id: item.id, name: stripTool(item.tool), input: item.arguments ?? {} }] });
    } else if (d.type === "item.started" && item?.type === "command_execution") {
      emit({ type: "assistant", content: [{ type: "tool_use", id: item.id, name: "shell", input: { command: item.command } }] });
    } else if (d.type === "item.completed" && item?.type === "agent_message" && item.text) {
      emit({ type: "assistant", content: [{ type: "text", text: item.text }] });
    } else if (d.type === "item.completed" && item?.type === "mcp_tool_call") {
      const isError = item.status === "failed" || Boolean(item.error) || Boolean(item.result?.isError);
      emit({ type: "tool_result", id: item.id, isError, text: item.error?.message ?? resultText(item.result?.content) });
    } else if (d.type === "item.completed" && item?.type === "command_execution") {
      emit({ type: "tool_result", id: item.id, isError: item.exit_code !== 0, text: String(item.aggregated_output ?? "") });
    } else if (d.type === "turn.failed" || d.type === "error") {
      const raw = d.error?.message ?? d.message ?? "Codex stopped with an error.";
      let message = raw;
      try {
        message = JSON.parse(raw).error?.message ?? raw;
      } catch {
        // plain text
      }
      // Codex reports the same failure as `error` and then `turn.failed`.
      emit({ type: "error", message, auth: /log ?in|unauthori[sz]ed|401/i.test(message) });
    }
  };
}

const tomlString = (s) => JSON.stringify(s);

/** The CLI and arguments for one run; the prompt goes in on stdin. */
export function commandLine(engineId, { path, sessionId, mcp }) {
  if (engineId === "claude-code") {
    const config = { mcpServers: { [MCP_SERVER]: { command: mcp.command, args: mcp.args, env: mcp.env } } };
    return [
      path,
      [
        "-p",
        "--output-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--strict-mcp-config",
        "--mcp-config", JSON.stringify(config),
        "--allowedTools", CLAUDE_ALLOWED.join(","),
        "--append-system-prompt", APPEND_PROMPT,
        ...(sessionId ? ["--resume", sessionId] : []),
      ],
    ];
  }
  const env = `{ ${Object.entries(mcp.env).map(([k, v]) => `${k} = ${tomlString(v)}`).join(", ")} }`;
  const config = [
    `mcp_servers.${MCP_SERVER}.command=${tomlString(mcp.command)}`,
    `mcp_servers.${MCP_SERVER}.args=[${mcp.args.map(tomlString).join(", ")}]`,
    `mcp_servers.${MCP_SERVER}.env=${env}`,
    `mcp_servers.${MCP_SERVER}.tool_timeout_sec=120`,
    'sandbox_mode="read-only"',
    'approval_policy="never"',
    `developer_instructions=${tomlString(APPEND_PROMPT)}`,
  ].flatMap((c) => ["-c", c]);
  return [path, ["exec", ...(sessionId ? ["resume"] : []), "--json", "--skip-git-repo-check", ...config, ...(sessionId ? [sessionId] : []), "-"]];
}

/**
 * Start one run. `mcp` is how to launch siljangnim-mcp; its env gets SILJANGNIM_EMBEDDED so the bridge attaches
 * to this window as part of the chat rather than as an outside agent.
 * @returns {{ id: string, token: string, stop(): void }}
 */
export async function startRun({ engineId, prompt, sessionId, mcp, onEvent }) {
  const engine = ENGINES[engineId];
  if (!engine) throw new Error(`unknown engine ${engineId}`);
  const path = await locate(engine);
  if (!path) throw new Error(`${engine.label} is not installed.`);
  const token = randomBytes(16).toString("hex");
  const [cli, cliArgs] = commandLine(engineId, { path, sessionId, mcp: { ...mcp, env: { ...mcp.env, SILJANGNIM_EMBEDDED: token } } });
  const [file, args, env] = launch(cli, cliArgs, await childEnv());
  const child = spawn(file, args, {
    cwd: workspace(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: process.platform === "win32" && file.endsWith(".cmd"),
  });
  let errored = false;
  const emit = (event) => {
    if (event.type === "error") errored = true;
    onEvent(event);
  };
  const parse = engineId === "claude-code" ? claudeParser(emit) : codexParser(emit);
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) parse(line);
    }
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  let stopped = false;
  child.on("error", (err) => emit({ type: "error", message: `${engine.label} could not start: ${err.message}` }));
  child.on("close", (code) => {
    if (buffer.trim()) parse(buffer.trim());
    if (code && !stopped && !errored) emit({ type: "error", message: stderr.trim().split("\n").slice(-3).join("\n") || `${engine.label} exited with code ${code}.` });
    onEvent({ type: "done", stopped });
  });
  child.stdin.end(prompt);
  return {
    token,
    stop() {
      stopped = true;
      child.kill("SIGTERM");
      setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 3000).unref();
    },
  };
}
