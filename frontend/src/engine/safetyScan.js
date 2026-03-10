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
  // Data exfiltration via image/script loading
  { re: /new\s+Image\s*\(\s*\)[\s\S]*?\.src\s*=/, msg: "Script may exfiltrate data via image loading" },
  { re: /document\.create/, msg: "Script creates DOM elements" },
  // WebSocket for data exfiltration
  { re: /new\s+WebSocket\s*\(/, msg: "Script opens WebSocket connections" },
  // Service workers
  { re: /navigator\.serviceWorker/, msg: "Script registers service workers" },
  // Dynamic import
  { re: /import\s*\(/, msg: "Script uses dynamic import" },
];

const WARN_PATTERNS = [
  { re: /eval\s*\(/, msg: "Script contains eval() — potential code injection" },
  { re: /new\s+Function\s*\(/, msg: "Script uses new Function() — potential code injection" },
  { re: /localStorage|sessionStorage/, msg: "Script accesses browser storage" },
  { re: /indexedDB/, msg: "Script accesses IndexedDB" },
  { re: /crypto\.subtle/, msg: "Script uses crypto API" },
  // Obfuscation detection
  { re: /\bwindow\s*\[/, msg: "Script uses bracket notation on window — possible obfuscation" },
  { re: /\bglobalThis\s*\[/, msg: "Script uses bracket notation on globalThis — possible obfuscation" },
  { re: /String\.fromCharCode/, msg: "Script builds strings from char codes — possible obfuscation" },
  { re: /atob\s*\(/, msg: "Script decodes base64 — possible obfuscation" },
  { re: /\\u[0-9a-fA-F]{4}/, msg: "Script contains unicode escapes — possible obfuscation" },
  { re: /\\x[0-9a-fA-F]{2}/, msg: "Script contains hex escapes — possible obfuscation" },
];

/**
 * Check for string concatenation tricks used to bypass simple regex patterns.
 * e.g. "ev" + "al", 'doc' + 'ument'
 */
function detectConcatObfuscation(code) {
  const issues = [];
  const suspiciousWords = ["eval", "Function", "fetch", "cookie", "localStorage", "sessionStorage", "XMLHttpRequest", "innerHTML", "document", "window"];
  for (const word of suspiciousWords) {
    // Check for string concat patterns like "ev"+"al" or 'ev'+'al'
    for (let i = 1; i < word.length; i++) {
      const left = word.slice(0, i);
      const right = word.slice(i);
      const concatRe = new RegExp(`['"\`]${escapeRegex(left)}['"\`]\\s*\\+\\s*['"\`]${escapeRegex(right)}['"\`]`);
      if (concatRe.test(code)) {
        issues.push({ type: "error", message: `Script uses string concatenation to build "${word}" — obfuscated dangerous call` });
        break;
      }
    }
  }
  return issues;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

    // String concatenation obfuscation detection
    const concatIssues = detectConcatObfuscation(allCode);
    issues.push(...concatIssues);
  }

  // 3. Also scan custom panel HTML content
  for (const [key, value] of Object.entries(files || {})) {
    if (key === "panels.json" && value?.panels) {
      for (const panel of Object.values(value.panels)) {
        if (panel.html) {
          for (const { re, msg } of BLOCKED_PATTERNS) {
            if (re.test(panel.html)) issues.push({ type: "error", message: `Panel "${panel.title || key}": ${msg}` });
          }
        }
      }
    }
  }

  // 4. Oversized assets
  const blobEntries = Object.entries(blobs || {});
  const totalSize = blobEntries.reduce((sum, [, b]) => sum + (b.size || 0), 0);
  if (totalSize > 100 * 1024 * 1024) {
    warnings.push({ type: "warning", message: `Large project: ${(totalSize / 1024 / 1024).toFixed(1)}MB of assets` });
  }

  // 5. Missing assets referenced in manifest
  const excludedFilenames = new Set((manifest?.excluded_assets || []).map((a) => a.filename));
  if (manifest?.assets) {
    for (const asset of manifest.assets) {
      const filename = asset.filename;
      if (filename && !blobs?.[`uploads/${filename}`] && !files?.[`uploads/${filename}`]) {
        if (excludedFilenames.has(filename)) {
          warnings.push({ type: "warning", message: `Asset "${filename}" was intentionally excluded. You need to add this asset to use this project.` });
        } else {
          warnings.push({ type: "info", message: `Asset "${filename}" listed in manifest but not found in files` });
        }
      }
    }
  }

  // 5b. Warn about intentionally excluded assets (even if not in assets list)
  if (manifest?.excluded_assets) {
    for (const asset of manifest.excluded_assets) {
      if (!excludedFilenames.has(asset.filename)) continue; // already handled above
      const inBlobs = blobs?.[`uploads/${asset.filename}`] || files?.[`uploads/${asset.filename}`];
      if (!inBlobs) {
        // Only add if not already warned via assets list above
        const alreadyWarned = warnings.some((w) => w.message.includes(`"${asset.filename}"`));
        if (!alreadyWarned) {
          warnings.push({ type: "warning", message: `Asset "${asset.filename}" was intentionally excluded. You need to add this asset to use this project.` });
        }
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
