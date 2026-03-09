/**
 * Error classification — distinguishes engine errors from script errors.
 */

const ENGINE_ERROR_PATTERNS = [
  "ResizeObserver", "VideoEncoder", "MediaRecorder", "MediaPipe",
  "captureStream", "WebSocket", "Failed to fetch", "net::ERR_",
  "NS_ERROR_", "NotAllowedError", "NotSupportedError", "AbortError",
  "QuotaExceededError", "recorder", "muxer", "mp4-muxer", "webm-muxer",
];

/**
 * Classify an error message as "engine" (infrastructure) or "script" (user code).
 * @param {string} message
 * @returns {"engine"|"script"}
 */
export function classifyError(message) {
  const lower = message.toLowerCase();
  for (const pattern of ENGINE_ERROR_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return "engine";
  }
  return "script";
}

export { ENGINE_ERROR_PATTERNS };
