import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import WebSocket from "ws";
import { createBridge } from "../src/bridge.js";
import { toMcpResult } from "../src/content.js";

const spec = {
  instructions: "test instructions",
  tools: [
    { name: "scene_read", description: "read", inputSchema: { type: "object", properties: {} }, readOnly: true },
    { name: "viewport_capture", description: "capture", inputSchema: { type: "object", properties: {} }, readOnly: true },
  ],
};

function studioDir() {
  const dir = mkdtempSync(join(tmpdir(), "siljangnim-mcp-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>studio</title>");
  writeFileSync(join(dir, "app.js"), "console.log(1)");
  return dir;
}

/** A stand-in for the studio page: answers calls with `reply`. */
function fakeViewer(bridge, { token, origin, reply = () => ({ content: "ok" }) } = {}) {
  const url = new URL(bridge.viewerUrl());
  const ws = new WebSocket(`ws://localhost:${url.port}/bridge`, { headers: { origin: origin ?? url.origin } });
  const calls = [];
  const closed = new Promise((resolve) => ws.on("close", (code) => resolve(code)));
  const ready = new Promise((resolve, reject) => {
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token: token ?? url.hash.slice("#bridge=".length) })));
    ws.on("message", async (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "client") resolve(message.name);
      if (message.type === "call") {
        calls.push(message);
        const output = await reply(message);
        if (output !== undefined) ws.send(JSON.stringify({ type: "result", id: message.id, output }));
      }
    });
  });
  return { ws, calls, ready, closed };
}

