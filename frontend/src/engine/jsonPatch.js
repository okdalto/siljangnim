/**
 * Minimal RFC 6902 JSON Patch diff / apply utility.
 * No external dependencies.
 */

/**
 * Deep-equal comparison for JSON-compatible values.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Escape a JSON Pointer token (RFC 6901).
 */
function escapeToken(token) {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Generate RFC 6902 JSON Patch ops from `oldObj` to `newObj`.
 * Produces add / remove / replace ops (no move / copy / test).
 */
export function diff(oldObj, newObj) {
  const ops = [];
  _diff(oldObj, newObj, "", ops);
  return ops;
}

function _diff(a, b, path, ops) {
  if (deepEqual(a, b)) return;

  // Both arrays — diff element-wise for shared prefix, then handle tail
  if (Array.isArray(a) && Array.isArray(b)) {
    const minLen = Math.min(a.length, b.length);
    // Recurse into shared indices
    for (let i = 0; i < minLen; i++) {
      _diff(a[i], b[i], `${path}/${i}`, ops);
    }
    // Remove extra elements from old (remove from end to keep indices stable)
    for (let i = a.length - 1; i >= minLen; i--) {
      ops.push({ op: "remove", path: `${path}/${i}` });
    }
    // Add new elements
    for (let i = minLen; i < b.length; i++) {
      ops.push({ op: "add", path: `${path}/-`, value: structuredClone(b[i]) });
    }
    return;
  }

  // Both objects
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      const childPath = `${path}/${escapeToken(key)}`;
      const inA = Object.prototype.hasOwnProperty.call(a, key);
      const inB = Object.prototype.hasOwnProperty.call(b, key);
      if (inA && !inB) {
        ops.push({ op: "remove", path: childPath });
      } else if (!inA && inB) {
        ops.push({ op: "add", path: childPath, value: structuredClone(b[key]) });
      } else {
        _diff(a[key], b[key], childPath, ops);
      }
    }
    return;
  }

  // Primitive or type mismatch
  ops.push({ op: "replace", path: path || "/", value: structuredClone(b) });
}

/**
 * Unescape a JSON Pointer token.
 */
function unescapeToken(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Parse a JSON Pointer string into an array of tokens.
 */
function parsePath(path) {
  if (path === "" || path === "/") return [];
  if (path[0] !== "/") throw new Error(`Invalid JSON Pointer: ${path}`);
  return path.slice(1).split("/").map(unescapeToken);
}

/**
 * Apply an array of RFC 6902 JSON Patch ops to `doc` (mutates in place).
 * Returns the (possibly replaced) root.
 */
export function apply(doc, ops) {
  let root = doc;
  for (const op of ops) {
    const tokens = parsePath(op.path);

    if (tokens.length === 0) {
      // Root-level replace
      if (op.op === "replace" || op.op === "add") {
        root = structuredClone(op.value);
      }
      continue;
    }

    // Navigate to parent
    let parent = root;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      if (Array.isArray(parent)) {
        parent = parent[parseInt(t, 10)];
      } else {
        parent = parent[t];
      }
      if (parent == null) break;
    }
    if (parent == null) {
      console.warn(`[jsonPatch] Skipping ${op.op} at "${op.path}" — parent path does not exist`);
      continue;
    }

    const lastToken = tokens[tokens.length - 1];

    switch (op.op) {
      case "add":
        if (Array.isArray(parent)) {
          if (lastToken === "-") {
            parent.push(structuredClone(op.value));
          } else {
            parent.splice(parseInt(lastToken, 10), 0, structuredClone(op.value));
          }
        } else {
          parent[lastToken] = structuredClone(op.value);
        }
        break;
      case "remove":
        if (Array.isArray(parent)) {
          parent.splice(parseInt(lastToken, 10), 1);
        } else {
          delete parent[lastToken];
        }
        break;
      case "replace":
        if (Array.isArray(parent)) {
          parent[parseInt(lastToken, 10)] = structuredClone(op.value);
        } else {
          parent[lastToken] = structuredClone(op.value);
        }
        break;
    }
  }
  return root;
}
