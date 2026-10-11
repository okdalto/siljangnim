// Dev loop: the studio's Vite dev server (hot reload) + Electron pointed at it.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const studioDir = join(desktopDir, "..", "studio");
const PORT = 5173;
// The UI runs on localhost; the scene runtime on 127.0.0.1 (a separate origin).
const DEV_URL = `http://localhost:${PORT}`;

const vite = spawn(process.execPath, [join(studioDir, "node_modules", "vite", "bin", "vite.js")], {
  cwd: studioDir,
  stdio: "inherit",
});

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
      if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite did not start on port ${PORT}`);
}

await waitForVite();
electron = spawn(electronPath, [desktopDir], {
  env: { ...process.env, SILJANGNIM_DEV_URL: DEV_URL },
  stdio: "inherit",
});
electron.on("exit", (code) => shutdown(code ?? 0));
