// Actual viewer button -> authenticated bridge -> queue adapter, with no real model turn.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBridge } from "../src/bridge.js";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "smoke-out", "handoff");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "commands"), { recursive: true });
const thread = "01234567-89ab-4def-8123-456789abcdef";
const sent = [];
const bridge = createBridge({ studioDir: join(root, "..", "studio", "dist"), spec: JSON.parse(readFileSync(join(root, "src", "spec.json"))), port: 0,
  queueMessage: async (id, text) => { sent.push({ id, text }); if (sent.length === 2) throw new Error("Delivery test failure"); },
});
await bridge.listen();
const client = new Client({ name: "codex", version: "smoke" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([bridge.mcp.connect(b), client.connect(a)]);
const electron = createRequire(join(root, "..", "desktop", "package.json"))("electron");
const child = spawn(electron, [join(root, "scripts", "viewer.cjs"), ...(process.platform === "linux" ? ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])], {
  env: { ...process.env, SILJANGNIM_VIEWER_URL: bridge.viewerUrl(), SILJANGNIM_SMOKE_OUT: out }, stdio: "ignore",
});
process.on("exit", () => child.kill("SIGKILL"));
const timeout = setTimeout(() => { console.error("[handoff-smoke] timeout"); process.exit(1); }, 90000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let sequence = 0;
async function ui(code) {
  const name = join(out, "commands", String(++sequence));
  writeFileSync(name + ".js", code);
  while (!existsSync(name + ".json")) await sleep(100);
  const result = JSON.parse(readFileSync(name + ".json"));
  assert.equal(result.ok, true, result.error);
  return result.value;
}
try {
  const opened = await client.callTool({ name: "viewer_open", arguments: { codex_thread_id: thread } });
  assert.ok(!opened.isError);
  const scene = { version: 2, script: { setup: "", render: "ctx.gl.clearColor(0.2,0.4,0.8,1);ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);" }, uniforms: {} };
  const written = await client.callTool({ name: "scene_write", arguments: { scene } });
  assert.ok(!written.isError);
  const click = `(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let n=0;n<100 && !document.querySelector('[data-move]');n++) await wait(100);
    const button = document.querySelector('[data-move]');
    if (!button) throw new Error('No suggestion card');
    button.click();
    for (let n=0;n<100;n++) {
      await wait(100);
      const text = document.body.innerText;
      if (text.includes('Queued') || text.includes('Delivery test failure')) return text;
    }
    throw new Error('No handoff result');
  })()`;
  const first = await ui(click);
  assert.match(first, /Queued/);
  assert.match(first, /send a message there immediately/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, thread);
  assert.ok(sent[0].text.length > 20);
  // Remove the prior notice, then exercise delivery failure on another suggestion.
  await ui(`document.querySelector('[data-testid="dismiss-notice"]')?.click()`);
  // Sending replaces the success notice synchronously; the next card is a separate request.
  const second = await ui(click);
  assert.match(second, /Delivery test failure/);
  assert.equal(sent.length, 2);
  writeFileSync(join(out, "report.json"), JSON.stringify({ ok: true, queued: true, failureVisible: true, messages: sent.length }, null, 2));
  console.log("[handoff-smoke] suggestion button delivery and failure feedback passed");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await client.close();
  await bridge.close();
  clearTimeout(timeout);
}
