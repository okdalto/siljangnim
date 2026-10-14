// Runs before `npm pack` / `npm publish`: puts what the bridge needs outside its own folder into the
// package, so `npx siljangnim-mcp` works without the repo: the built studio (./studio) and the hub's
// source (./hub; uv installs Python and its locked dependencies on first use). Example files are not
// packaged: the studio fetches them from the same commit on GitHub (see examplesBase.mjs).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { examplesBase } from "./examplesBase.mjs";

const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(mcpDir, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const sha = git("rev-parse", "HEAD");
const base = examplesBase({
  env: process.env.SILJANGNIM_EXAMPLES_BASE_URL,
  sha,
  dirty: git("status", "--porcelain", "--", "examples"),
});
if (base) {
  // A commit that is not on GitHub yet would leave every example unreachable.
  const probe = `${base}/${readdirSync(join(repo, "examples")).find((s) => existsSync(join(repo, "examples", s, "example.json")))}/example.json`;
  const response = await fetch(probe, { method: "HEAD" });
  if (!response.ok) throw new Error(`${probe} returned ${response.status}: push ${sha.slice(0, 7)} first, or set SILJANGNIM_EXAMPLES_BASE_URL=local`);
  console.log(`[prepack] examples load from ${base}`);
}
const env = { ...process.env };
if (base) env.SILJANGNIM_EXAMPLES_BASE_URL = base;
else delete env.SILJANGNIM_EXAMPLES_BASE_URL;
execFileSync(npm, ["--prefix", join(repo, "studio"), "run", "build"], { stdio: "inherit", env });
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
