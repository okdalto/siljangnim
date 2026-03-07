/**
 * IndexedDB storage layer — replaces workspace.py + projects.py.
 *
 * DB: "siljangnim"
 * Stores: files, projects, blobs
 *
 * "files" store: per-project workspace files (scene.json, ui_config.json, etc.)
 *   key: `${projectName}/${filename}`
 *
 * "projects" store: project metadata
 *   key: project name (sanitized)
 *
 * "blobs" store: uploaded binary files
 *   key: `${projectName}/uploads/${filename}`
 */

const DB_NAME = "siljangnim";
const DB_VERSION = 1;
const STORE_FILES = "files";
const STORE_PROJECTS = "projects";
const STORE_BLOBS = "blobs";

// ---------------------------------------------------------------------------
// Default scene / UI config
// ---------------------------------------------------------------------------

export const DEFAULT_SCENE_JSON = {
  version: 1,
  render_mode: "script",
  script: {
    setup:
      "const gl = ctx.gl;\n" +
      "const prog = ctx.utils.createProgram(\n" +
      "  ctx.utils.DEFAULT_QUAD_VERTEX_SHADER,\n" +
      "  `#version 300 es\n" +
      "precision highp float;\n" +
      "in vec2 v_uv;\n" +
      "uniform float u_time;\n" +
      "out vec4 fragColor;\n" +
      "void main() {\n" +
      "  vec2 uv = v_uv;\n" +
      "  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0.0, 2.0, 4.0));\n" +
      "  fragColor = vec4(col, 1.0);\n" +
      "}\n" +
      "`);\n" +
      "const quad = ctx.utils.createQuadGeometry();\n" +
      "const vao = gl.createVertexArray();\n" +
      "gl.bindVertexArray(vao);\n" +
      "const buf = gl.createBuffer();\n" +
      "gl.bindBuffer(gl.ARRAY_BUFFER, buf);\n" +
      "gl.bufferData(gl.ARRAY_BUFFER, quad.positions, gl.STATIC_DRAW);\n" +
      "const loc = gl.getAttribLocation(prog, 'a_position');\n" +
      "gl.enableVertexAttribArray(loc);\n" +
      "gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);\n" +
      "gl.bindVertexArray(null);\n" +
      "ctx.state.prog = prog;\n" +
      "ctx.state.vao = vao;\n" +
      "ctx.state.buf = buf;\n",
    render:
      "const gl = ctx.gl;\n" +
      "gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);\n" +
      "gl.clearColor(0.08, 0.08, 0.12, 1.0);\n" +
      "gl.clear(gl.COLOR_BUFFER_BIT);\n" +
      "gl.useProgram(ctx.state.prog);\n" +
      "const tLoc = gl.getUniformLocation(ctx.state.prog, 'u_time');\n" +
      "if (tLoc) gl.uniform1f(tLoc, ctx.time);\n" +
      "gl.bindVertexArray(ctx.state.vao);\n" +
      "gl.drawArrays(gl.TRIANGLES, 0, 6);\n" +
      "gl.bindVertexArray(null);\n",
    cleanup:
      "const gl = ctx.gl;\n" +
      "gl.deleteProgram(ctx.state.prog);\n" +
      "gl.deleteVertexArray(ctx.state.vao);\n" +
      "gl.deleteBuffer(ctx.state.buf);\n",
  },
  uniforms: {},
  clearColor: [0.08, 0.08, 0.12, 1.0],
};

export const DEFAULT_UI_CONFIG = { controls: [], inspectable_buffers: [] };

// ---------------------------------------------------------------------------
// Active project pointer (survives page reload)
// ---------------------------------------------------------------------------

const ACTIVE_PROJECT_KEY = "siljangnim:activeProject";
const DEFAULT_PROJECT = "_untitled";

export function getActiveProjectName() {
  return localStorage.getItem(ACTIVE_PROJECT_KEY) || DEFAULT_PROJECT;
}

