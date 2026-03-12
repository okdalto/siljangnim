/**
 * Tool handlers — ported from handlers.py.
 * Removed: run_python, run_command (browser-incompatible).
 * Uses storage.js for IndexedDB I/O.
 */

import * as storage from "./storage.js";
import { deepClone } from "../utils/objectUtils.js";

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
// Scene JSON validation
// ---------------------------------------------------------------------------

function normalizeScriptStrings(scene) {
  const script = scene?.script;
  if (!script || typeof script !== "object") return;
  for (const key of ["setup", "render", "cleanup"]) {
    if (typeof script[key] === "string") {
      script[key] = script[key].replace(/\t/g, "    ");
    }
  }
}

function validateSceneJson(scene) {
  const errors = [];
  if (!scene || typeof scene !== "object") return ["Scene JSON is not an object"];
  const script = scene.script;
  if (!script || typeof script !== "object") {
    errors.push("Missing 'script' object in scene JSON");
    return errors;
  }
  if (!script.render) {
    errors.push("Missing 'script.render' code in scene JSON");
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Nested object helpers (dot-path)
// ---------------------------------------------------------------------------

function getNested(obj, path) {
  const keys = path.split(".");
  let cur = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== "object") throw new Error(`Cannot traverse into non-object at '${key}'`);
    if (!(key in cur)) throw new Error(`Key '${key}' not found`);
    cur = cur[key];
  }
  return cur;
}

