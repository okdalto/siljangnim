/**
 * Color conversion and comparison utilities.
 */

/**
 * Convert RGB (0-255) to hex string.
 */
export function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Euclidean distance between two RGB colors (each [r, g, b] in 0-255).
 */
export function colorDistance(a, b) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

/**
 * Convert a 0-1 float RGB array to hex string.
 * @param {number[]} arr — [r, g, b] each 0-1
 */
export function rgbArrayToHex(arr) {
  const r = Math.round(arr[0] * 255).toString(16).padStart(2, "0");
  const g = Math.round(arr[1] * 255).toString(16).padStart(2, "0");
  const b = Math.round(arr[2] * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

/**
 * Convert hex string to 0-1 float RGB array.
 * @param {string} hex — e.g. "#ff8800"
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
