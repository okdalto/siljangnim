// Writes ../mcp/src/spec.json (MCP instructions + tool schemas) from the
// studio's tool definitions, so the MCP bridge can list tools before a
// viewer is open. Run after changing tools or the prompt.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({ root, configFile: false, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
try {
  const { mcpSpec } = await server.ssrLoadModule("/src/agent/external.ts");
  const out = join(root, "..", "mcp", "src", "spec.json");
  writeFileSync(out, JSON.stringify(mcpSpec(), null, 2) + "\n");
  console.log(`[export-mcp] wrote ${out}`);
} finally {
  await server.close();
}
