// Launches the staged app (or the packaged one via SILJANGNIM_APP_PATH) in a
// throwaway profile, runs the in-app checks (src/smoke.js) including one
// agent run against a mock Anthropic server, and writes
// release/smoke/{window.png,report.json}.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import { EXPECTED_REQUESTS, FINAL_TEXT, startMockAnthropic } from "./mockAnthropic.mjs";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.SILJANGNIM_SMOKE_OUT || join(desktopDir, "release", "smoke");
const appBinary = process.env.SILJANGNIM_APP_PATH ? resolve(process.env.SILJANGNIM_APP_PATH) : null;
const profile = join(desktopDir, "release", "smoke-profile");
const TEST_KEY = "sk-ant-smoke-test";

// Fresh app state every run; keep the downloaded Python runtime to save time.
mkdirSync(profile, { recursive: true });
for (const entry of readdirSync(profile)) {
  if (entry !== "runtime") rmSync(join(profile, entry), { recursive: true, force: true });
}

const mock = await startMockAnthropic(TEST_KEY);
const cmd = appBinary || electronPath;
const args = appBinary ? [] : [desktopDir];
// Headless Linux (CI/containers) has no GPU: use SwiftShader so WebGL still works.
const extra = process.platform === "linux" ? ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];

// Async spawn: the mock server must keep answering while the app runs.
const status = await new Promise((resolveExit) => {
  const child = spawn(cmd, [...args, ...extra], {
    env: {
      ...process.env,
      SILJANGNIM_SMOKE_OUT: outDir,
      SILJANGNIM_USER_DATA: profile,
      SILJANGNIM_ANTHROPIC_BASE_URL: mock.url,
      SILJANGNIM_SMOKE_KEY: TEST_KEY,
      SILJANGNIM_SMOKE_FINAL_TEXT: FINAL_TEXT,
    },
    stdio: "inherit",
  });
  child.on("exit", (code) => resolveExit(code ?? 1));
});
await mock.close();

let report;
try {
  report = JSON.parse(readFileSync(join(outDir, "report.json"), "utf8"));
} catch {
  console.error("[smoke] no report written");
  process.exit(1);
}
const { requests, ...mockChecks } = mock.checks;
report.mock = { requests, checks: mockChecks };
report.ok = report.ok && requests === EXPECTED_REQUESTS && Object.values(mockChecks).every(Boolean);
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(status === 0 && report.ok ? 0 : 1);
