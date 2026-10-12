// "Open folder" in the Assets tab: the open project written out as plain files under
// ~/Siljangnim/projects/<name>/ so it can be browsed in Finder/Explorer and opened in an
// editor. The folder is a copy; the project itself stays in the app's storage.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

const MANIFEST = ".siljangnim-files.json";

export function projectsRoot() {
  return process.env.SILJANGNIM_PROJECTS_DIR || join(homedir(), "Siljangnim", "projects");
}

/** A relative path with plain segments only (no "..", absolute paths, drive letters or backslashes). */
export function safeRelative(path) {
  if (typeof path !== "string" || !path || path.length > 512) return null;
  const parts = path.split("/");
  // eslint-disable-next-line no-control-regex
  if (parts.some((p) => !p || p === "." || p === ".." || /[\\:\u0000-\u001f]/.test(p))) return null;
  return parts.join("/");
}

/**
 * Write `files` into <root>/<folder>/, replacing what an earlier write left there
 * (tracked in a manifest, so files the person added by hand are kept).
 * @param {string} root
 * @param {string} folder
 * @param {{ path: string, data: Uint8Array | string }[]} files
 * @returns {string} the folder's absolute path
 */
export function writeProjectFolder(root, folder, files) {
  if (!safeRelative(folder) || folder.includes("/")) throw new Error(`bad folder name: ${folder}`);
  const dir = resolve(root, folder);
  const paths = files.map((f) => {
    const rel = safeRelative(f.path);
    if (!rel || rel === MANIFEST) throw new Error(`bad file path: ${f.path}`);
    return rel;
  });
  mkdirSync(dir, { recursive: true });

  const manifest = join(dir, MANIFEST);
  let previous = [];
  try {
    previous = JSON.parse(readFileSync(manifest, "utf8")).files ?? [];
  } catch {
    // First write, or a manifest someone edited: nothing to clean up.
  }
  const current = new Set(paths);
  for (const old of previous) {
    const rel = safeRelative(old);
    if (!rel || current.has(rel)) continue;
    const target = join(dir, rel);
    if (target.startsWith(dir + sep) && existsSync(target)) rmSync(target, { force: true });
  }
  files.forEach((f, i) => {
    const target = join(dir, paths[i]);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.data);
  });
  writeFileSync(manifest, JSON.stringify({ written: new Date().toISOString(), files: paths }, null, 2));
  return dir;
}
