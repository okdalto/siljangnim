/**
 * Base64 decoding utilities.
 */

/**
 * Decode a base64 string (or data-URL) to a Uint8Array.
 * Strips whitespace from the base64 payload (handles GitHub API line breaks).
 *
 * @param {string} b64OrDataUrl — raw base64 or "data:...;base64,..." string
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(b64OrDataUrl) {
  const b64 = b64OrDataUrl.includes(",")
    ? b64OrDataUrl.split(",")[1]
    : b64OrDataUrl;
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
