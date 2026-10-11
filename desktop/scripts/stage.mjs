// Builds the renderer (browser mode) and stages everything the packaged app
// needs under desktop/stage/: renderer/, proxy/proxy.js, hub/.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(desktopDir, "..");
const frontendDir = join(repoRoot, "frontend");
const stageDir = join(desktopDir, "stage");

// Reuse the web build's env (VITE_MODE, GitHub client id) so both builds match.
const vercel = JSON.parse(readFileSync(join(frontendDir, "vercel.json"), "utf8"));
const buildEnv = { ...process.env, ...vercel.build.env };

console.log("[stage] building renderer");
execFileSync(process.execPath, [join(frontendDir, "node_modules", "vite", "bin", "vite.js"), "build"], {
  cwd: frontendDir,
  env: buildEnv,
  stdio: "inherit",
});

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(join(stageDir, "proxy"), { recursive: true });
cpSync(join(frontendDir, "dist"), join(stageDir, "renderer"), { recursive: true });
cpSync(join(frontendDir, "api", "proxy.js"), join(stageDir, "proxy", "proxy.js"));

const hubSrc = join(repoRoot, "hub");
const hubDst = join(stageDir, "hub");
for (const entry of ["pyproject.toml", "uv.lock", ".python-version", "siljangnim_hub"]) {
  cpSync(join(hubSrc, entry), join(hubDst, entry), {
    recursive: true,
    filter: (src) => !src.includes("__pycache__"),
  });
}
console.log(`[stage] staged into ${stageDir}`);