export function setActiveProjectName(name) {
  localStorage.setItem(ACTIVE_PROJECT_KEY, name || DEFAULT_PROJECT);
}

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES);
      }
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS);
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(storeName, mode = "readonly") {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// File key helpers
// ---------------------------------------------------------------------------

function fileKey(filename) {
  return `${getActiveProjectName()}/${filename}`;
}

function blobKey(filename) {
  return `${getActiveProjectName()}/uploads/${filename}`;
}

// ---------------------------------------------------------------------------
// Workspace file I/O (JSON)
// ---------------------------------------------------------------------------

export async function readJson(filename) {
  const store = await tx(STORE_FILES);
  const data = await idbReq(store.get(fileKey(filename)));
  if (data === undefined) throw new Error(`File not found: ${filename}`);
  return data;
}

export async function writeJson(filename, data) {
  const store = await tx(STORE_FILES, "readwrite");
  await idbReq(store.put(data, fileKey(filename)));
}

export async function readFile(filename) {
  return readJson(filename);
}

export async function writeFile(filename, content) {
  return writeJson(filename, content);
}

export async function deleteFile(filename) {
  const store = await tx(STORE_FILES, "readwrite");
  await idbReq(store.delete(fileKey(filename)));
}

export async function listFiles(prefix = "") {
  const store = await tx(STORE_FILES);
  const allKeys = await idbReq(store.getAllKeys());
  const projectPrefix = `${getActiveProjectName()}/`;
  const full = prefix ? `${projectPrefix}${prefix}` : projectPrefix;
  return allKeys
    .filter((k) => k.startsWith(full))
    .map((k) => k.slice(projectPrefix.length));
}

// ---------------------------------------------------------------------------
// Text file I/O (for .workspace/* files — stored as strings)
// ---------------------------------------------------------------------------

export async function readTextFile(filename) {
  const store = await tx(STORE_FILES);
  const data = await idbReq(store.get(fileKey(filename)));
  if (data === undefined) throw new Error(`File not found: ${filename}`);
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

export async function writeTextFile(filename, content) {
  const store = await tx(STORE_FILES, "readwrite");
  await idbReq(store.put(content, fileKey(filename)));
}

// ---------------------------------------------------------------------------
// Upload (blob) I/O
// ---------------------------------------------------------------------------

export async function saveUpload(filename, arrayBuffer, mimeType) {
  const store = await tx(STORE_BLOBS, "readwrite");
  await idbReq(
    store.put({ data: arrayBuffer, mimeType, size: arrayBuffer.byteLength }, blobKey(filename))
  );
}

export async function readUpload(filename) {
  const store = await tx(STORE_BLOBS);
  const entry = await idbReq(store.get(blobKey(filename)));
  if (!entry) throw new Error(`Upload not found: ${filename}`);
  return entry; // { data: ArrayBuffer, mimeType, size }
}

export async function listUploads() {
  const store = await tx(STORE_BLOBS);
  const allKeys = await idbReq(store.getAllKeys());
  const prefix = `${getActiveProjectName()}/uploads/`;
  return allKeys
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

export async function getUploadInfo(filename) {
  const store = await tx(STORE_BLOBS);
  const entry = await idbReq(store.get(blobKey(filename)));
  if (!entry) throw new Error(`Upload not found: ${filename}`);
  return {
    filename,
    size: entry.size,
    mime_type: entry.mimeType || "application/octet-stream",
  };
}

// ---------------------------------------------------------------------------
// Project management
// ---------------------------------------------------------------------------

function sanitizeName(name) {
  let s = name.trim().toLowerCase();
  s = s.replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "untitled";
}

export async function saveProject(name, chatHistory, description = "", thumbnailB64 = null) {
  const sanitized = sanitizeName(name);
  const currentName = getActiveProjectName();
  const now = new Date().toISOString();

  // Determine target name (versioning)
  const store = await tx(STORE_PROJECTS);
  const existing = await idbReq(store.get(sanitized));
  let targetName = sanitized;
  if (existing) {
    let counter = 1;
    const ps = await tx(STORE_PROJECTS);
    while (await idbReq(ps.get(`${sanitized}_${counter}`))) {
      counter++;
      // Re-open store since transaction may have completed
    }
    targetName = `${sanitized}_${counter}`;
  }

  // Copy files from current project to new target
  if (targetName !== currentName) {
    const filesStore = await tx(STORE_FILES);
    const allKeys = await idbReq(filesStore.getAllKeys());
    const srcPrefix = `${currentName}/`;
    const dstPrefix = `${targetName}/`;
    const keysToMove = allKeys.filter((k) => k.startsWith(srcPrefix));

    const writeStore = await tx(STORE_FILES, "readwrite");
    for (const key of keysToMove) {
      const data = await idbReq((await tx(STORE_FILES)).get(key));
      const newKey = dstPrefix + key.slice(srcPrefix.length);
      const ws = await tx(STORE_FILES, "readwrite");
      await idbReq(ws.put(data, newKey));
    }

    // Copy blobs
    const blobStore = await tx(STORE_BLOBS);
    const allBlobKeys = await idbReq(blobStore.getAllKeys());
    const blobSrcPrefix = `${currentName}/`;
    const blobDstPrefix = `${targetName}/`;
    const blobKeysToMove = allBlobKeys.filter((k) => k.startsWith(blobSrcPrefix));
    for (const key of blobKeysToMove) {
      const data = await idbReq((await tx(STORE_BLOBS)).get(key));
      const newKey = blobDstPrefix + key.slice(blobSrcPrefix.length);
      const ws = await tx(STORE_BLOBS, "readwrite");
      await idbReq(ws.put(data, newKey));
    }

    // For first save from _untitled, remove old _untitled files
    if (currentName === DEFAULT_PROJECT) {
      for (const key of keysToMove) {
        const ws = await tx(STORE_FILES, "readwrite");
        await idbReq(ws.delete(key));
      }
      for (const key of blobKeysToMove) {
        const ws = await tx(STORE_BLOBS, "readwrite");
        await idbReq(ws.delete(key));
      }
    }
  }

  // Save chat history
  const chatStore = await tx(STORE_FILES, "readwrite");
  await idbReq(chatStore.put(chatHistory, `${targetName}/chat_history.json`));

  // Save thumbnail
  let hasThumbnail = false;
  if (thumbnailB64) {
    try {
      const b64 = thumbnailB64.includes(",") ? thumbnailB64.split(",")[1] : thumbnailB64;
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const thumbStore = await tx(STORE_BLOBS, "readwrite");
      await idbReq(
        thumbStore.put(
          { data: bytes.buffer, mimeType: "image/jpeg", size: bytes.length },
          `${targetName}/thumbnail.jpg`
        )
      );
      hasThumbnail = true;
    } catch {
      /* ignore */
    }
  }

  // Build display_name
  let displayName = name.trim();
  if (targetName !== sanitized && existing) {
    const baseDisplay = existing.display_name || name.trim();
    const suffix = targetName.slice(sanitized.length);
    displayName = baseDisplay.replace(/_\d+$/, "") + suffix;
  }

  const meta = {
    name: targetName,
    display_name: displayName,
    description,
    created_at: existing?.created_at || now,
    updated_at: now,
    has_thumbnail: hasThumbnail,
  };

  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.put(meta, targetName));

  setActiveProjectName(targetName);
  return meta;
}

export async function loadProject(name) {
  const sanitized = sanitizeName(name);
  const store = await tx(STORE_PROJECTS);
  const meta = await idbReq(store.get(sanitized));
  if (!meta) throw new Error(`Project not found: ${name}`);

  setActiveProjectName(sanitized);

  const prefix = `${sanitized}/`;

  // Read project files
  let sceneJson = {};
  let uiConfig = DEFAULT_UI_CONFIG;
  let workspaceState = {};
  let panels = {};
  let chatHistory = [];
  let debugLogs = [];

  try { sceneJson = await readJson("scene.json"); } catch { /* empty */ }
  try { uiConfig = await readJson("ui_config.json"); } catch { /* empty */ }
  try { workspaceState = await readJson("workspace_state.json"); } catch { /* empty */ }
  try { panels = await readJson("panels.json"); } catch { /* empty */ }
  try {
    const fs = await tx(STORE_FILES);
    chatHistory = (await idbReq(fs.get(`${sanitized}/chat_history.json`))) || [];
  } catch { /* empty */ }
  try { debugLogs = await readJson("debug_logs.json"); } catch { /* empty */ }

  // Fallback: create default controls panel if none exists
  if (!panels || Object.keys(panels).length === 0) {
    if (uiConfig?.controls?.length) {
      panels = {
        controls: {
          title: "Controls",
          controls: uiConfig.controls,
          width: 320,
          height: 300,
        },
      };
      await writeJson("panels.json", panels);
    }
  }

  return {
    meta,
    chat_history: chatHistory,
    scene_json: sceneJson,
    ui_config: uiConfig,
    workspace_state: workspaceState,
    panels,
    debug_logs: debugLogs,
  };
}

export async function listProjects() {
  const store = await tx(STORE_PROJECTS);
  const allKeys = await idbReq(store.getAllKeys());
  const projects = [];
  for (const key of allKeys) {
    const ps = await tx(STORE_PROJECTS);
    const meta = await idbReq(ps.get(key));
    if (meta) projects.push(meta);
  }
  projects.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  return projects;
}

export async function deleteProject(name) {
  const sanitized = sanitizeName(name);
  const currentName = getActiveProjectName();

  // Delete project meta
  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.delete(sanitized));

  // Delete all files
  const filesStore = await tx(STORE_FILES);
  const allKeys = await idbReq(filesStore.getAllKeys());
  const prefix = `${sanitized}/`;
  for (const key of allKeys.filter((k) => k.startsWith(prefix))) {
    const ws = await tx(STORE_FILES, "readwrite");
    await idbReq(ws.delete(key));
  }

  // Delete all blobs
  const blobStore = await tx(STORE_BLOBS);
  const allBlobKeys = await idbReq(blobStore.getAllKeys());
  for (const key of allBlobKeys.filter((k) => k.startsWith(prefix))) {
    const ws = await tx(STORE_BLOBS, "readwrite");
    await idbReq(ws.delete(key));
  }

  // If deleted project was active, switch to _untitled
  if (currentName === sanitized) {
    await newUntitledWorkspace();
  }
}

export async function renameProject(oldName, newDisplayName) {
  const sanitized = sanitizeName(oldName);
  const store = await tx(STORE_PROJECTS);
  const meta = await idbReq(store.get(sanitized));
  if (!meta) throw new Error(`Project not found: ${oldName}`);

  meta.display_name = newDisplayName.trim() || meta.display_name;
  meta.updated_at = new Date().toISOString();

  const ws = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(ws.put(meta, sanitized));
  return meta;
}

export async function newUntitledWorkspace() {
  const prefix = `${DEFAULT_PROJECT}/`;

  // Clear all _untitled files
  const filesStore = await tx(STORE_FILES);
  const allKeys = await idbReq(filesStore.getAllKeys());
  for (const key of allKeys.filter((k) => k.startsWith(prefix))) {
    const ws = await tx(STORE_FILES, "readwrite");
    await idbReq(ws.delete(key));
  }

  // Clear all _untitled blobs
  const blobStore = await tx(STORE_BLOBS);
  const allBlobKeys = await idbReq(blobStore.getAllKeys());
  for (const key of allBlobKeys.filter((k) => k.startsWith(prefix))) {
    const ws = await tx(STORE_BLOBS, "readwrite");
    await idbReq(ws.delete(key));
  }

  setActiveProjectName(DEFAULT_PROJECT);
}

// ---------------------------------------------------------------------------
// Project export/import (ZIP)
// ---------------------------------------------------------------------------

export async function exportProjectZip(name, { includeChat = true } = {}) {
  // Simple implementation: serialize all project data as JSON
  const sanitized = sanitizeName(name);
  const store = await tx(STORE_PROJECTS);
  const meta = await idbReq(store.get(sanitized));
  if (!meta) throw new Error(`Project not found: ${name}`);

  const filesStore = await tx(STORE_FILES);
  const allKeys = await idbReq(filesStore.getAllKeys());
  const prefix = `${sanitized}/`;
  const files = {};
  for (const key of allKeys.filter((k) => k.startsWith(prefix))) {
    const relPath = key.slice(prefix.length);
    if (!includeChat && relPath === "chat_history.json") continue;
    const fs = await tx(STORE_FILES);
    files[relPath] = await idbReq(fs.get(key));
  }

  return JSON.stringify({ meta, files }, null, 2);
}

export async function importProjectZip(jsonStr) {
  const { meta, files } = JSON.parse(jsonStr);
  const sanitized = sanitizeName(meta.name || "imported");

  // Resolve name conflicts
  let candidate = sanitized;
  let counter = 2;
  const ps = await tx(STORE_PROJECTS);
  while (await idbReq(ps.get(candidate))) {
    candidate = `${sanitized}-${counter}`;
    counter++;
  }

  meta.name = candidate;
  meta.updated_at = new Date().toISOString();

  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.put(meta, candidate));

  for (const [filename, data] of Object.entries(files)) {
    const ws = await tx(STORE_FILES, "readwrite");
    await idbReq(ws.put(data, `${candidate}/${filename}`));
  }

  return meta;
}

