/**
 * Tool loop detection — detects when the agent is stuck calling the same tool.
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
