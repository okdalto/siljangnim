/**
 * File browser utility functions.
 */

/**
 * Build a nested tree from a flat list of files.
 * Each file must have a `path` property (e.g. "uploads/textures/foo.png").
 * Returns an array of tree nodes: { name, path, children?, ...fileData }
 * Folders come first, sorted alphabetically within each level.
 */
export function buildTree(files) {
  const root = { children: new Map() };

  for (const raw of files) {
    // Accept both string paths and {path, size, ...} objects
    const file = typeof raw === "string" ? { path: raw } : raw;
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map() });
      }
      node = node.children.get(part);
      if (i === parts.length - 1) {
        // Leaf node — attach file data
        Object.assign(node, file);
        node.isFile = true;
      }
    }
  }

  function convert(map, parentPath = "") {
    const entries = [];
    for (const [name, node] of map) {
      const path = parentPath ? `${parentPath}/${name}` : name;
      if (node.isFile) {
        entries.push({ name, path, ...node, children: undefined, isFile: true });
      } else {
        entries.push({
          name,
          path,
          isFolder: true,
          children: convert(node.children, path),
        });
      }
    }
    // Folders first, then files, each sorted alphabetically
    entries.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  return convert(root.children);
}

/**
 * Return an emoji/icon character based on mime type.
 */
export function getFileIcon(mimeType) {
  if (!mimeType) return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType === "application/json" || mimeType.includes("json")) return "📋";
  if (mimeType.startsWith("text/")) return "📝";
  if (mimeType === "application/pdf") return "📕";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip")) return "📦";
  if (mimeType.includes("font") || mimeType.includes("woff")) return "🔤";
  if (mimeType.includes("model") || mimeType.includes("gltf") || mimeType.includes("obj")) return "🧊";
  return "📄";
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Check if a mime type is previewable inline.
 */
export function isPreviewable(mimeType) {
  if (!mimeType) return false;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType.startsWith("audio/")) return true;
  if (mimeType.startsWith("video/")) return true;
  if (mimeType === "application/json") return true;
  if (mimeType.startsWith("text/")) return true;
  return false;
}
