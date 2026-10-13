// Stands in for Claude Code in the smoke test (SILJANGNIM_CLAUDE_PATH): answers `--version` and
// `auth status`, and for a run speaks Claude Code's stream-json while really launching the MCP server from
// --mcp-config and calling scene_write through it, as the real CLI would.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

if (args[0] === "--version") {
  console.log("0.0.0 (mock Claude Code)");
  process.exit(0);
}
if (args[0] === "auth") {
  console.log(JSON.stringify({ loggedIn: true, authMethod: "mock" }));
  process.exit(0);
}

const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const resumed = flag("--resume");
const server = JSON.parse(flag("--mcp-config")).mcpServers.siljangnim;
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "mcp", "package.json"));
const { Client } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
const { StdioClientTransport } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href);

const session = resumed ?? "mock-session-1";
out({ type: "system", subtype: "init", session_id: session });
const client = new Client({ name: "claude-code", version: "mock" });
await client.connect(new StdioClientTransport({ command: server.command, args: server.args, env: { ...process.env, ...server.env }, stderr: "ignore" }));

const input = {
  scene: {
    version: 2,
    script: { setup: "", render: 'ctx.gl.clearColor(0.9, 0.5, 0.1, 1); ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT); ctx.publish("local", 1);' },
  },
};
out({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_mock1", name: "mcp__siljangnim__scene_write", input }] }, session_id: session });
const result = await client.callTool({ name: "scene_write", arguments: input }, undefined, { timeout: 60_000 });
out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_mock1", content: result.content, is_error: Boolean(result.isError) }] }, session_id: session });
await client.close();

const reply = `Painted it orange (mock${resumed ? `, resumed ${resumed}` : ""}; asked: ${prompt.trim().split("\n").pop()}).`;
for (const piece of reply.match(/.{1,12}/g)) {
  out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } }, session_id: session });
}
out({ type: "assistant", message: { content: [{ type: "text", text: reply }] }, session_id: session });
out({ type: "result", subtype: "success", is_error: false, result: reply, session_id: session });
