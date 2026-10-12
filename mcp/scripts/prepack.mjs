// Runs before `npm pack` / `npm publish`: puts what the bridge needs outside its own folder into the
// package, so `npx siljangnim-mcp` works without the repo: the built studio (./studio) and the hub's
// source (./hub; uv installs Python and its locked dependencies on first use).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(mcpDir, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

execFileSync(npm, ["--prefix", join(repo, "studio"), "run", "build"], { stdio: "inherit" });
rmSync(join(mcpDir, "studio"), { recursive: true, force: true });
cpSync(join(repo, "studio", "dist"), join(mcpDir, "studio"), { recursive: true });

rmSync(join(mcpDir, "hub"), { recursive: true, force: true });
for (const name of ["pyproject.toml", "uv.lock", ".python-version", "siljangnim_hub"]) {
  const from = join(repo, "hub", name);
  if (!existsSync(from)) throw new Error(`hub/${name} is missing`);
  cpSync(from, join(mcpDir, "hub", name), { recursive: true, filter: (p) => !p.includes("__pycache__") });
}
// The license and the third-party notices travel with the package.
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) cpSync(join(repo, name), join(mcpDir, name));
console.log("[prepack] studio build, hub source, license and notices copied into the package");