function setNested(obj, path, value) {
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

function deleteNested(obj, path) {
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

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolReadFile(input, broadcast) {
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

async function toolWriteScene(input, broadcast) {
  const scene = { version: 1, render_mode: "script", script: {} };

  for (const key of ["setup", "render", "cleanup"]) {
    if (input[key]) scene.script[key] = input[key];
  }

  if (!scene.script.render) return "Error: 'render' is required.";

  if (input.uniforms) scene.uniforms = input.uniforms;
  if (input.clearColor) scene.clearColor = input.clearColor;
  if (input.backendTarget) scene.backendTarget = input.backendTarget;

  normalizeScriptStrings(scene);
  const errors = validateSceneJson(scene);
  if (errors.length) return "Validation errors:\n" + errors.map((e) => `  - ${e}`).join("\n");

  await storage.writeJson("scene.json", scene);
  broadcast({ type: "scene_update", scene_json: scene });
  // Sync backend target so subsequent agent turns use the correct prompt sections
  if (scene.backendTarget) {
    broadcast({ type: "set_backend_target", backendTarget: scene.backendTarget });
  }
  return "ok — scene saved and broadcast. Errors will be reported automatically if setup fails. You may still call check_browser_errors for runtime verification.";
}

async function toolWriteFile(input, broadcast) {
  const relPath = input.path || "";
  if (!relPath) return "Error: 'path' is required.";
  const rawContent = input.content;
  const rawEdits = input.edits;

  if (rawContent == null && rawEdits == null) {
    return "Error: either 'content' or 'edits' is required.";
  }

  const isWorkspaceFile = WORKSPACE_FILES.has(relPath);
  const isUnderWorkspaceDir = relPath.startsWith(".workspace/");

  if (!isWorkspaceFile && !isUnderWorkspaceDir) {
    return "Write access denied. Only workspace files and .workspace/ are writable in browser mode.";
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

async function toolListUploadedFiles(input, broadcast) {
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

async function toolDeleteAsset(input, broadcast) {
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

async function toolListFiles(input, broadcast) {
  const prefix = input.path || "";
  const files = await storage.listFiles(prefix);
  if (!files.length) return "No workspace files found.";
  return "Workspace files:\n" + files.map((f) => `  ${f}`).join("\n");
}

async function toolSearchCode(input, _broadcast) {
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

async function toolOpenPanel(input, broadcast) {
  const panelId = input.id || "";
  const title = input.title || "Panel";
  const html = input.html || "";
  const template = input.template || "";
  const configObj = input.config || {};
  const width = input.width || 320;
  const height = input.height || 300;

  if (!panelId) return "Error: 'id' is required.";

  // Native controls mode
  if (template === "controls") {
    const controls = configObj.controls || [];
    if (!controls.length) return "Error: config.controls array is required for template='controls'.";

    const panelData = {
      type: "open_panel",
      id: panelId,
      title,
      controls,
      width,
      height,
    };
    broadcast(panelData);

    // Persist to panels.json
    let panels = {};
    try { panels = await storage.readJson("panels.json"); } catch { /* empty */ }
    panels[panelId] = { title, controls, width, height };
    await storage.writeJson("panels.json", panels);
    return `ok — native controls panel '${panelId}' opened.`;
  }

  const url = input.url || "";

  if (!html && !url && !template) return "Error: 'html', 'url', or 'template' is required.";

  // URL panel mode
  if (url) {
    // Validate URL scheme — only allow http(s)
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return `Error: only http/https URLs are allowed (got '${parsed.protocol}').`;
      }
    } catch {
      return `Error: invalid URL '${url}'.`;
    }
    const panelMsg = {
      type: "open_panel",
      id: panelId,
      title,
      url,
      width,
      height,
    };
    broadcast(panelMsg);

    let panels = {};
    try { panels = await storage.readJson("panels.json"); } catch { /* empty */ }
    panels[panelId] = { title, url, width, height };
    await storage.writeJson("panels.json", panels);
    return `ok — URL panel '${panelId}' opened.`;
  }

  // HTML panel mode
  const panelMsg = {
    type: "open_panel",
    id: panelId,
    title,
    html: html || "",
    width,
    height,
  };
  broadcast(panelMsg);

  let panels = {};
  try { panels = await storage.readJson("panels.json"); } catch { /* empty */ }
  panels[panelId] = { title, html: html || "", width, height };
  await storage.writeJson("panels.json", panels);
  return `ok — panel '${panelId}' opened.`;
}

async function toolClosePanel(input, broadcast) {
  const panelId = input.id || "";
  if (!panelId) return "Error: 'id' is required.";
  broadcast({ type: "close_panel", id: panelId });
  try {
    const panels = await storage.readJson("panels.json");
    if (panelId in panels) {
      delete panels[panelId];
      await storage.writeJson("panels.json", panels);
    }
  } catch { /* ignore */ }
  return `ok — panel '${panelId}' closed.`;
}

async function toolStartRecording(input, broadcast, recordingDonePromise) {
  const resetTimeline = input.resetTimeline !== false;
  const msg = { type: "start_recording" };
  if (input.duration != null) msg.duration = input.duration;
  if (input.fps != null) msg.fps = input.fps;
  if (resetTimeline) msg.resetTimeline = true;
  broadcast(msg);
  const durationStr = input.duration ? ` for ${input.duration}s` : "";

  // If duration is specified and we have a promise factory, wait for recording to finish
  if (input.duration != null && recordingDonePromise) {
    const promise = recordingDonePromise();
    await promise;
    return `ok — recording finished (${input.duration}s)${resetTimeline ? " (timeline was reset to 0)" : ""}.`;
  }
  return `ok — recording started${durationStr}${resetTimeline ? " (timeline reset to 0)" : ""}.`;
}

async function toolStopRecording(input, broadcast) {
  broadcast({ type: "stop_recording" });
  return "ok — recording stopped. The WebM file will auto-download in the user's browser.";
}

/**
 * Check browser errors tool.
 * The agentEngine collects errors from console_error messages and provides
 * them through the errorCollector interface.
 */
// ---------------------------------------------------------------------------
// Structured error parsing
// ---------------------------------------------------------------------------

function parseError(errorMsg) {
  const parsed = { raw: errorMsg, type: "unknown", summary: "" };

  // WebGPU validation errors
  const gpuMatch = errorMsg.match(/\[WebGPU (\w+)\] (.+)/);
  if (gpuMatch) {
    parsed.type = "webgpu_validation";
    parsed.summary = `[webgpu_${gpuMatch[1]}] ${gpuMatch[2].slice(0, 120)}`;
    return parsed;
  }

  // WGSL shader compilation errors
  const wgslMatch = errorMsg.match(/(?:Shader|WGSL).*?(?:error|Error).*?:(\d+):(\d+).*?(?:error:\s*)?(.+)/s);
  if (wgslMatch) {
    parsed.type = "wgsl_compilation";
    parsed.summary = `[wgsl] Line ${wgslMatch[1]}:${wgslMatch[2]}: ${wgslMatch[3].split("\n")[0].trim()}`;
    return parsed;
  }

  // GLSL shader compilation errors (e.g., "ERROR: 0:45: 'fragColor' : undeclared identifier")
  const glslMatch = errorMsg.match(/ERROR:\s*(\d+):(\d+):\s*(.+)/);
  if (glslMatch) {
    parsed.type = "shader_compilation";
    parsed.summary = `[glsl] Line ${glslMatch[2]}: ${glslMatch[3].trim()}`;
    return parsed;
  }

  // Standard JS errors: TypeError, ReferenceError, SyntaxError
  const jsMatch = errorMsg.match(/(TypeError|ReferenceError|SyntaxError):\s*(.+?)(?:\n|$)/);
  if (jsMatch) {
    parsed.type = jsMatch[1].toLowerCase();
    const locMatch = errorMsg.match(/at (\w+) .*?:(\d+):(\d+)/);
    if (locMatch) {
      parsed.summary = `[${parsed.type}] '${jsMatch[2].trim()}' at ${locMatch[1]}:${locMatch[2]}`;
    } else {
      parsed.summary = `[${parsed.type}] ${jsMatch[2].trim()}`;
    }
    return parsed;
  }

  // Fallback: first meaningful line
  parsed.summary = errorMsg.split("\n")[0].slice(0, 120);
  return parsed;
}

async function toolCheckBrowserErrors(input, broadcast, errorCollector) {
  // Wait up to 3 seconds for errors to arrive (waits for scene load first)
  const errors = await errorCollector.waitForErrors(3000);

  // Second short wait to catch late-arriving WebGPU validation errors
  // (GPU shader compilation and pipeline creation are async)
  if (!errors.length || errorCollector._setupReady === false) {
    await new Promise((r) => setTimeout(r, 800));
    const late = errorCollector.errors.splice(0);
    for (const e of late) {
      if (!errors.includes(e)) errors.push(e);
    }
  }

  // Also consume any pending WebGPU validation errors from the renderer
  // (these are captured by the uncapturederror handler but may not have
  // been forwarded to console.error yet, e.g. during render loop)
  const engine = errorCollector._engineRef?.current;
  const renderer = engine?._backend;
  if (renderer?.consumeValidationErrors) {
    const gpuErrors = renderer.consumeValidationErrors();
    for (const e of gpuErrors) {
      const msg = `[WebGPU ${e.type}] ${e.message}`;
      if (!errors.includes(msg)) errors.push(msg);
    }
  }

  const parts = [];

  // Report setup status — helps diagnose white screens with "no errors"
  if (errorCollector._setupReady === false) {
    parts.push("⚠ Scene setup() FAILED — the render loop is NOT running. Check the errors below or verify your setup code.");
  }

  if (errors.length) {
    const engineErrs = errors.filter((e) => e.startsWith("[engine]"));
    const scriptErrs = errors.filter((e) => !e.startsWith("[engine]"));

    if (scriptErrs.length) {
      // Provide structured summary first, then raw errors
      const parsed = scriptErrs.map(parseError);
      const summaryLines = parsed.map((p, i) => `  ${i + 1}. ${p.summary}`);
      parts.push(
        `Script errors (${scriptErrs.length}) — structured summary:\n${summaryLines.join("\n")}\n\n` +
        `Raw errors:\n${scriptErrs.map((e) => `  - ${e}`).join("\n")}`
      );
    }
    if (engineErrs.length) {
      parts.push("Engine/infrastructure errors (NOT caused by your script — do NOT try to fix these):\n" + engineErrs.map((e) => `  - ${e}`).join("\n"));
    }
  }

  if (!parts.length) {
    // Improvement #8: store success pattern when scene runs without errors
    try {
      const scene = await storage.readJson("scene.json");
      if (scene?.script?.render) storeSuccessPattern(scene);
    } catch { /* ignore */ }
    return "No browser errors detected. Setup succeeded and render loop is running.";
  }
  return parts.join("\n\n");
}

/**
 * Ask user tool — returns a promise that resolves when the user answers.
 */
async function toolAskUser(input, broadcast, userAnswerPromise) {
  const question = input.question || "";
  const options = input.options || [];

  broadcast({
    type: "agent_question",
    question,
    options,
  });

  // Wait for user response
  const answer = await userAnswerPromise();
  return `The user answered: ${answer}`;
}

async function toolRunPreprocess(input, broadcast, preprocessPromise) {
  const code = input.code;
  if (!code) return "Error: 'code' parameter is required.";

  // Send code to dispatcher, which runs it in GLEngine
  broadcast({ type: "run_preprocess", code });

  // Wait for result from the engine
  try {
    const result = await preprocessPromise();
    if (result === undefined || result === null) return "ok — preprocess completed (no return value).";
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  } catch (err) {
    return `Error during preprocess: ${err.message || String(err)}`;
  }
}

async function toolWebFetch(input) {
  const url = input.url;
  if (!url || typeof url !== "string") return "Error: 'url' is required.";
  const maxLen = input.max_length ?? 50000;
  try {
    // Use server-side proxy to avoid CORS restrictions
    const resp = await fetch("/api/proxy?target=fetch", {
      method: "POST",
      headers: { "x-fetch-url": url },
    });
    if (!resp.ok) return `Error: HTTP ${resp.status} ${resp.statusText}`;
    const contentType = resp.headers.get("content-type") || "";
    let text = await resp.text();

    // Strip HTML tags for readability if it's an HTML page
    if (contentType.includes("text/html")) {
      // Parse with DOMParser for clean text extraction
      const doc = new DOMParser().parseFromString(text, "text/html");
      // Remove script/style elements
      for (const el of doc.querySelectorAll("script, style, nav, footer, header")) {
        el.remove();
      }
      text = doc.body?.innerText || doc.body?.textContent || text;
      // Collapse whitespace
      text = text.replace(/\n{3,}/g, "\n\n").trim();
    }

    if (text.length > maxLen) {
      text = text.slice(0, maxLen) + `\n\n... (truncated at ${maxLen} characters)`;
    }
    return text;
  } catch (err) {
    return `Error fetching URL: ${err.message || String(err)}`;
  }
}

async function toolSetTimeline(input, broadcast) {
  const updates = {};
  if (input.duration != null) updates.duration = Number(input.duration);
  if (input.loop != null) updates.loop = Boolean(input.loop);
  if (Object.keys(updates).length === 0) return "Error: provide at least one of 'duration' or 'loop'.";
  broadcast({ type: "set_timeline", ...updates });
  const parts = [];
  if (updates.duration != null) parts.push(`duration=${updates.duration}s`);
  if (updates.loop != null) parts.push(`loop=${updates.loop}`);
  return `ok — timeline updated: ${parts.join(", ")}.`;
}

async function toolUnzipAsset(input, broadcast) {
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

/**
 * Capture viewport tool — returns base64 JPEG image data.
 * Returns an object with { image: base64string } instead of a plain string,
 * so the executor can build image content blocks for vision-capable models.
 */
async function toolCaptureViewport(input, broadcast, engineRef) {
  const engine = engineRef?.current;
  if (!engine?.canvas) {
    return "Error: No viewport canvas available. Make sure a scene is loaded.";
  }

  const canvas = engine.canvas;

  // For WebGPU, we need the visible (blit target) canvas
  // which is the main canvas — toDataURL works on it after auto-blit
  try {
    const maxDim = 1024;
    let w = Math.min(input.width || canvas.width, maxDim);
    let h = Math.min(input.height || canvas.height, maxDim);

    // If canvas is larger than requested, downscale via offscreen canvas
    let dataUrl;
    if (w < canvas.width || h < canvas.height) {
      // Maintain aspect ratio if only one dimension specified
      if (!input.width && !input.height) {
        const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height, 1);
        w = Math.round(canvas.width * scale);
        h = Math.round(canvas.height * scale);
      }
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const octx = offscreen.getContext("2d");
      octx.drawImage(canvas, 0, 0, w, h);
      dataUrl = offscreen.toDataURL("image/jpeg", 0.8);
    } else {
      dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    }

    // Strip the data:image/jpeg;base64, prefix
    const base64 = dataUrl.split(",")[1];
    if (!base64) return "Error: Failed to capture canvas — empty image data.";

    // Return structured result — the executor will handle this specially
    return { __type: "image", media_type: "image/jpeg", base64, width: w, height: h };
  } catch (err) {
    return `Error capturing viewport: ${err.message}`;
  }
}

async function toolDebugSubagent(input, broadcast, debugSubagentRunner) {
  const errorContext = input.error_context;
  if (!errorContext) return "Error: 'error_context' is required.";
  if (!debugSubagentRunner) return "Error: debug sub-agent is not available in this context.";

  try {
    const result = await debugSubagentRunner(errorContext);
    return result || "Debug sub-agent returned no diagnosis.";
  } catch (err) {
    return `Debug sub-agent failed: ${err.message || String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Improvement #8: Success pattern extraction and storage
// ---------------------------------------------------------------------------

const TECHNIQUE_PATTERNS = [
  [/createPingPong|ping.?pong/i, "ping-pong FBO"],
  [/beginComputePass|computePipeline/i, "compute shader"],
  [/createOrbitCamera|orbit/i, "3D orbit camera"],
  [/noise\.|simplex|perlin/i, "noise functions"],
  [/raymarching|rayMarch|sdf/i, "raymarching/SDF"],
  [/createVerletSystem|verlet/i, "verlet physics"],
  [/bloom|glow/i, "bloom/glow"],
  [/createRenderTarget|framebuffer|FBO/i, "render targets"],
  [/createMesh|geometry/i, "3D mesh"],
  [/texImage2D.*video|video.*texture/i, "video texture"],
  [/ctx\.audio|analyser|fft/i, "audio reactive"],
  [/mediapipe|pose|hand.*track/i, "body tracking"],
  [/particle/i, "particles"],
  [/instanc/i, "instancing"],
];

function extractPatternMetadata(scene) {
  const scripts = [scene.script?.setup || "", scene.script?.render || "", scene.script?.cleanup || ""];
  const combined = scripts.join("\n");
  const techniques = [];
  for (const [re, name] of TECHNIQUE_PATTERNS) {
    if (re.test(combined)) techniques.push(name);
  }
  return {
    backend: scene.backendTarget || "auto",
    techniques,
    uniforms: scene.uniforms ? Object.keys(scene.uniforms) : [],
    scriptSize: combined.length,
    timestamp: Date.now(),
  };
}

/**
 * Store a successful scene pattern for future reference.
 * Called after check_browser_errors confirms no errors.
 */
async function storeSuccessPattern(scene) {
  try {
    const pattern = extractPatternMetadata(scene);
    if (!pattern.techniques.length) return; // no interesting patterns to store

    let patterns = [];
    try {
      const existing = await storage.readTextFile(".workspace/success_patterns.json");
      patterns = JSON.parse(existing);
    } catch { /* empty */ }

    // Keep at most 20 patterns, dedup by techniques signature
    const sig = pattern.techniques.sort().join(",");
    patterns = patterns.filter(p => (p.techniques || []).sort().join(",") !== sig);
    patterns.push(pattern);
    if (patterns.length > 20) patterns = patterns.slice(-20);

    await storage.writeTextFile(".workspace/success_patterns.json", JSON.stringify(patterns, null, 2));
  } catch { /* non-critical, ignore */ }
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const TOOL_HANDLERS = {
  read_file: toolReadFile,
  write_scene: toolWriteScene,
  write_file: toolWriteFile,
  list_uploaded_files: toolListUploadedFiles,
  list_files: toolListFiles,
  search_code: toolSearchCode,
  open_panel: toolOpenPanel,
  close_panel: toolClosePanel,
  start_recording: toolStartRecording,
  stop_recording: toolStopRecording,
  check_browser_errors: toolCheckBrowserErrors,
  ask_user: toolAskUser,
  delete_asset: toolDeleteAsset,
  set_timeline: toolSetTimeline,
  run_preprocess: toolRunPreprocess,
  web_fetch: toolWebFetch,
  unzip_asset: toolUnzipAsset,
  capture_viewport: toolCaptureViewport,
  debug_with_subagent: toolDebugSubagent,
};

/**
 * Execute a tool call and return the result string.
 *
 * @param {string} name - Tool name
 * @param {Object} inputData - Tool input parameters
 * @param {Function} broadcast - Message dispatch function
 * @param {Object} [context] - Additional context (errorCollector, userAnswerPromise)
 * @returns {Promise<string>} Tool result
 */
export async function handleTool(name, inputData, broadcast, context = {}) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) return `Unknown tool: ${name}`;

  // Mark pending scene load so check_browser_errors waits for it
  if ((name === "write_scene" || (name === "write_file" && (inputData.path === "scene.json"))) && context.errorCollector) {
    context.errorCollector.expectSceneLoad();
  }

  if (name === "check_browser_errors") {
    return handler(inputData, broadcast, context.errorCollector);
  }
  if (name === "ask_user") {
    return handler(inputData, broadcast, context.userAnswerPromise);
  }
  if (name === "start_recording") {
    return handler(inputData, broadcast, context.recordingDonePromise);
  }
  if (name === "run_preprocess") {
    return handler(inputData, broadcast, context.preprocessPromise);
  }
  if (name === "capture_viewport") {
    return handler(inputData, broadcast, context.engineRef);
  }
  if (name === "debug_with_subagent") {
    return handler(inputData, broadcast, context.debugSubagentRunner);
  }
  return handler(inputData, broadcast);
}
