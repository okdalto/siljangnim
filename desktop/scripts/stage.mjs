// Builds the studio and stages everything the packaged app needs under
// desktop/stage/: renderer/ (app + scene runtime), server/llmForward.js, hub/.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(desktopDir, "..");
const studioDir = join(repoRoot, "studio");
const stageDir = join(desktopDir, "stage");

const bin = (pkg, file) => join(studioDir, "node_modules", pkg, file);

console.log("[stage] typechecking and building studio");
execFileSync(process.execPath, [bin("typescript", "bin/tsc"), "-b"], { cwd: studioDir, stdio: "inherit" });
execFileSync(process.execPath, [bin("vite", "bin/vite.js"), "build"], { cwd: studioDir, stdio: "inherit" });

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(join(stageDir, "server"), { recursive: true });
cpSync(join(studioDir, "dist"), join(stageDir, "renderer"), { recursive: true });
cpSync(join(studioDir, "server", "llmForward.js"), join(stageDir, "server", "llmForward.js"));

const hubSrc = join(repoRoot, "hub");
const hubDst = join(stageDir, "hub");
for (const entry of ["pyproject.toml", "uv.lock", ".python-version", "siljangnim_hub"]) {
  cpSync(join(hubSrc, entry), join(hubDst, entry), {
    recursive: true,
    filter: (src) => !src.includes("__pycache__"),
  });
}
console.log(`[stage] staged into ${stageDir}`);
