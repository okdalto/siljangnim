import assert from "node:assert/strict";
import { it } from "node:test";
import { setupCodex } from "../src/setup.js";

function fixture() {
  const calls = [];
  const logs = [];
  let checks = 0;
  const config = { enabled: true, transport: { command: "npx", args: ["-y", "siljangnim-mcp@latest"], env: { SILJANGNIM_OPEN_ON_CONNECT: "1" } } };
  return {
    calls, logs, config, checks: () => checks,
    options: {
      nodeVersion: "22.0.0",
      log: (message) => logs.push(message),
      run: async (command, args) => {
        assert.equal(command, "codex");
        calls.push(args);
        return { stdout: args.includes("get") ? JSON.stringify(config) : "ok" };
      },
      check: async () => { checks++; },
    },
  };
}

it("registers automatic opening, verifies registration, checks the viewer and explains restart", async () => {
  const f = fixture();
  await setupCodex(f.options);
  assert.deepEqual(f.calls[1], ["mcp", "add", "siljangnim", "--env", "SILJANGNIM_OPEN_ON_CONNECT=1", "--", "npx", "-y", "siljangnim-mcp@latest"]);
  assert.equal(f.checks(), 1);
  assert.match(f.logs.at(-1), /restart Codex/);
  assert.match(f.logs.at(-1), /did not connect/);
  await setupCodex(f.options);
  assert.equal(f.checks(), 2);
});

it("rejects unsupported Node before changing configuration", async () => {
  const f = fixture();
  await assert.rejects(setupCodex({ ...f.options, nodeVersion: "20.0.0" }), /Node.js 22/);
  assert.equal(f.calls.length, 0);
});

it("explains missing Codex without claiming installation succeeded", async () => {
  const f = fixture();
  await assert.rejects(setupCodex({ ...f.options, run: async () => { throw new Error("ENOENT"); } }), /Codex CLI could not run/);
  assert.equal(f.checks(), 0);
});

it("reports permission failure with a normal-terminal command", async () => {
  const f = fixture();
  await assert.rejects(setupCodex({ ...f.options, run: async (_, args) => {
    if (args.includes("add")) throw new Error("EACCES");
    return { stdout: "ok" };
  } }), /outside the agent sandbox/);
  assert.equal(f.checks(), 0);
  assert.ok(!f.logs.some((line) => line.startsWith("Setup verified")));
});

it("does not claim success if the registration was disabled or was not written", async () => {
  const f = fixture();
  f.config.enabled = false;
  await assert.rejects(setupCodex(f.options), /expected enabled/);
  assert.equal(f.checks(), 0);
});

it("distinguishes a saved registration from a failed viewer check", async () => {
  const f = fixture();
  await assert.rejects(setupCodex({ ...f.options, check: async () => { throw new Error("viewer did not connect"); } }), /is registered, but the connection\/viewer check failed/);
  assert.ok(!f.logs.some((line) => line.startsWith("Setup verified")));
});
