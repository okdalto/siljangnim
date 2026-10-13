#!/usr/bin/env node
const args = process.argv.slice(2);
if (!args.length) {
  await import("../src/server.js");
} else if (args.length === 2 && args[0] === "setup" && args[1] === "codex") {
  try {
    const { setupCodex } = await import("../src/setup.js");
    await setupCodex();
  } catch (error) {
    console.error(`[siljangnim setup] ${error.message}`);
    process.exitCode = 1;
  }
} else if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log("Usage: siljangnim-mcp [setup codex]");
} else {
  console.error("Usage: siljangnim-mcp [setup codex]");
  process.exitCode = 1;
}
