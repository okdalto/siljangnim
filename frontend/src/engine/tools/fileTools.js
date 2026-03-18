/**
 * File tools — extracted from toolHandlers.js.
 * Handles file reading, writing, listing, searching, and asset management.
 */

import * as storage from "../storage.js";
import { deepClone } from "../../utils/objectUtils.js";
import { getNested, setNested, deleteNested } from "../../utils/dotPath.js";
import { normalizeScriptStrings, validateSceneJson } from "./sceneTools.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKSPACE_FILES = new Set([
  "scene.json",
  "workspace_state.json",
  "panels.json",
  "ui_config.json",
  "debug_logs.json",
]);

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

export async function toolReadFile(input, broadcast) {
  const relPath = input.path || "";
  if (!relPath) return "Error: 'path' is required.";
  const section = input.section;

  // Workspace JSON files
  if (WORKSPACE_FILES.has(relPath)) {
    let data;
    try {
      data = await storage.readJson(relPath);
    } catch {
      if (relPath === "workspace_state.json") {
        data = { version: 1, keyframes: {}, duration: 30, loop: true };
      } else {
        return `No ${relPath} exists yet. Create a new one.`;
      }
    }
    if (section) {
      try {
        const value = getNested(data, section);
        return typeof value === "string" ? value : JSON.stringify(value, null, 2);
      } catch (e) {
        return `Error: section '${section}' not found: ${e.message}`;
      }
    }
    return JSON.stringify(data, null, 2);
  }

  // Upload files
  if (relPath.startsWith("uploads/")) {
    const filename = relPath.slice(8);
    try {
      const info = await storage.getUploadInfo(filename);
      const textTypes = ["text/", "application/json", "application/xml", "application/javascript"];
      const textExts = [".obj", ".mtl", ".glsl", ".txt", ".csv", ".json", ".xml", ".html", ".css", ".js", ".py", ".md", ".yaml", ".yml", ".svg"];
      const isText = textTypes.some((t) => info.mime_type.startsWith(t)) ||
        textExts.some((ext) => filename.toLowerCase().endsWith(ext));

      if (isText) {
        const blob = await storage.readUpload(filename);
        const text = new TextDecoder().decode(blob.data);
        const content = text.length > 50000 ? text.slice(0, 50000) + "\n... (truncated)" : text;
        return `File: ${filename} (${info.size} bytes, ${info.mime_type})\n\n${content}`;
      } else {
        return (
          `Binary file: ${filename}\n` +
          `Size: ${info.size} bytes\n` +
          `MIME type: ${info.mime_type}\n` +
          `The file is accessible at: /api/uploads/${filename}`
        );
      }
    } catch {
      return `File not found: ${filename}`;
    }
  }

  // .workspace/* text files
  if (relPath.startsWith(".workspace/")) {
    try {
      const content = await storage.readTextFile(relPath);
      return `File: ${relPath}\n\n${content}`;
    } catch {
      return `Error: '${relPath}' not found.`;
    }
  }

  return `Error: '${relPath}' — only workspace files and uploads are accessible in browser mode.`;
}

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

