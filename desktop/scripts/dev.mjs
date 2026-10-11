// Dev loop: Vite dev server (browser mode, hot reload) + Electron pointed at it.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = join(desktopDir, "..", "frontend");
const PORT = 5173;
const DEV_URL = `http://localhost:${PORT}`;

const vercel = JSON.parse(readFileSync(join(frontendDir, "vercel.json"), "utf8"));
const vite = spawn(
  process.execPath,
  [join(frontendDir, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: frontendDir, env: { ...process.env, ...vercel.build.env }, stdio: "inherit" },
);

let electron = null;
function shutdown(code = 0) {
  electron?.kill();
  vite.kill();
  process.exit(code);
}
vite.on("exit", (code) => {
  if (code) console.error(`[dev] vite exited with code ${code}`);
  shutdown(code ?? 0);
});
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

async function waitForVite() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(DEV_URL)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite did not start on ${DEV_URL}`);
}

await waitForVite();
electron = spawn(electronPath, [desktopDir], {
  env: { ...process.env, SILJANGNIM_DEV_URL: DEV_URL },
  stdio: "inherit",
});
electron.on("exit", (code) => shutdown(code ?? 0));
