// Lets an agent's MCP bridge (siljangnim-mcp) use this running app as its
// viewer instead of opening a browser tab (docs/mcp.md#데스크톱-앱에-붙기).
//
// The app listens on 127.0.0.1 with a per-launch token and writes both to a
// discovery file only this user can read:
//
//   ~/.siljangnim/desktop.json   {"port", "token", "pid", "version"}
//
// The bridge POSTs /connect {ws, token}: its WebSocket address and its own
// token. The app UI then connects to the bridge exactly as the browser viewer
// does, and the agent's tools act on the open project.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MAX_BODY = 4096;

export function discoveryFile() {
  return process.env.SILJANGNIM_DESKTOP_FILE || join(homedir(), ".siljangnim", "desktop.json");
}

/**
 * @param {{ version: string, onConnect: (request: { ws: string, token: string, embedded?: string }) => boolean, log?: (m: string) => void }} options
 *   onConnect hands the bridge to the UI; false when there is no window to take it
 */
export async function startAttachServer({ version, onConnect, log = () => undefined }) {
  const token = randomBytes(24).toString("base64url");
  const file = discoveryFile();
  const server = createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    // Browsers can't add the token header to a simple cross-site request, and any Origin means a page sent it.
    if (req.method !== "POST" || req.url !== "/connect" || req.headers.origin) return reply(404, { error: "not found" });
    const supplied = Buffer.from(String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: "unauthorized" });
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on("end", () => {
      let request;
      try {
        request = JSON.parse(body);
      } catch {
        return reply(400, { error: "bad json" });
      }
      // Only a bridge on this machine.
      if (typeof request?.ws !== "string" || !/^ws:\/\/(localhost|127\.0\.0\.1):\d+\/bridge$/.test(request.ws) || typeof request.token !== "string" || !request.token) {
        return reply(400, { error: "ws must be ws://localhost:<port>/bridge, with the bridge token" });
      }
      const embedded = typeof request.embedded === "string" && request.embedded.length <= 128 ? request.embedded : undefined;
      const taken = onConnect({ ws: request.ws, token: request.token, ...(embedded ? { embedded } : {}) });
      log(`bridge ${request.ws} ${taken ? "attached" : "refused (no window)"}`);
      reply(taken ? 200 : 503, taken ? { ok: true } : { error: "the app has no window open" });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ port, token, pid: process.pid, version }), { mode: 0o600 });
  log(`attach server on 127.0.0.1:${port} (${file})`);
  return {
    port,
    close() {
      server.close();
      // Another instance may have written its own file since; leave that one.
      try {
        if (JSON.parse(readFileSync(file, "utf8")).pid === process.pid) rmSync(file, { force: true });
      } catch {
        // already gone
      }
    },
  };
}
