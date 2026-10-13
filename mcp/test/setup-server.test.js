import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { checkServer } from "../src/setup.js";

for (const autoOpen of [false, true]) it(`real server: ${autoOpen ? "opens automatically without a tool call" : "setup verifies viewer handshake"}`, { skip: process.platform === "win32", timeout: 45_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "siljangnim-setup-"));
  const opener = join(dir, "open-viewer.mjs");
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>setup test</title>");
  // Stand in for the browser; the real bridge still enforces origin and token.
  writeFileSync(opener, `#!/usr/bin/env node
import WebSocket from ${JSON.stringify(import.meta.resolve("ws"))};
const url = new URL(process.argv[2]);
const ws = new WebSocket('ws://' + url.host + '/bridge', { headers: { origin: url.origin } });
ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token: url.hash.slice(8) })));
ws.on('close', () => process.exit(0));
ws.on('error', () => process.exit(1));
setTimeout(() => process.exit(1), 40000).unref();
`);
  chmodSync(opener, 0o755);
  const logs = [];
  try {
    if (autoOpen) {
      const client = new Client({ name: "setup-auto-open-test", version: "1" });
      const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../bin/siljangnim-mcp.js", import.meta.url))],
        env: { ...process.env, SILJANGNIM_STUDIO_DIR: dir, SILJANGNIM_OPEN_COMMAND: opener, SILJANGNIM_OPEN_ON_CONNECT: "1", SILJANGNIM_OPEN: "1", SILJANGNIM_VIEWER: "browser" }, stderr: "pipe" });
      let output = "";
      transport.stderr.on("data", (chunk) => { output += chunk; });
      try {
        await client.connect(transport);
        for (let i = 0; i < 100 && !output.includes("viewer connected"); i++) await new Promise((resolve) => setTimeout(resolve, 100));
        assert.match(output, /viewer connected/);
      } finally { await client.close(); await transport.close(); }
      return;
    }
    await checkServer((line) => logs.push(line), { ...process.env, SILJANGNIM_STUDIO_DIR: dir, SILJANGNIM_OPEN_COMMAND: opener });
    assert.ok(logs.some((line) => line.includes("tool list verified")));
    assert.ok(logs.some((line) => line.includes("viewer connected successfully")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
