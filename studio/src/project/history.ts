// Pure helpers for the version tree (docs/m2.md#1-버전-히스토리).
import type { Scene } from "../scene/schema";

interface TreeNode {
  id: string;
  parentId: string | null;
  createdAt: number;
}

const MESSAGE_LENGTH = 60;

/** Scenes compare by content; object key order doesn't matter. */
export function sameScene(a: Scene, b: Scene): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A one-line version message from a prompt. */
export function versionMessage(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= MESSAGE_LENGTH) return line || "Untitled change";
  return `${line.slice(0, MESSAGE_LENGTH - 1).trimEnd()}…`;
}

/**
 * Display order and indentation for a version tree. Versions are listed
 * depth-first, oldest first. The first child continues its parent's lane;
 * every later child (a branch made after a restore) gets the next lane and
 * is listed before the parent's main line continues.
 */
export function layoutTree<T extends TreeNode>(versions: T[]): Array<{ version: T; depth: number }> {
  const ids = new Set(versions.map((v) => v.id));
  const children = new Map<string | null, T[]>();
  for (const v of [...versions].sort((a, b) => a.createdAt - b.createdAt)) {
    // A missing parent (shouldn't happen) makes the version a root rather than hiding it.
    const parent = v.parentId !== null && ids.has(v.parentId) ? v.parentId : null;
    const list = children.get(parent);
    if (list) list.push(v);
    else children.set(parent, [v]);
  }

  const out: Array<{ version: T; depth: number }> = [];
  // Iterative so long linear histories can't overflow the stack.
  const stack: Array<{ version: T; depth: number }> = (children.get(null) ?? []).map((version) => ({ version, depth: 0 })).reverse();
  while (stack.length) {
    const item = stack.pop()!;
    out.push(item);
    const [first, ...branches] = children.get(item.version.id) ?? [];
    if (first) stack.push({ version: first, depth: item.depth });
    for (const branch of branches.reverse()) stack.push({ version: branch, depth: item.depth + 1 });
  }
  return out;
}

/** Find a version by full id or unique prefix; throws an actionable error otherwise. */
export function resolveVersionId<T extends { id: string }>(versions: T[], idOrPrefix: string): T {
  const key = idOrPrefix.trim();
  const exact = versions.find((v) => v.id === key);
  if (exact) return exact;
  const matches = key.length >= 4 ? versions.filter((v) => v.id.startsWith(key)) : [];
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new Error(`"${key}" matches ${matches.length} versions; use more characters of the id.`);
  throw new Error(`No version "${key}". Call history_list to see the available ids.`);
}
