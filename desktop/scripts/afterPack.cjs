// electron-builder never copies node_modules through extraResources, so the bundled siljangnim-mcp's
// dependencies are added here, after packing and before signing.
const { cpSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : join(context.appOutDir, "resources");
  cpSync(join(__dirname, "..", "stage", "mcp", "node_modules"), join(resources, "mcp", "node_modules"), { recursive: true, dereference: true });
};
