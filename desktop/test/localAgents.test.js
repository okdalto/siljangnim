import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeParser, codexParser, commandLine, findExecutable } from "../src/localAgents.js";

const collect = (make, lines) => {
  const events = [];
  const parse = make((e) => events.push(e));
  for (const line of lines) parse(typeof line === "string" ? line : JSON.stringify(line));
  return events;
};

test("Claude Code's stream becomes text, tool calls with our tool names, results and the session id", () => {
  const events = collect(claudeParser, [
    { type: "system", subtype: "init", session_id: "s1" },
    { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } } },
    { type: "stream_event", parent_tool_use_id: "t0", event: { type: "content_block_delta", delta: { type: "text_delta", text: "sub-agent" } } },
    { type: "assistant", message: { content: [{ type: "thinking", thinking: "…" }, { type: "text", text: "Hi" }, { type: "tool_use", id: "t1", name: "mcp__siljangnim__scene_write", input: { a: 1 } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "ok" }, { type: "image" }] }] } },
    "not json",
    { type: "result", is_error: false, session_id: "s1" },
  ]);
  assert.deepEqual(events, [
    { type: "session", id: "s1" },
    { type: "text", delta: "Hi" },
    { type: "assistant", content: [{ type: "text", text: "Hi" }, { type: "tool_use", id: "t1", name: "scene_write", input: { a: 1 } }] },
    { type: "tool_result", id: "t1", isError: false, text: "ok\n[image]" },
    { type: "session", id: "s1" },
  ]);
});

test("a signed-out Claude Code is reported once, as an auth error", () => {
  const events = collect(claudeParser, [
    { type: "assistant", error: "authentication_failed", is_api_error_message: true, message: { content: [{ type: "text", text: "Failed to authenticate" }] } },
    { type: "result", is_error: true, result: "Failed to authenticate" },
  ]);
  assert.deepEqual(events, [{ type: "error", message: "Failed to authenticate", auth: true }]);
});

test("Codex's exec events map to the same shape", () => {
  const events = collect(codexParser, [
    { type: "thread.started", thread_id: "th" },
    { type: "item.completed", item: { id: "i0", type: "error", message: "Model metadata not found" } },
    { type: "item.started", item: { id: "i1", type: "mcp_tool_call", server: "siljangnim", tool: "scene_read", arguments: {} } },
    { type: "item.completed", item: { id: "i1", type: "mcp_tool_call", status: "completed", result: { content: [{ type: "text", text: "scene" }] } } },
    { type: "item.completed", item: { id: "i2", type: "agent_message", text: "Done" } },
    { type: "turn.failed", error: { message: JSON.stringify({ error: { message: "401 Unauthorized" } }) } },
  ]);
  assert.deepEqual(events, [
    { type: "session", id: "th" },
    { type: "assistant", content: [{ type: "tool_use", id: "i1", name: "scene_read", input: {} }] },
    { type: "tool_result", id: "i1", isError: false, text: "scene" },
    { type: "assistant", content: [{ type: "text", text: "Done" }] },
    { type: "error", message: "401 Unauthorized", auth: true },
  ]);
});

test("command lines give the CLI only our MCP server and resume the session", () => {
  const mcp = { command: "/app/Siljangnim", args: ["/app/mcp/bin/siljangnim-mcp.js"], env: { ELECTRON_RUN_AS_NODE: "1", SILJANGNIM_EMBEDDED: "tok" } };
  const [, claude] = commandLine("claude-code", { path: "/bin/claude", sessionId: "s1", mcp });
  assert.ok(claude.includes("--strict-mcp-config"));
  assert.deepEqual(JSON.parse(claude[claude.indexOf("--mcp-config") + 1]).mcpServers.siljangnim, mcp);
  assert.match(claude[claude.indexOf("--allowedTools") + 1], /^mcp__siljangnim,/);
  assert.deepEqual(claude.slice(-2), ["--resume", "s1"]);
  const [, fresh] = commandLine("codex", { path: "/bin/codex", sessionId: null, mcp });
  assert.equal(fresh[0], "exec");
  assert.ok(fresh.includes('mcp_servers.siljangnim.env={ ELECTRON_RUN_AS_NODE = "1", SILJANGNIM_EMBEDDED = "tok" }'));
  assert.ok(fresh.includes('sandbox_mode="read-only"'));
  const [, resumed] = commandLine("codex", { path: "/bin/codex", sessionId: "th", mcp });
  assert.deepEqual([resumed[0], resumed[1], ...resumed.slice(-2)], ["exec", "resume", "th", "-"]);
});

test("finds a CLI in the first directory that has it, with Windows extensions", () => {
  assert.equal(findExecutable(["claude"], ["/a", "/b"], "darwin", (p) => p === "/b/claude"), "/b/claude");
  assert.match(findExecutable(["codex"], ["C:\\npm"], "win32", (p) => p.endsWith("codex.cmd")), /codex\.cmd$/);
  assert.equal(findExecutable(["claude"], ["/a"], "darwin", () => false), null);
});
