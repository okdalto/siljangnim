// Launches the staged app (or the packaged one via SILJANGNIM_APP_PATH), waits
// for the renderer and the hub, and writes release/smoke/{window.png,report.json}.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.SILJANGNIM_SMOKE_OUT || join(desktopDir, "release", "smoke");
const appBinary = process.env.SILJANGNIM_APP_PATH ? resolve(process.env.SILJANGNIM_APP_PATH) : null;

const cmd = appBinary || electronPath;
const args = appBinary ? [] : [desktopDir];
// Headless Linux (CI/containers) has no GPU: use SwiftShader so WebGL still works.
const extra = process.platform === "linux" ? ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];
const result = spawnSync(cmd, [...args, ...extra], {
  env: { ...process.env, SILJANGNIM_SMOKE_OUT: outDir },
  stdio: "inherit",
});

try {
  console.log(readFileSync(join(outDir, "report.json"), "utf8"));
} catch {
  console.error("[smoke] no report written");
}
process.exit(result.status ?? 1);
