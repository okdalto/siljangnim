/**
 * Tool loop detection — detects when the agent is stuck calling the same tool
 * or repeatedly hitting the same error pattern.
 */

/**
 * Detect if the agent is stuck in a tool loop.
 *
 * @param {string[]} recentSigs — recent tool call signatures (last N)
 * @param {{ warnThreshold: number, breakThreshold: number }} thresholds
 * @returns {{ action: "none"|"warn"|"break", count: number }}
 */
export function detectToolLoop(recentSigs, thresholds) {
  const last10 = recentSigs.slice(-10);
  const sigCounts = {};
  for (const s of last10) sigCounts[s] = (sigCounts[s] || 0) + 1;
  const maxCount = Math.max(0, ...Object.values(sigCounts));

  if (maxCount >= thresholds.breakThreshold) {
    return { action: "break", count: maxCount };
  }
  if (maxCount >= thresholds.warnThreshold) {
    return { action: "warn", count: maxCount };
  }
  return { action: "none", count: maxCount };
}

// ---------------------------------------------------------------------------
// Error loop detection — catches "same error, different code" cycles
// ---------------------------------------------------------------------------

/**
 * Normalize an error message for pattern comparison.
 * Strips line numbers, variable names, and addresses so that
 * semantically identical errors produce the same key.
 */
function normalizeError(msg) {
  return msg
    .replace(/at line \d+/g, "at line *")
    .replace(/:\d+:\d+/g, ":*:*")
    // Only collapse long quoted strings (>20 chars) — short identifiers are kept
    // to distinguish different errors like "'foo' is not defined" vs "'bar' is not defined"
    .replace(/'[^']{20,}'/g, "'*'")
    .replace(/"[^"]{20,}"/g, '"*"')
    .replace(/\b0x[0-9a-fA-F]+\b/g, "0x*")
    .replace(/\b\d{3,}\b/g, "*")
    .trim();
}

/**
 * Detect if the agent is stuck hitting the same error repeatedly.
 *
 * @param {string[]} recentErrors — normalized error patterns (last N)
 * @param {{ warnThreshold: number, breakThreshold: number }} thresholds
 * @returns {{ action: "none"|"warn"|"break", count: number, pattern: string }}
 */
export function detectErrorLoop(recentErrors, thresholds) {
  if (recentErrors.length < thresholds.warnThreshold) {
    return { action: "none", count: 0, pattern: "" };
  }

  const last8 = recentErrors.slice(-8);
  const counts = {};
  for (const e of last8) counts[e] = (counts[e] || 0) + 1;

  let maxPattern = "";
  let maxCount = 0;
  for (const [pattern, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; maxPattern = pattern; }
  }

  if (maxCount >= thresholds.breakThreshold) {
    return { action: "break", count: maxCount, pattern: maxPattern };
  }
  if (maxCount >= thresholds.warnThreshold) {
    return { action: "warn", count: maxCount, pattern: maxPattern };
  }
  return { action: "none", count: maxCount, pattern: maxPattern };
}

// ---------------------------------------------------------------------------
// Unrecoverable error detection — errors that cannot be fixed by editing code
// ---------------------------------------------------------------------------

const UNRECOVERABLE_PATTERNS = [
  /context.*(lost|is lost)/i,
  /please refresh the page/i,
  /createShader returned null/i,
  /Shader compile failed:.*null/i,
  /Shader compile error:\s*null/i,
  /WebGL context/i,
  /context creation failed/i,
  /GPU device lost/i,
  /device was destroyed/i,
];

/**
 * Check if an error message indicates an unrecoverable environment issue
 * (not a code bug). These errors cannot be fixed by editing scene code.
 *
 * @param {string} errorMsg — raw error message
 * @returns {{ unrecoverable: boolean, reason: string }}
 */
export function isUnrecoverableError(errorMsg) {
  if (!errorMsg) return { unrecoverable: false, reason: "" };
  for (const pattern of UNRECOVERABLE_PATTERNS) {
    if (pattern.test(errorMsg)) {
      return {
        unrecoverable: true,
        reason: errorMsg.slice(0, 200),
      };
    }
  }
  return { unrecoverable: false, reason: "" };
}

export { normalizeError };
