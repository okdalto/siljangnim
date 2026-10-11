// Loads a scene.json into a viewer through the bridge and saves a capture,
// e.g. to make an example's thumbnail:
//   node mcp/scripts/capture-scene.mjs examples/gpu-particles/scene.json examples/gpu-particles/thumbnail.png
// Prints the runtime status (errors included). Uses the Electron from desktop/.
// SILJANGNIM_RECORD=mp4|webm|png also records 2 s of it and prints the result.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [scenePath, outPath, waitMs = "2500"] = process.argv.slice(2);
if (!scenePath || !outPath) {
  console.error("usage: capture-scene.mjs <scene.json> <out.png> [wait ms]");
  process.exit(2);
}
const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = createRequire(join(mcpDir, "..", "desktop", "package.json"))("electron");
const scratch = mkdtempSync(join(tmpdir(), "siljangnim-capture-"));
let viewer = null;
process.on("exit", () => viewer?.kill("SIGKILL"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(mcpDir, "bin", "siljangnim-mcp.js")],
  env: { ...process.env, SILJANGNIM_OPEN: "0", SILJANGNIM_PORT: "47961" },
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
const client = new Client({ name: "capture-scene", version: "1" });
await client.connect(transport);
try {
  const written = await client.callTool({ name: "scene_write", arguments: { scene: JSON.parse(readFileSync(resolve(scenePath), "utf8")) } });
  console.log(written.content.map((c) => c.text).join("\n"));
  await new Promise((r) => setTimeout(r, Number(waitMs)));
  const capture = await client.callTool({ name: "viewport_capture", arguments: { max_size: 512 } });
  const image = capture.content.find((c) => c.type === "image");
  console.log(capture.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"));
  if (image) writeFileSync(resolve(outPath), Buffer.from(image.data, "base64"));
  if (process.env.SILJANGNIM_RECORD) {
    const recorded = await client.callTool({ name: "viewport_record", arguments: { format: process.env.SILJANGNIM_RECORD, duration: 2, fps: 30, width: 640, height: 360 } });
    console.log(recorded.content.map((c) => c.text).join("\n"));
  }
} finally {
  viewer?.kill("SIGTERM");
  await client.close();
}