// ---------------------------------------------------------------------------
// File listing with metadata (for file browser)
// ---------------------------------------------------------------------------

function guessMimeType(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const mimes = {
    json: "application/json", js: "text/javascript", glsl: "text/plain",
    txt: "text/plain", html: "text/html", css: "text/css",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
    mp4: "video/mp4", webm: "video/webm",
  };
  return mimes[ext] || "application/octet-stream";
}

async function _listFilesDetailed(projectName) {
  const prefix = `${projectName}/`;
  const results = [];

  // Files store (JSON objects / strings)
  const filesStore = await tx(STORE_FILES);
  const fileKeys = await idbReq(filesStore.getAllKeys());
  for (const key of fileKeys.filter((k) => k.startsWith(prefix))) {
    const path = key.slice(prefix.length);
    const fs = await tx(STORE_FILES);
    const data = await idbReq(fs.get(key));
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    results.push({
      path,
      name: path.split("/").pop(),
      size: new Blob([text]).size,
      mime_type: guessMimeType(path),
    });
  }

  // Blobs store (uploads)
  const blobStore = await tx(STORE_BLOBS);
  const blobKeys = await idbReq(blobStore.getAllKeys());
  for (const key of blobKeys.filter((k) => k.startsWith(prefix))) {
    const path = key.slice(prefix.length);
    if (path === "thumbnail.jpg") continue;
    const bs = await tx(STORE_BLOBS);
    const entry = await idbReq(bs.get(key));
    if (entry) {
      results.push({
        path,
        name: path.split("/").pop(),
        size: entry.size || 0,
        mime_type: entry.mimeType || guessMimeType(path),
      });
    }
  }
  return results;
}

