// The MCP bridge: an MCP server for external agents (Claude Code, Codex…)
// that serves the studio on localhost and relays tool calls to it.
//
//   agent ──MCP (stdio)──▶ bridge ──WebSocket──▶ viewer (studio in a browser) ──▶ scene iframe
//
// Tools run in the viewer, with the same definitions the built-in agent uses
// (spec.json is generated from studio/src/agent/external.ts). The viewer
// proves itself with a per-launch token that only reaches it in the URL
// fragment of the page the bridge opens.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";
import { toMcpResult } from "./content.js";
import { CallTracker, CALL_STATUS_TOOL } from "./calls.js";

export const DEFAULT_PORT = 47823;
const VIEWER_WAIT_MS = 30_000;
const HELLO_TIMEOUT_MS = 5_000;
/** Don't open a second tab while the first may still be loading. */
const REOPEN_AFTER_MS = 15_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

const VIEWER_OPEN_TOOL = {
  name: "viewer_open",
  description:
    "Open the Siljangnim viewer in the person's browser (or reopen it if they closed it) and wait until it is connected. " +
    "Other tools open it automatically; use this when the person asks to see the viewer or after it was closed.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
};

/**
 * @param {{
 *   studioDir: string,
 *   spec: { instructions: string, tools: Array<{ name: string, description: string, inputSchema: object, readOnly: boolean }> },
 *   version?: string,
 *   port?: number,
 *   responseWaitMs?: number,
 *   open?: (url: string) => void,
 *   log?: (message: string) => void,
 *   hub?: (origin: string) => Promise<{ url: string, token: string }>,
 *   attach?: (request: { ws: string, token: string }) => Promise<boolean>,
 * }} options  attach hands the bridge to a running desktop app (true when it took it) before a browser tab is opened;  hub starts (once) and returns the runtime hub for the viewer; leave it out to run without one
 */
