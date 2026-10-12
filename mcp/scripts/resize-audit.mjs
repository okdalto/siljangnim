// Opens every example (or the ones named) in a viewer, lets it run, then squeezes the viewport to a
// portrait box without reloading, the way a window resize or full screen does, and reports scenes
// that error or go black afterwards. Needs a studio build that includes them.
//   node mcp/scripts/resize-audit.mjs [slug...]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const slugsArg = process.argv.slice(2);
const out = mkdtempSync(join(tmpdir(), "siljangnim-resize-"));
const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = createRequire(join(mcpDir, "..", "desktop", "package.json"))("electron");
const scratch = out;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let viewer = null;
process.on("exit", () => viewer?.kill("SIGKILL"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(mcpDir, "bin", "siljangnim-mcp.js")],
  env: { ...process.env, SILJANGNIM_OPEN: "0", SILJANGNIM_VIEWER: "browser", SILJANGNIM_PORT: process.env.SILJANGNIM_PORT || "47964" },
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
const client = new Client({ name: "resize-audit", version: "1" });
await client.connect(transport);
const text = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
const results = [];
try {
  await client.callTool({ name: "viewer_open", arguments: {} });
  // Every example folder except those that need a camera or WebGPU.
  const examplesDir = join(mcpDir, "..", "examples");
  const slugs = slugsArg.length
    ? slugsArg
    : readdirSync(examplesDir).filter((d) => {
        if (!existsSync(join(examplesDir, d, "example.json"))) return false;
        const requires = JSON.parse(readFileSync(join(examplesDir, d, "example.json"), "utf8")).requires ?? [];
        return !requires.includes("camera") && !requires.includes("webgpu");
      });
  for (const slug of slugs) {
    const opened = await inPage(`(async () => {
      document.querySelector('[title="Projects"]').click();
      await new Promise((r) => setTimeout(r, 200));
      document.querySelector('[data-testid="open-examples"]').click();
      await new Promise((r) => setTimeout(r, 300));
      const card = document.querySelector('[data-example="${slug}"]');
      if (!card) return "missing";
      card.click();
      return "opened";
    })()`);
    if (opened.value !== "opened") { results.push({ slug, error: "couldn't open" }); continue; }
    await wait(4000);
    // Squeeze the scene's box to portrait in place: same scene, new canvas size.
    await inPage(`(() => { const b = document.querySelector("[data-frame]"); const h = b.parentElement.clientHeight; Object.assign(b.style, { inset: "auto", left: "30%", top: "0px", width: Math.round(h * 9 / 16) + "px", height: h + "px" }); return true; })()`);
    await wait(2500);
    const status = text(await client.callTool({ name: "viewport_status", arguments: {} }));
    const capture = await client.callTool({ name: "viewport_capture", arguments: { max_size: 256 } });
    const image = capture.content.find((c) => c.type === "image");
    if (image) writeFileSync(join(out, `${slug}.png`), Buffer.from(image.data, "base64"));
    const errors = /No errors\./.test(status) ? 0 : (status.match(/error/gi) ?? []).length;
    results.push({ slug, errors, size: status.match(/size=(\d+x\d+)/)?.[1], status: errors ? status.slice(0, 400) : undefined });
    console.log(`${slug}: ${errors ? "ERRORS" : "ok"} ${status.match(/size=(\d+x\d+)/)?.[1] ?? ""}`);
    // Back to the normal box for the next example.
    await inPage(`(() => { const b = document.querySelector("[data-frame]"); b.removeAttribute("style"); return true; })()`);
  }
} finally {
  writeFileSync(join(out, "report.json"), JSON.stringify(results, null, 2));
  console.log(`report and captures: ${out}`);
  viewer?.kill("SIGTERM");
  await client.close();
}