export function listWorkspaceFilesDetailed() {
  return _listFilesDetailed(getActiveProjectName());
}

export function listProjectFilesDetailed(name) {
  return _listFilesDetailed(sanitizeName(name));
}

async function _readFileAsBlob(projectName, filepath) {
  // Try blobs store first
  const bs = await tx(STORE_BLOBS);
  const blobEntry = await idbReq(bs.get(`${projectName}/${filepath}`));
  if (blobEntry) {
    return new Blob([blobEntry.data], { type: blobEntry.mimeType || "application/octet-stream" });
  }

  // Try files store
  const fs = await tx(STORE_FILES);
  const data = await idbReq(fs.get(`${projectName}/${filepath}`));
  if (data !== undefined) {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return new Blob([text], { type: guessMimeType(filepath) });
  }
  throw new Error(`File not found: ${filepath}`);
}

export function readWorkspaceFileAsBlob(filepath) {
  return _readFileAsBlob(getActiveProjectName(), filepath);
}

export function readProjectFileAsBlob(name, filepath) {
  return _readFileAsBlob(sanitizeName(name), filepath);
}

// ---------------------------------------------------------------------------
// Thumbnail reading (for project browser)
// ---------------------------------------------------------------------------

export async function readThumbnailUrl(projectName) {
  try {
    const store = await tx(STORE_BLOBS);
    const entry = await idbReq(store.get(`${sanitizeName(projectName)}/thumbnail.jpg`));
    if (!entry) return null;
    const blob = new Blob([entry.data], { type: entry.mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ensure default panels helper
// ---------------------------------------------------------------------------

export async function ensureDefaultPanels(uiConfig) {
  let panels;
  try {
    panels = await readJson("panels.json");
  } catch {
    panels = {};
  }

  if (!panels || Object.keys(panels).length === 0) {
    if (uiConfig?.controls?.length) {
      panels = {
        controls: {
          title: "Controls",
          controls: uiConfig.controls,
          width: 320,
          height: 300,
        },
      };
      await writeJson("panels.json", panels);
    }
  }
  return panels;
}
