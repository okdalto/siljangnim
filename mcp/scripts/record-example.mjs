// Opens examples from the gallery in a viewer and records each with viewport_record
// (offline, frame by frame), for promo clips and previews. Needs a studio build that
// includes them (npm --prefix studio run build).
//   node mcp/scripts/record-example.mjs <out dir> <seconds> <width>x<height> <slug>...
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [outArg, secondsArg, sizeArg, ...slugs] = process.argv.slice(2);
const size = sizeArg?.match(/^(\d+)x(\d+)$/);
if (!outArg || !Number(secondsArg) || !size || !slugs.length) {
  console.error("usage: record-example.mjs <out dir> <seconds> <width>x<height> <slug>...");
  process.exit(2);
}
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = createRequire(join(mcpDir, "..", "desktop", "package.json"))("electron");
const scratch = mkdtempSync(join(tmpdir(), "siljangnim-record-"));
const downloads = join(scratch, "downloads");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let viewer = null;
process.on("exit", () => viewer?.kill("SIGKILL"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(mcpDir, "bin", "siljangnim-mcp.js")],
  env: { ...process.env, SILJANGNIM_OPEN: "0", SILJANGNIM_VIEWER: "browser", SILJANGNIM_PORT: process.env.SILJANGNIM_PORT || "47963" },
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
const client = new Client({ name: "record-example", version: "1" });
await client.connect(transport);
const text = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
try {
  await client.callTool({ name: "viewer_open", arguments: {} });
  for (const slug of slugs) {
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
    if (opened.value !== "opened") {
      console.log(`${slug}: couldn't open (${JSON.stringify(opened)})`);
      continue;
    }
    await wait(2500);
    const before = new Set(existsSync(downloads) ? readdirSync(downloads) : []);
    const result = await client.callTool(
      {
        name: "viewport_record",
        arguments: { format: "mp4", mode: "offline", duration: Number(secondsArg), fps: 30, width: Number(size[1]), height: Number(size[2]), quality: "very-high" },
      },
      undefined,
      { timeout: 600_000 },
    );
    let file = null;
    for (let i = 0; i < 100 && !file; i++) {
      file = existsSync(downloads) ? readdirSync(downloads).find((f) => !before.has(f) && f.endsWith(".mp4")) : null;
      if (!file) await wait(200);
    }
    if (file) copyFileSync(join(downloads, file), join(out, `${slug}.mp4`));
    console.log(`${slug}: ${file ? "saved" : "no file"} — ${text(result).split("\n")[0]}`);
  }
} finally {
  viewer?.kill("SIGTERM");
  await client.close();
}