export async function toolWriteFile(input, broadcast) {
  const relPath = input.path || "";
  if (!relPath) return "Error: 'path' is required.";
  const rawContent = input.content;
  const rawEdits = input.edits;
  const appendMode = input.append === true;

  if (rawContent == null && rawEdits == null) {
    return "Error: either 'content' or 'edits' is required.";
  }

  const isWorkspaceFile = WORKSPACE_FILES.has(relPath);
  const isUnderWorkspaceDir = relPath.startsWith(".workspace/");

  if (!isWorkspaceFile && !isUnderWorkspaceDir) {
    return "Write access denied. Only workspace files and .workspace/ are writable in browser mode.";
  }

  // Append mode — only for .workspace/* text files
  if (appendMode) {
    if (!isUnderWorkspaceDir) {
      return "Error: append mode is only supported for .workspace/* text files, not workspace JSON files.";
    }
    if (rawContent == null) {
      return "Error: 'content' is required when using append mode.";
    }
    let existing = "";
    try { existing = await storage.readTextFile(relPath); } catch { /* file doesn't exist yet — start fresh */ }
    await storage.writeTextFile(relPath, existing + (typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent)));
    return `ok — appended to ${relPath} (total size: ${(existing.length + String(rawContent).length)} chars).`;
  }

  // Full replacement (content mode)
  if (rawContent != null) {
    if (isWorkspaceFile) {
      let data;
      try {
        data = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
      } catch (e) {
        return `Error: invalid JSON: ${e.message}`;
      }

      if (relPath === "scene.json") {
        normalizeScriptStrings(data);
        const errors = validateSceneJson(data);
        if (errors.length) {
          return "Validation errors (fix these and try again):\n" + errors.map((e) => `  - ${e}`).join("\n");
        }
        await storage.writeJson("scene.json", data);
        broadcast({ type: "scene_update", scene_json: data });
        return "ok — scene saved and broadcast.";
      }

      if (relPath === "workspace_state.json") {
        if (!data.version) data.version = 1;
        await storage.writeJson("workspace_state.json", data);
        broadcast({ type: "workspace_state_update", workspace_state: data });
        return "ok — workspace state saved and broadcast.";
      }

      await storage.writeJson(relPath, data);
      return `ok — ${relPath} saved.`;
    } else {
      // .workspace/* text file
      await storage.writeTextFile(relPath, typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));
      return `ok — wrote to ${relPath}`;
    }
  }

  // Partial edit (edits mode)
  let edits;
  try {
    edits = typeof rawEdits === "string" ? JSON.parse(rawEdits) : rawEdits;
  } catch (e) {
    return `Error: invalid edits JSON: ${e.message}`;
  }
  if (!Array.isArray(edits)) return "Error: 'edits' must be a JSON array.";

  if (isWorkspaceFile) {
    let data;
    try {
      data = await storage.readJson(relPath);
    } catch {
      if (relPath === "scene.json") return "No scene.json exists. Use write_file with content to create one first.";
      if (relPath === "workspace_state.json") data = { version: 1, keyframes: {}, duration: 30, loop: true };
      else data = {};
    }

    data = deepClone(data);
    const warnings = [];
    let appliedCount = 0;

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if ("path" in edit) {
        const dotPath = edit.path;
        const op = edit.op || "set";
        if (!dotPath) { warnings.push(`Edit ${i}: empty path, skipped`); continue; }
        try {
          if (op === "delete") deleteNested(data, dotPath);
          else setNested(data, dotPath, edit.value);
          appliedCount++;
        } catch (e) {
          warnings.push(`Edit ${i} (${op} '${dotPath}'): ${e.message}`);
        }
      } else {
        warnings.push(`Edit ${i}: JSON workspace files only support dot-path edits (need 'path' field).`);
      }
    }

    if (appliedCount === 0 && warnings.length) {
      return "Error: no edits applied.\n" + warnings.map((w) => `  - ${w}`).join("\n");
    }

    if (relPath === "scene.json") {
      normalizeScriptStrings(data);
      const errors = validateSceneJson(data);
      if (errors.length) {
        let result = "Validation errors after edits:\n" + errors.map((e) => `  - ${e}`).join("\n");
        if (warnings.length) result += "\nEdit warnings:\n" + warnings.map((w) => `  - ${w}`).join("\n");
        return result;
      }
      await storage.writeJson("scene.json", data);
      broadcast({ type: "scene_update", scene_json: data });
      let result = `ok — ${edits.length} edit(s) applied to scene.json and broadcast.`;
      if (warnings.length) result += "\nWarnings:\n" + warnings.map((w) => `  - ${w}`).join("\n");
      return result;
    }

    if (relPath === "workspace_state.json") {
      if (!data.version) data.version = 1;
      await storage.writeJson("workspace_state.json", data);
      broadcast({ type: "workspace_state_update", workspace_state: data });
      let result = `ok — ${edits.length} edit(s) applied to workspace_state.json and broadcast.`;
      if (warnings.length) result += "\nWarnings:\n" + warnings.map((w) => `  - ${w}`).join("\n");
      return result;
    }

    await storage.writeJson(relPath, data);
    let result = `ok — ${edits.length} edit(s) applied to ${relPath}.`;
    if (warnings.length) result += "\nWarnings:\n" + warnings.map((w) => `  - ${w}`).join("\n");
    return result;
  } else {
    // .workspace/* text file edits
    let fileText;
    try {
      fileText = await storage.readTextFile(relPath);
    } catch {
      return `Error: '${relPath}' does not exist.`;
    }

    const warnings = [];
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if ("old_text" in edit) {
        const oldText = edit.old_text;
        const newText = edit.new_text || "";
        if (!fileText.includes(oldText)) {
          warnings.push(`Edit ${i}: old_text not found, skipped`);
          continue;
        }
        const occurrences = fileText.split(oldText).length - 1;
        if (occurrences > 1) {
          warnings.push(`Edit ${i}: old_text found ${occurrences} times — only first replaced. Provide more context for unique match.`);
        }
        fileText = fileText.replace(oldText, newText);
      } else {
        warnings.push(`Edit ${i}: text files require 'old_text' field`);
      }
    }

    await storage.writeTextFile(relPath, fileText);
    let result = `ok — ${edits.length} edit(s) applied to ${relPath}.`;
    if (warnings.length) result += "\nWarnings:\n" + warnings.map((w) => `  - ${w}`).join("\n");
    return result;
  }
}

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

export async function toolListFiles(input, broadcast) {
  const prefix = input.path || "";
  const files = await storage.listFiles(prefix);
  if (!files.length) return "No workspace files found.";
  return "Workspace files:\n" + files.map((f) => `  ${f}`).join("\n");
}

