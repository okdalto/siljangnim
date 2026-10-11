// Runs the hub's Python tests with the bundled uv (no system Python needed).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = join(desktopDir, "vendor", "bin", process.platform === "win32" ? "uv.exe" : "uv");
const uv = existsSync(bundled) ? bundled : "uv";
const result = spawnSync(uv, ["run", "--frozen", "--project", join(desktopDir, "..", "hub"), "pytest", "-q"], {
  cwd: join(desktopDir, "..", "hub"),
  stdio: "inherit",
  // The runtime tests create venvs with the same uv.
  env: { ...process.env, SILJANGNIM_UV: existsSync(bundled) ? bundled : process.env.SILJANGNIM_UV },
});
process.exit(result.status ?? 1);