async function connectClient(bridge) {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([bridge.mcp.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("toMcpResult", () => {
  it("maps text and base64 images, and keeps errors", () => {
    assert.deepEqual(toMcpResult({ content: "hi" }), { content: [{ type: "text", text: "hi" }] });
    assert.deepEqual(
      toMcpResult({
        isError: true,
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
          { type: "text", text: "state=running" },
        ],
      }),
      {
        isError: true,
        content: [
          { type: "image", data: "AAA", mimeType: "image/png" },
          { type: "text", text: "state=running" },
        ],
      },
    );
    assert.deepEqual(toMcpResult(null), { content: [{ type: "text", text: "(no output)" }] });
  });
});

describe("bridge", () => {
  let bridge;
  let client;
  const opened = [];

  before(async () => {
    bridge = createBridge({ studioDir: studioDir(), spec, port: 0, open: (url) => opened.push(url) });
    await bridge.listen();
    client = await connectClient(bridge);
  });
  after(async () => {
    await client.close();
    await bridge.close();
  });

  it("lists the studio tools plus viewer_open, with the instructions", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      ["scene_read", "viewport_capture", "viewer_open"],
    );
    assert.equal(tools[0].annotations.readOnlyHint, true);
    assert.equal(client.getInstructions(), "test instructions");
  });

  it("serves the studio and refuses traversal and foreign hosts", async () => {
    const page = await fetch(`${bridge.url}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>studio<\/title>/);
    assert.equal((await fetch(`${bridge.url}/app.js`)).headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal((await fetch(`${bridge.url}/..%2F..%2Fetc%2Fpasswd`)).status, 404);
    // fetch() can't set Host; a DNS-rebinding page would arrive with its own host name.
    const port = Number(new URL(bridge.url).port);
    const status = await new Promise((resolve, reject) => {
      request({ host: "127.0.0.1", port, path: "/", headers: { host: `evil.example:${port}` } }, (res) => resolve(res.statusCode))
        .on("error", reject)
        .end();
    });
    assert.equal(status, 403);
  });

  it("rejects a viewer with the wrong token or origin", async () => {
    const wrongToken = fakeViewer(bridge, { token: "nope" });
    assert.equal(await wrongToken.closed, 4003);
    const sceneOrigin = fakeViewer(bridge, { origin: `http://127.0.0.1:${new URL(bridge.url).port}` });
    await assert.rejects(sceneOrigin.ready);
    assert.equal(bridge.viewerConnected, false);
  });

  it("opens the viewer on the first call, relays it and returns the viewer's output", async () => {
    let viewer;
    const result = client.callTool({ name: "viewport_capture", arguments: { max_size: 256 } });
    // The bridge asked to open the page; "the browser" loads it now.
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(opened.length, 1);
    assert.match(opened[0], /^http:\/\/localhost:\d+\/#bridge=[\w-]+$/);
    viewer = fakeViewer(bridge, {
      reply: () => ({ content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw==" } }] }),
    });
    assert.equal(await viewer.ready, "test-client");
    const { content, isError } = await result;
    assert.equal(isError, undefined);
    assert.deepEqual(content, [{ type: "image", data: "iVBORw==", mimeType: "image/png" }]);
    assert.deepEqual(viewer.calls.map((c) => [c.name, c.input]), [["viewport_capture", { max_size: 256 }]]);
    viewer.ws.close();
    await viewer.closed;
  });

  it("fails calls in flight when the viewer closes, and hands over to a newer tab", async () => {
    const first = fakeViewer(bridge, { reply: () => undefined });
    await first.ready;
    const result = client.callTool({ name: "scene_read", arguments: {} });
    await new Promise((r) => setTimeout(r, 50));
    const second = fakeViewer(bridge);
    await second.ready;
    assert.equal(await first.closed, 4000);
    const { isError, content } = await result;
    assert.equal(isError, true);
    assert.match(content[0].text, /closed while running scene_read/);
    assert.deepEqual((await client.callTool({ name: "scene_read", arguments: {} })).content, [{ type: "text", text: "ok" }]);
    second.ws.close();
    await second.closed;
  });

  it("explains unknown tools", async () => {
    const { isError, content } = await client.callTool({ name: "nope", arguments: {} });
    assert.equal(isError, true);
    assert.match(content[0].text, /Unknown tool/);
  });
});

describe("bridge runtime hub", () => {
  it("hands the hub only to the authenticated viewer, starting it on request", async () => {
    let started = 0;
    const bridge = createBridge({
      studioDir: studioDir(),
      spec,
      port: 0,
      hub: async (origin) => {
        started++;
        assert.match(origin, /^http:\/\/localhost:\d+$/);
        return { url: "http://127.0.0.1:1234", token: "hub-token" };
      },
    });
    await bridge.listen();
    try {
      const viewer = fakeViewer(bridge);
      await viewer.ready;
      const reply = new Promise((resolve) => viewer.ws.on("message", (raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === "hub") resolve(message);
      }));
      viewer.ws.send(JSON.stringify({ type: "hub_request", id: 7 }));
      assert.deepEqual(await reply, { type: "hub", id: 7, url: "http://127.0.0.1:1234", token: "hub-token" });
      assert.equal(started, 1);
      viewer.ws.close();
      await viewer.closed;
    } finally {
      await bridge.close();
    }
  });

  it("explains when there is no hub", async () => {
    const bridge = createBridge({ studioDir: studioDir(), spec, port: 0 });
    await bridge.listen();
    try {
      const viewer = fakeViewer(bridge);
      await viewer.ready;
      const reply = new Promise((resolve) => viewer.ws.on("message", (raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === "hub") resolve(message);
      }));
      viewer.ws.send(JSON.stringify({ type: "hub_request", id: 1 }));
      assert.match((await reply).error, /without the runtime hub/);
      viewer.ws.close();
      await viewer.closed;
    } finally {
      await bridge.close();
    }
  });

  it("hands the viewer to a running desktop app before opening a browser", async () => {
    const opened = [];
    const attached = [];
    let accept = true;
    const bridge = createBridge({ studioDir: studioDir(), spec, port: 0, open: (url) => opened.push(url), attach: async (r) => (attached.push(r), accept) });
    await bridge.listen();
    const client = await connectClient(bridge);
    try {
      const result = client.callTool({ name: "viewer_open", arguments: {} });
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(opened.length, 0);
      assert.match(attached[0].ws, /^ws:\/\/localhost:\d+\/bridge$/);
      // The desktop UI connects from app://siljangnim with the token it was handed.
      const viewer = fakeViewer(bridge, { origin: "app://siljangnim", token: attached[0].token });
      await viewer.ready;
      assert.match((await result).content[0].text, /in the Siljangnim desktop app/);
      viewer.ws.close();
      await viewer.closed;
      // No app (or it declined): the browser tab opens as before.
      accept = false;
      const again = client.callTool({ name: "viewer_open", arguments: {} });
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(opened.length, 1);
      const browser = fakeViewer(bridge);
      await browser.ready;
      assert.match((await again).content[0].text, /^The viewer is open and connected: http:\/\/localhost:/);
      browser.ws.close();
      await browser.closed;
      // Other origins stay out even with the token.
      const other = fakeViewer(bridge, { origin: "https://evil.example", token: attached[0].token });
      await assert.rejects(other.ready);
    } finally {
      await client.close();
      await bridge.close();
    }
  });
});
