/**
 * Agent API error classification — pure decision function.
 *
 * Takes an API error and returns an action descriptor.
 */

/**
 * Classify an API error and return a recommended action.
 *
 * @param {Error} err
 * @param {{ overloadRetries: number, compactRetries: number, maxOverloadRetries: number, maxCompactRetries: number }} counts
 * @returns {{ action: "retry"|"compact"|"break"|"throw", delay?: number, message?: string }}
 */
export function classifyApiError(err, counts) {
  const errMsg = (err.message || "").toLowerCase();
  const status = err.status || 0;

  // Overloaded / rate limited
  if (status === 529 || status === 429 || errMsg.includes("overloaded") || errMsg.includes("rate_limit")) {
    if (counts.overloadRetries >= counts.maxOverloadRetries) {
      return { action: "throw", message: `API overloaded after ${counts.maxOverloadRetries} retries` };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 30);
    return { action: "retry", delay, message: `API overloaded — retrying in ${delay}s...` };
  }

  // Context too long
  if (errMsg.includes("prompt is too long") || errMsg.includes("too long")) {
    if (counts.compactRetries >= counts.maxCompactRetries) {
      return { action: "throw", message: "Context too long after compaction" };
    }
    return { action: "compact", message: "Context too long — compacting..." };
  }

  // Server errors
  if (status >= 500) {
    if (counts.overloadRetries >= counts.maxOverloadRetries) {
      return { action: "throw" };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 30);
    return { action: "retry", delay, message: `Server error — retrying in ${delay}s...` };
  }

  // Network / stream errors
  const isNetworkError = status === 0 || errMsg.includes("timeout") || errMsg.includes("aborted");
  if (isNetworkError && (
    errMsg.includes("fetch") || errMsg.includes("network") ||
    errMsg.includes("timeout") || errMsg.includes("failed") ||
    errMsg.includes("terminated") || errMsg.includes("connection") ||
    errMsg.includes("aborted") || errMsg.includes("stream") ||
    errMsg.includes("readable") || errMsg.includes("body")
  )) {
    if (counts.overloadRetries >= counts.maxOverloadRetries) {
      return { action: "throw" };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 10);
    return { action: "retry", delay, message: `Connection lost — retrying in ${delay}s...` };
  }

  // Catch-all: unknown non-HTTP error
  if (!status || status === 0) {
    if (counts.overloadRetries >= counts.maxOverloadRetries) {
      return { action: "throw" };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 10);
    return { action: "retry", delay, message: `Unexpected error: ${err.message} — retrying in ${delay}s...` };
  }

  return { action: "throw" };
}
