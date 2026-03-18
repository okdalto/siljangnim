/**
 * Nested object helpers using dot-path notation.
 * e.g. getNested(obj, "a.b.c") → obj.a.b.c
 */

export function getNested(obj, path) {
  const keys = path.split(".");
  let cur = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== "object") throw new Error(`Cannot traverse into non-object at '${key}'`);
    if (!(key in cur)) throw new Error(`Key '${key}' not found`);
    cur = cur[key];
  }
  return cur;
}

export function setNested(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (cur == null || typeof cur !== "object") throw new Error(`Cannot traverse at '${key}'`);
    if (!(key in cur)) cur[key] = {};
    cur = cur[key];
  }
  const finalKey = keys[keys.length - 1];
  if (cur == null || typeof cur !== "object") throw new Error(`Cannot set '${finalKey}' on non-object`);
  cur[finalKey] = value;
}

export function deleteNested(obj, path) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (cur == null || typeof cur !== "object" || !(key in cur)) throw new Error(`Key '${key}' not found`);
    cur = cur[key];
  }
  const finalKey = keys[keys.length - 1];
  if (cur == null || typeof cur !== "object" || !(finalKey in cur)) throw new Error(`Key '${finalKey}' not found`);
  delete cur[finalKey];
}
