/**
 * Safety scan for imported projects.
 * Validates manifest, checks for suspicious content, missing assets.
 */

const BLOCKED_PATTERNS = [
  { re: /document\.cookie/, msg: "Script accesses cookies" },
  { re: /window\.open\s*\(/, msg: "Script opens new windows" },
  { re: /fetch\s*\(\s*['"`](?!\/api)/, msg: "Script makes external network requests" },
  { re: /XMLHttpRequest/, msg: "Script uses XMLHttpRequest" },
  { re: /\.innerHTML\s*=/, msg: "Script sets innerHTML" },
  { re: /importScripts\s*\(/, msg: "Script imports external scripts" },
  { re: /navigator\.sendBeacon\s*\(/, msg: "Script sends beacons to external servers" },
  { re: /postMessage\s*\(/, msg: "Script uses cross-origin messaging" },
];

const WARN_PATTERNS = [
  { re: /eval\s*\(/, msg: "Script contains eval() — potential code injection" },
  { re: /new\s+Function\s*\(/, msg: "Script uses new Function() — potential code injection" },
  { re: /localStorage|sessionStorage/, msg: "Script accesses browser storage" },
  { re: /indexedDB/, msg: "Script accesses IndexedDB" },
  { re: /crypto\.subtle/, msg: "Script uses crypto API" },
];

export function scanProject(manifest, files, blobs) {
  const issues = [];
  const warnings = [];

  // 1. Manifest validity
  if (!manifest) {
    issues.push({ type: "error", message: "Missing project manifest" });
  } else {
    if (!manifest.schema_version) warnings.push({ type: "warning", message: "No schema version — assuming v1" });
    if (!manifest.name) warnings.push({ type: "warning", message: "No project name in manifest" });
  }

  // 2. Check for suspicious executable content in scene scripts
  const scene = files?.["scene.json"];
  if (scene?.script) {
    const allCode = [scene.script.setup, scene.script.render, scene.script.cleanup]
      .filter(Boolean).join("\n");

    for (const { re, msg } of BLOCKED_PATTERNS) {
      if (re.test(allCode)) issues.push({ type: "error", message: msg });
    }
    for (const { re, msg } of WARN_PATTERNS) {
      if (re.test(allCode)) issues.push({ type: "warning", message: msg });
    }
  }

  // 3. Oversized assets
  const blobEntries = Object.entries(blobs || {});
  const totalSize = blobEntries.reduce((sum, [, b]) => sum + (b.size || 0), 0);
  if (totalSize > 100 * 1024 * 1024) {
    warnings.push({ type: "warning", message: `Large project: ${(totalSize / 1024 / 1024).toFixed(1)}MB of assets` });
  }

  // 4. Missing assets referenced in manifest
  if (manifest?.assets) {
    for (const asset of manifest.assets) {
      const filename = asset.filename;
      if (filename && !blobs?.[`uploads/${filename}`] && !files?.[`uploads/${filename}`]) {
        warnings.push({ type: "info", message: `Asset "${filename}" listed in manifest but not found in files` });
      }
    }
  }

  const hasErrors = issues.some(i => i.type === "error");
  const hasWarnings = issues.some(i => i.type === "warning") || warnings.some(i => i.type === "warning");
  const safetyScore = hasErrors ? "unsafe" : (hasWarnings ? "caution" : "safe");

  return {
    safetyScore,
    issues: [...issues, ...warnings],
    hasErrors,
    hasWarnings,
    shouldBlock: hasErrors,
  };
}
