// `npm run dist`: stage, then build the installer. On macOS with the signing secrets set, the build is signed with
// the Developer ID and notarized (electron-builder.signed.yml); otherwise it stays ad-hoc signed as before.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
// CI passes the signing secrets as empty strings when they aren't set; electron-builder would read an empty
// CSC_LINK as a file path ("…/desktop not a file"), so drop empty ones.
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => !(/CSC_|^APPLE_/.test(k) && !v)));
const signMac = process.platform === "darwin" && Boolean(env.CSC_LINK && env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
const cli = createRequire(join(desktopDir, "package.json")).resolve("electron-builder/cli.js");
const args = ["--publish", "never", ...(signMac ? ["--config", "electron-builder.signed.yml"] : ["-c.mac.identity=-"])];
console.log(`[dist] ${signMac ? "signed and notarized" : process.platform === "win32" && env.WIN_CSC_LINK ? "signed" : "unsigned"} build`);
execFileSync(process.execPath, [cli, ...args], {
  cwd: desktopDir,
  stdio: "inherit",
  // Without a certificate, don't let electron-builder pick some other identity from the keychain.
  env: signMac || (process.platform === "win32" && env.WIN_CSC_LINK) ? env : { ...env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
});
