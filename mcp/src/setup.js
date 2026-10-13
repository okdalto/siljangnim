import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const exec = promisify(execFile);
const PACKAGE = "siljangnim-mcp@latest";
const AUTO_OPEN = "SILJANGNIM_OPEN_ON_CONNECT";

/** A real handshake and viewer check, without borrowing the current Codex session. */
export async function checkServer(log, env = process.env) {
  const client = new Client({ name: "siljangnim-setup", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../bin/siljangnim-mcp.js", import.meta.url))],
    env: { ...env, SILJANGNIM_OPEN_ON_CONNECT: "0", SILJANGNIM_OPEN: "1", SILJANGNIM_VIEWER: "browser" },
    stderr: "pipe",
  });
  // Forward the fallback browser URL, never silently claim a viewer connected.
  transport.stderr.on("data", (chunk) => process.stderr.write(chunk));
  try {
    await client.connect(transport, { timeout: 30_000 });
    const { tools } = await client.listTools({}, { timeout: 30_000 });
    for (const name of ["viewer_open", "scene_write", "viewer_call_status"]) {
      if (!tools.some((tool) => tool.name === name)) throw new Error(`Server is missing ${name}.`);
    }
    log("MCP handshake and tool list verified. Opening the test viewer…");
    const result = await client.callTool({ name: "viewer_open", arguments: {} }, undefined, { timeout: 40_000 });
    if (result.isError) throw new Error(result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"));
    log("Test viewer connected successfully.");
  } finally {
    await client.close();
    await transport.close();
  }
}

/** Use Codex's own config writer; never rewrite TOML or touch other MCP entries. */
export async function setupCodex({ run = exec, check = checkServer, log = console.log, nodeVersion = process.versions.node, env = process.env } = {}) {
  if (Number(nodeVersion.split(".")[0]) < 22) throw new Error("Node.js 22 or newer is required. Update Node.js, then run setup again.");
  const invoke = (args) => run("codex", args, { env, timeout: 30_000, maxBuffer: 1024 * 1024 });
  try {
    await invoke(["--version"]);
  } catch {
    throw new Error("Codex CLI could not run. Install it and check `codex --version` in your normal terminal, then retry setup.");
  }
  log("Registering Siljangnim with Codex…");
  try {
    await invoke(["mcp", "add", "siljangnim", "--env", `${AUTO_OPEN}=1`, "--", "npx", "-y", PACKAGE]);
  } catch (error) {
    throw new Error(`Registration failed; installation is not confirmed. Run this command in your normal terminal (outside the agent sandbox): npx -y ${PACKAGE} setup codex\n${error.stderr || error.message}`);
  }
  const { stdout } = await invoke(["mcp", "get", "siljangnim", "--json"]);
  const config = JSON.parse(stdout);
  if (!config.enabled || config.transport?.command !== "npx" ||
      JSON.stringify(config.transport?.args) !== JSON.stringify(["-y", PACKAGE]) ||
      config.transport?.env?.[AUTO_OPEN] !== "1") {
    throw new Error("Codex did not report the expected enabled Siljangnim registration. Inspect `codex mcp get siljangnim --json` before retrying.");
  }
  log("Registration verified. No manual config.toml edit is needed.");
  try {
    await check(log, env);
  } catch (error) {
    throw new Error(`Siljangnim is registered, but the connection/viewer check failed: ${error.message}\nFix the reported problem and rerun setup. Registration is safe to repeat.`);
  }
  log("Setup verified. The temporary test session has now closed; you can close its browser tab.");
  log("Fully quit and restart Codex. Its Siljangnim server will open a new viewer automatically. This check did not connect your currently running Codex conversation.");
}
