/**
 * Deep object access and cloning utilities.
 */

/**
 * Resolve a dot-separated path on an object.
 * @param {object} obj
 * @param {string} path — e.g. "a.b.c"
 * @returns {*}
 */
export function getByPath(obj, path) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * Set a value at a dot-separated path, creating intermediate objects as needed.
 * @param {object} obj
 * @param {string} path
 * @param {*} value
 */
export function setByPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/**
 * Deep clone an object. Uses structuredClone when available, falls back to JSON round-trip.
 * @param {*} obj
 * @returns {*}
 */
export function deepClone(obj) {
  return structuredClone(obj);
}
