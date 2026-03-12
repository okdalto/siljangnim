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
      return { action: "throw", message: `API overloaded after ${counts.maxOverloadRetries} retries`, userMessage: "서버가 바빠 요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요." };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 30);
    return { action: "retry", delay, message: `API overloaded — retrying in ${delay}s...`, userMessage: `서버가 바쁩니다. ${delay}초 후 자동으로 재시도합니다.` };
  }

  // Context too long
  if (errMsg.includes("prompt is too long") || errMsg.includes("too long")) {
    if (counts.compactRetries >= counts.maxCompactRetries) {
      return { action: "throw", message: "Context too long after compaction", userMessage: "대화가 너무 길어 진행할 수 없습니다. 'New Chat'으로 새 대화를 시작해 주세요." };
    }
    return { action: "compact", message: "Context too long — compacting...", userMessage: "대화가 너무 길어졌습니다. 자동으로 요약하고 있습니다." };
  }

  // Server errors
  if (status >= 500) {
    if (counts.overloadRetries >= counts.maxOverloadRetries) {
      return { action: "throw", userMessage: "오류가 발생했습니다." };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 30);
    return { action: "retry", delay, message: `Server error — retrying in ${delay}s...`, userMessage: `서버 오류가 발생했습니다. ${delay}초 후 재시도합니다.` };
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
      return { action: "throw", userMessage: "오류가 발생했습니다." };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 10);
    return { action: "retry", delay, message: `Connection lost — retrying in ${delay}s...`, userMessage: `연결이 끊어졌습니다. ${delay}초 후 재시도합니다.` };
  }

  // Catch-all: unknown non-HTTP error
  if (!status || status === 0) {
    if (counts.overloadRetries >= counts.maxOverloadRetries) {
      return { action: "throw", userMessage: "오류가 발생했습니다." };
    }
    const delay = Math.min(2 ** (counts.overloadRetries + 1), 10);
    return { action: "retry", delay, message: `Unexpected error: ${err.message} — retrying in ${delay}s...`, userMessage: `예상치 못한 오류가 발생했습니다. ${delay}초 후 재시도합니다.` };
  }

  return { action: "throw", userMessage: "오류가 발생했습니다." };
}