// ---------------------------------------------------------------------------
// list_uploaded_files
// ---------------------------------------------------------------------------

export async function toolListUploadedFiles(input, broadcast) {
  const files = await storage.listUploads();
  if (!files.length) return "No files have been uploaded yet.";
  const lines = [];
  for (const f of files) {
    try {
      const info = await storage.getUploadInfo(f);
      lines.push(`- ${f} (${info.size} bytes, ${info.mime_type})`);
    } catch {
      lines.push(`- ${f} (info unavailable)`);
    }
  }
  return "Uploaded files:\n" + lines.join("\n");
}

// ---------------------------------------------------------------------------
// delete_asset
// ---------------------------------------------------------------------------

export async function toolDeleteAsset(input, broadcast) {
  const filename = input.filename || "";
  if (!filename) return "Error: filename is required.";
  try {
    // Delete from storage
    await storage.deleteUpload(filename);
    // Notify the UI to remove the asset from the asset list
    broadcast({ type: "asset_deleted_by_agent", filename });
    return `Asset "${filename}" has been deleted.`;
  } catch (e) {
    return `Error deleting asset: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// search_code
// ---------------------------------------------------------------------------

export async function toolSearchCode(input, _broadcast) {
  const query = input.query || "";
  if (!query) return "Error: 'query' is required.";
  const caseSensitive = input.case_sensitive ?? false;
  const maxResults = Math.min(input.max_results || 50, 200);

  const results = [];
  // Escape regex special characters so literal strings like "clearColor(-1.0" work
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const searchRe = caseSensitive ? new RegExp(escaped, "g") : new RegExp(escaped, "gi");

  // Search through workspace JSON files (scene.json, etc.)
  for (const filename of WORKSPACE_FILES) {
    let data;
    try { data = await storage.readJson(filename); } catch { continue; }

    // Recursively search string values
    const searchObj = (obj, path) => {
      if (results.length >= maxResults) return;
      if (typeof obj === "string") {
        const lines = obj.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) return;
          if (searchRe.test(lines[i])) {
            searchRe.lastIndex = 0;
            results.push({ file: filename, section: path, line: i + 1, text: lines[i].trim() });
          }
        }
      } else if (obj && typeof obj === "object") {
        for (const [key, value] of Object.entries(obj)) {
          if (results.length >= maxResults) return;
          searchObj(value, path ? `${path}.${key}` : key);
        }
      }
    };
    searchObj(data, "");
  }

  // Search through .workspace/* text files
  try {
    const allFiles = await storage.listFiles(".workspace/");
    for (const filePath of allFiles) {
      if (results.length >= maxResults) break;
      try {
        const content = await storage.readTextFile(filePath);
        if (typeof content !== "string") continue;
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;
          if (searchRe.test(lines[i])) {
            searchRe.lastIndex = 0;
            results.push({ file: filePath, line: i + 1, text: lines[i].trim() });
          }
        }
      } catch { continue; }
    }
  } catch { /* no .workspace files */ }

  if (!results.length) return `No matches found for "${query}".`;

  const lines = results.map((r) => {
    const loc = r.section ? `${r.file} → ${r.section}:${r.line}` : `${r.file}:${r.line}`;
    return `  ${loc}  ${r.text}`;
  });
  const header = `Found ${results.length}${results.length >= maxResults ? "+" : ""} match(es) for "${query}":`;
  return header + "\n" + lines.join("\n");
}

// ---------------------------------------------------------------------------
// unzip_asset
// ---------------------------------------------------------------------------

export async function toolUnzipAsset(input, broadcast) {
  const filename = input.filename;
  if (!filename) return "Error: 'filename' is required.";
  const prefix = input.prefix || "";

  try {
    const entry = await storage.readUpload(filename);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(entry.data);

    const extracted = [];
    const promises = [];

    zip.forEach((relPath, file) => {
      if (file.dir) return; // skip directories
      const saveName = prefix + relPath;
      promises.push(
        file.async("arraybuffer").then(async (buf) => {
          // Guess MIME type from extension
          const ext = relPath.split(".").pop()?.toLowerCase() || "";
          const mimeMap = {
            png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
            gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
            mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
            wav: "audio/wav", ogg: "audio/ogg", json: "application/json",
            txt: "text/plain", csv: "text/csv", obj: "text/plain",
            glb: "model/gltf-binary", gltf: "model/gltf+json",
          };
          const mime = mimeMap[ext] || "application/octet-stream";
          await storage.saveUpload(saveName, buf, mime);
          extracted.push(saveName);
        })
      );
    });

    await Promise.all(promises);
    broadcast({ type: "uploads_changed" });
    return `ok — extracted ${extracted.length} files:\n${extracted.join("\n")}`;
  } catch (err) {
    return `Error extracting ZIP: ${err.message || String(err)}`;
  }
}
