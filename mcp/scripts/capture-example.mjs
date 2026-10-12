// Opens an example from the gallery (scene and assets, as a person would) in a
// viewer and saves its thumbnail; prints the runtime status. Needs a studio
// build that includes the example (npm --prefix studio run build).
//   node mcp/scripts/capture-example.mjs <slug> [wait ms]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [slug, waitMs = "3000"] = process.argv.slice(2);
if (!slug) {
  console.error("usage: capture-example.mjs <slug> [wait ms]");
  process.exit(2);
}
const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = createRequire(join(mcpDir, "..", "desktop", "package.json"))("electron");
const scratch = mkdtempSync(join(tmpdir(), "siljangnim-capture-"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let viewer = null;
process.on("exit", () => viewer?.kill("SIGKILL"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(mcpDir, "bin", "siljangnim-mcp.js")],
  env: { ...process.env, SILJANGNIM_OPEN: "0", SILJANGNIM_VIEWER: "browser", SILJANGNIM_PORT: process.env.SILJANGNIM_PORT || "47962" },
  stderr: "pipe",
});
transport.stderr.on("data", (chunk) => {
  const url = String(chunk).match(/opening the viewer: (\S+)/)?.[1];
  if (url && !viewer) {
    viewer = spawn(electronPath, [join(mcpDir, "scripts", "viewer.cjs")], {
      env: { ...process.env, SILJANGNIM_VIEWER_URL: url, SILJANGNIM_SMOKE_OUT: scratch },
      stdio: "ignore",
    });
  }
});
let serial = 0;
async function inPage(code) {
  const dir = join(scratch, "commands");
  mkdirSync(dir, { recursive: true });
  const name = `c${++serial}`;
  writeFileSync(join(dir, `${name}.js`), code);
  for (let i = 0; i < 200; i++) {
    if (existsSync(join(dir, `${name}.json`))) return JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
    await wait(100);
  }
  return { ok: false, error: "timed out" };
}
const client = new Client({ name: "capture-example", version: "1" });
await client.connect(transport);
const text = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
try {
  await client.callTool({ name: "viewer_open", arguments: {} });
  const opened = await inPage(`(async () => {
    document.querySelector('[title="Projects"]').click();
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('[data-testid="open-examples"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const card = document.querySelector('[data-example="${slug}"]');
    if (!card) return "no such example in this build";
    card.click();
    return "opened";
  })()`);
  if (opened.value !== "opened") throw new Error(`couldn't open ${slug}: ${JSON.stringify(opened)}`);
  await wait(1500);
  await wait(Number(waitMs));
  const capture = await client.callTool({ name: "viewport_capture", arguments: { max_size: 512 } });
  const image = capture.content.find((c) => c.type === "image");
  console.log(text(capture));
  if (image) writeFileSync(join(mcpDir, "..", "examples", slug, "thumbnail.png"), Buffer.from(image.data, "base64"));
} finally {
  viewer?.kill("SIGTERM");
  await client.close();
}
