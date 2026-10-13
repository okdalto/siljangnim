#!/usr/bin/env node
// Entry point MCP clients launch, e.g.
//   claude mcp add siljangnim -- node /path/to/siljangnim/mcp/bin/siljangnim-mcp.js
// stdout carries MCP messages; everything else goes to stderr.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_PORT, createBridge } from "./bridge.js";
import { createHubLauncher, findHubDir, findUv } from "./hub.js";
import { attachToDesktop } from "./desktop.js";
import { openBrowser } from "./open.js";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (message) => process.stderr.write(`[siljangnim-mcp] ${message}\n`);

// A published package carries the built studio in ./studio; in the repo it is ../studio/dist.
const studioDir = resolve(
  process.env.SILJANGNIM_STUDIO_DIR || (existsSync(join(pkgDir, "studio", "index.html")) ? join(pkgDir, "studio") : join(pkgDir, "..", "studio", "dist")),
);
// Started by the desktop app for its chat: the app is the viewer, so no studio build or browser is needed.
const embedded = Boolean(process.env.SILJANGNIM_EMBEDDED);
if (!embedded && !existsSync(join(studioDir, "index.html"))) {
  log(`no studio build at ${studioDir}; run: npm --prefix studio run build`);
  process.exit(1);
}

const spec = JSON.parse(readFileSync(join(pkgDir, "src", "spec.json"), "utf8"));
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
// SILJANGNIM_OPEN=0 leaves opening to someone else (tests, remote sessions); the URL is logged.
// SILJANGNIM_OPEN_COMMAND names a program to open it with instead (called with the URL).
const openCommand = process.env.SILJANGNIM_OPEN_COMMAND;
const open =
  embedded || process.env.SILJANGNIM_OPEN === "0"
    ? () => undefined
    : openCommand
      ? (url) => spawn(openCommand, [url], { detached: true, stdio: "ignore" }).on("error", (err) => log(`${openCommand}: ${err.message}`)).unref()
      : (url) => openBrowser(url, log);

// The runtime hub (python_run, command_run) starts only when a tool needs it.
let viewerOrigin = "";
// SILJANGNIM_RUNTIME_ROOT moves the hub's Python, venvs and job folders (default ~/.siljangnim/runtime).
const hub = createHubLauncher({
  uv: findUv(pkgDir),
  hubDir: findHubDir(pkgDir),
  ...(process.env.SILJANGNIM_RUNTIME_ROOT ? { runtimeDir: process.env.SILJANGNIM_RUNTIME_ROOT } : {}),
  origins: () => [viewerOrigin],
  log,
});
const bridge = createBridge({
  studioDir,
  spec,
  version,
  port: Number(process.env.SILJANGNIM_PORT) || DEFAULT_PORT,
  open,
  log,
  hub: (origin) => {
    viewerOrigin = origin;
    return hub.get();
  },
  // A running desktop app becomes the viewer (SILJANGNIM_VIEWER=browser always opens a browser tab).
  ...(process.env.SILJANGNIM_VIEWER === "browser" ? {} : { attach: (request) => attachToDesktop(request, log) }),
});
await bridge.listen();
await bridge.mcp.connect(new StdioServerTransport());
if (process.env.SILJANGNIM_OPEN_ON_CONNECT === "1") {
  void bridge.openViewer().catch((error) => log(`viewer: ${error.message}`));
}

const shutdown = () => {
  hub.stop();
  void bridge.close().finally(() => process.exit(0));
};
process.stdin.on("close", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