export function createBridge({ studioDir, spec, version = "0.0.0", port = DEFAULT_PORT, open = () => undefined, log = () => undefined, hub, attach, responseWaitMs = 45_000 }) {
  const token = randomBytes(24).toString("base64url");
  let boundPort = port;
  /** @type {import("ws").WebSocket | null} */
  let viewer = null;
  let lastOpened = 0;
  let nextId = 1;
  /** Calls in flight, with the viewer socket each was sent to. */
  /** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void, name: string, socket: import("ws").WebSocket | null }>} */
  const pending = new Map();
  const calls = new CallTracker({ waitMs: responseWaitMs });
  /** @type {Array<() => void>} */
  let viewerWaiters = [];

  const appOrigin = () => `http://localhost:${boundPort}`;
  const viewerUrl = () => `${appOrigin()}/#bridge=${token}`;
  /** Where the viewer runs: the desktop app, or the studio this bridge serves in a browser. */
  let viewerPlace = "browser";
  // The desktop app's UI connects from its own scheme.
  const allowedOrigins = () => new Set([appOrigin(), "app://siljangnim"]);
  const allowedHosts = () => new Set([`localhost:${boundPort}`, `127.0.0.1:${boundPort}`, `[::1]:${boundPort}`]);

  // --- MCP ---

  const mcp = new Server({ name: "siljangnim", version }, { capabilities: { tools: {} }, instructions: spec.instructions });
  const clientName = () => mcp.getClientVersion()?.name ?? "an MCP client";
  mcp.oninitialized = () => send({ type: "client", name: clientName() });

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...spec.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly } })),
      VIEWER_OPEN_TOOL,
      CALL_STATUS_TOOL,
    ],
  }));

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: input = {} } = request.params;
    try {
      if (name === CALL_STATUS_TOOL.name) return toMcpResult(await calls.poll(input.call_id));
      if (name === VIEWER_OPEN_TOOL.name) {
        await ensureViewer(true);
        const where = viewerPlace === "desktop" ? "in the Siljangnim desktop app" : appOrigin();
        return { content: [{ type: "text", text: `The viewer is open and connected: ${where}` }] };
      }
      if (!spec.tools.some((t) => t.name === name)) {
        return { isError: true, content: [{ type: "text", text: `Unknown tool "${name}".` }] };
      }
      return toMcpResult(await calls.start(name, () => call(name, input)));
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] };
    }
  });

  // --- viewer connection ---

  function send(message) {
    if (viewer?.readyState === 1) viewer.send(JSON.stringify(message));
  }

  async function ensureViewer(forceOpen = false) {
    if (viewer?.readyState === 1 && !forceOpen) return;
    if (forceOpen || Date.now() - lastOpened > REOPEN_AFTER_MS) {
      lastOpened = Date.now();
      if (attach && (await attach({ ws: `ws://localhost:${boundPort}/bridge`, token }))) {
        viewerPlace = "desktop";
        log("the desktop app is the viewer");
      } else {
        viewerPlace = "browser";
        log(`opening the viewer: ${viewerUrl()}`);
        open(viewerUrl());
      }
    }
    if (viewer?.readyState === 1) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        viewerWaiters = viewerWaiters.filter((w) => w !== done);
        reject(new Error(`The viewer did not connect within ${VIEWER_WAIT_MS / 1000}s. Ask the person to open ${viewerUrl()} in a browser, then try again.`));
      }, VIEWER_WAIT_MS);
      const done = () => {
        clearTimeout(timer);
        resolve(undefined);
      };
      viewerWaiters.push(done);
    });
  }

  async function call(name, input) {
    await ensureViewer();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, name, socket: viewer });
      send({ type: "call", id, name, input });
    });
  }

  function onViewerMessage(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message?.type === "hub_request") {
      // Only the authenticated viewer gets here; the hub token goes to it alone.
      const reply = (body) => send({ type: "hub", id: message.id, ...body });
      if (!hub) reply({ error: "This bridge runs without the runtime hub." });
      else hub(appOrigin()).then((access) => reply(access), (err) => reply({ error: `The runtime hub could not start: ${err instanceof Error ? err.message : err}` }));
      return;
    }
    if (message?.type !== "result") return;
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    p.resolve(message.output);
  }

  function onViewerClosed(socket) {
    if (viewer === socket) {
      viewer = null;
      log("viewer disconnected");
    }
    // Including a tab replaced by a newer one: its calls will never be answered.
    for (const [id, p] of pending) {
      if (p.socket !== socket) continue;
      p.reject(new Error(`The viewer was closed while running ${p.name}. Call viewer_open to reopen it.`));
      pending.delete(id);
    }
  }

  function tokenMatches(candidate) {
    const a = Buffer.from(String(candidate ?? ""));
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // --- HTTP: the studio's static files, and the viewer's WebSocket ---

  const http = createServer((req, res) => {
    if (!allowedHosts().has(req.headers.host ?? "")) {
      // Guards against DNS rebinding: only our own host names reach the bridge.
      res.writeHead(403).end("forbidden host");
      return;
    }
    let rel;
    try {
      rel = normalize(decodeURIComponent(new URL(req.url ?? "/", appOrigin()).pathname)).replace(/^([/\\])+/, "");
    } catch {
      res.writeHead(400).end("bad path");
      return;
    }
    const file = join(studioDir, rel || "index.html");
    if (!file.startsWith(studioDir + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const type = MIME[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": type.startsWith("text/html") ? "no-store" : "public, max-age=3600" });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  http.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", appOrigin());
    // Only the studio page or the desktop app (not the scene iframe on 127.0.0.1, not other sites) may connect.
    if (url.pathname !== "/bridge" || !allowedOrigins().has(req.headers.origin ?? "") || !allowedHosts().has(req.headers.host ?? "")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const helloTimer = setTimeout(() => ws.close(4001, "no hello"), HELLO_TIMEOUT_MS);
      ws.once("message", (raw) => {
        clearTimeout(helloTimer);
        let hello;
        try {
          hello = JSON.parse(String(raw));
        } catch {
          hello = null;
        }
        if (hello?.type !== "hello" || !tokenMatches(hello.token)) {
          ws.close(4003, "bad token");
          return;
        }
        if (viewer && viewer !== ws) {
          viewer.send(JSON.stringify({ type: "replaced" }));
          viewer.close(4000, "replaced");
        }
        viewer = ws;
        log("viewer connected");
        ws.on("message", onViewerMessage);
        ws.on("close", () => onViewerClosed(ws));
        send({ type: "client", name: clientName() });
        const waiters = viewerWaiters;
        viewerWaiters = [];
        waiters.forEach((w) => w());
      });
    });
  });

  async function listen() {
    const tryPort = (p) =>
      new Promise((resolve, reject) => {
        const onError = (err) => {
          http.off("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          http.off("error", onError);
          resolve(undefined);
        };
        http.once("error", onError);
        http.once("listening", onListening);
        http.listen(p, "127.0.0.1");
      });
    try {
      await tryPort(port);
    } catch (err) {
      if (err?.code !== "EADDRINUSE") throw err;
      // Another bridge (a second agent session) has the usual port. Projects are
      // stored per origin, so this viewer won't see that one's projects.
      log(`port ${port} is busy; using a random port (projects saved on port ${port} won't show here)`);
      await tryPort(0);
    }
    boundPort = /** @type {import("node:net").AddressInfo} */ (http.address()).port;
    log(`serving ${studioDir} at ${appOrigin()}`);
    return { url: appOrigin() };
  }

  async function close() {
    for (const p of pending.values()) p.reject(new Error("The agent session ended."));
    pending.clear();
    calls.clear();
    // 4004: the agent session ended; the viewer stops retrying (the desktop app returns to its chat).
    viewer?.close(4004, "session ended");
    wss.close();
    await new Promise((resolve) => http.close(() => resolve(undefined)));
    await mcp.close().catch(() => undefined);
  }

  return {
    mcp,
    openViewer: () => ensureViewer(),
    listen,
    close,
    get url() {
      return appOrigin();
    },
    /** For tests: the URL the bridge would open, token included. */
    viewerUrl,
    get viewerConnected() {
      return viewer?.readyState === 1;
    },
  };
}
