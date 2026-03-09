/**
 * IndexedDB storage layer — replaces workspace.py + projects.py.
 *
 * DB: "siljangnim"
 * Stores: files, projects, blobs
 *
 * "files" store: per-project workspace files (scene.json, ui_config.json, etc.)
 *   key: `${projectName}/${filename}`
 *
 * "projects" store: project metadata (v2: siljangnim-project.json manifest)
 *   key: project name (sanitized)
 *
 * "blobs" store: uploaded binary files
 *   key: `${projectName}/uploads/${filename}`
 */

import {
  CURRENT_SCHEMA_VERSION,
  MANIFEST_FILENAME,
  WORKSPACE_MANIFEST_FILENAME,
  createProjectManifest,
  createWorkspaceManifest,
  migrateV1toV2,
  validateManifest,
  validateWorkspaceManifest,
  buildProvenanceLocal,
  buildProvenanceZip,
  isSafeMode,
  trustManifest,
} from "./portableSchema.js";

const DB_NAME = "siljangnim";
const DB_VERSION = 2;
const STORE_FILES = "files";
const STORE_PROJECTS = "projects";
const STORE_BLOBS = "blobs";
const STORE_NODES = "project_nodes";

// ---------------------------------------------------------------------------
// Default scene / UI config
// ---------------------------------------------------------------------------

export const DEFAULT_SCENE_JSON = {
  version: 1,
  render_mode: "script",
  backendTarget: "auto",
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
      // v2: project_nodes store for tree-based version history
      if (!db.objectStoreNames.contains(STORE_NODES)) {
        const nodeStore = db.createObjectStore(STORE_NODES, { keyPath: "id" });
        nodeStore.createIndex("projectName", "projectName", { unique: false });
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

export async function deleteUpload(filename) {
  const store = await tx(STORE_BLOBS, "readwrite");
  const key = blobKey(filename);
  await idbReq(store.delete(key));
}

/**
 * Get blob URLs for all uploaded files in the active project.
 * @returns {Promise<Map<string, string>>} Map of filename → blob URL
 */
export async function getAllUploadBlobUrls() {
  const result = new Map();
  const store = await tx(STORE_BLOBS);
  const allKeys = await idbReq(store.getAllKeys());
  const uploadKeys = allKeys.filter((k) => k.includes("/uploads/"));
  for (const key of uploadKeys) {
    const blobStore = await tx(STORE_BLOBS);
    const entry = await idbReq(blobStore.get(key));
    if (entry?.data) {
      const filename = key.split("/uploads/").pop();
      const blob = new Blob([entry.data], { type: entry.mimeType || "application/octet-stream" });
      result.set(filename, URL.createObjectURL(blob));
    }
  }
  return result;
}

/**
 * Get a single blob URL for an uploaded file.
 * @param {string} filename - The upload filename
 * @returns {Promise<string>} Blob URL
 */
export async function getUploadBlobUrl(filename) {
  const store = await tx(STORE_BLOBS);
  const allKeys = await idbReq(store.getAllKeys());
  const matchKey = allKeys.find((k) => k.endsWith(`/uploads/${filename}`));
  if (!matchKey) throw new Error(`Upload not found: ${filename}`);
  const blobStore = await tx(STORE_BLOBS);
  const entry = await idbReq(blobStore.get(matchKey));
  if (!entry?.data) throw new Error(`Upload data missing: ${filename}`);
  const blob = new Blob([entry.data], { type: entry.mimeType || "application/octet-stream" });
  return URL.createObjectURL(blob);
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
  let s = name.trim().toLowerCase().slice(0, 128);
  s = s.replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "untitled";
}

export async function saveProject(name, chatHistory, description = "", thumbnailB64 = null) {
  const sanitized = sanitizeName(name);
  const currentName = getActiveProjectName();
  const now = new Date().toISOString();

  // Determine target name (versioning)
  // If re-saving the currently active project, overwrite in place
  const store = await tx(STORE_PROJECTS);
  const existing = await idbReq(store.get(sanitized));
  let targetName = sanitized;
  if (currentName === sanitized) {
    // Re-saving same project — overwrite
    targetName = sanitized;
  } else if (existing) {
    // Name conflict — find next available version
    const allKeys = await idbReq((await tx(STORE_PROJECTS)).getAllKeys());
    const keySet = new Set(allKeys);
    let counter = 1;
    while (keySet.has(`${sanitized}_${counter}`)) {
      counter++;
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

    for (const key of keysToMove) {
      const data = await idbReq((await tx(STORE_FILES)).get(key));
      const newKey = dstPrefix + key.slice(srcPrefix.length);
      await idbReq((await tx(STORE_FILES, "readwrite")).put(data, newKey));
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
      await idbReq((await tx(STORE_BLOBS, "readwrite")).put(data, newKey));
    }

    // For first save from _untitled, remove old _untitled files
    if (currentName === DEFAULT_PROJECT) {
      for (const key of keysToMove) {
        await idbReq((await tx(STORE_FILES, "readwrite")).delete(key));
      }
      for (const key of blobKeysToMove) {
        await idbReq((await tx(STORE_BLOBS, "readwrite")).delete(key));
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

  // Build v2 manifest (preserve existing provenance/trust if re-saving)
  const baseMeta = {
    name: targetName,
    display_name: displayName,
    description,
    created_at: existing?.created_at || now,
    updated_at: now,
    has_thumbnail: hasThumbnail,
  };

  const manifest = createProjectManifest(
    baseMeta,
    existing?.assets || [],
    {
      provenance: existing?.provenance || buildProvenanceLocal(),
      trust: existing?.trust || { safe_mode: false, trusted_by: null, trusted_at: null },
    }
  );

  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.put(manifest, targetName));

  // Also write siljangnim-project.json to files store for export compatibility
  const manifestStore = await tx(STORE_FILES, "readwrite");
  await idbReq(manifestStore.put(manifest, `${targetName}/${MANIFEST_FILENAME}`));

  setActiveProjectName(targetName);
  return manifest;
}

export async function loadProject(name) {
  const sanitized = sanitizeName(name);
  const store = await tx(STORE_PROJECTS);
  let meta = await idbReq(store.get(sanitized));
  if (!meta) throw new Error(`Project not found: ${name}`);

  // Auto-migrate v1 meta to v2 manifest
  if (!meta.schema_version || meta.schema_version < CURRENT_SCHEMA_VERSION) {
    meta = migrateV1toV2(meta);
    // Persist migrated manifest
    const ws = await tx(STORE_PROJECTS, "readwrite");
    await idbReq(ws.put(meta, sanitized));
  }

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
  const allValues = await idbReq(store.getAll());
  const projects = allValues.filter(Boolean);
  projects.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  return projects;
}

export async function deleteProject(name) {
  const sanitized = sanitizeName(name);
  const currentName = getActiveProjectName();
  const prefix = `${sanitized}/`;

  // Delete project meta
  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.delete(sanitized));

  // Delete all files in a single transaction
  const filesStore = await tx(STORE_FILES);
  const allKeys = await idbReq(filesStore.getAllKeys());
  const fileKeys = allKeys.filter((k) => k.startsWith(prefix));
  if (fileKeys.length) {
    const db = await openDB();
    const fileTx = db.transaction(STORE_FILES, "readwrite");
    const ws = fileTx.objectStore(STORE_FILES);
    for (const key of fileKeys) ws.delete(key);
    await new Promise((resolve, reject) => {
      fileTx.oncomplete = resolve;
      fileTx.onerror = () => reject(fileTx.error);
    });
  }

  // Delete all blobs in a single transaction
  const blobStore = await tx(STORE_BLOBS);
  const allBlobKeys = await idbReq(blobStore.getAllKeys());
  const blobKeys = allBlobKeys.filter((k) => k.startsWith(prefix));
  if (blobKeys.length) {
    const db = await openDB();
    const blobTx = db.transaction(STORE_BLOBS, "readwrite");
    const bs = blobTx.objectStore(STORE_BLOBS);
    for (const key of blobKeys) bs.delete(key);
    await new Promise((resolve, reject) => {
      blobTx.oncomplete = resolve;
      blobTx.onerror = () => reject(blobTx.error);
    });
  }

  // Delete all project nodes
  await deleteProjectNodes(sanitized);

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
  const db = await openDB();

  // Clear all _untitled files in a single transaction
  const filesStore = await tx(STORE_FILES);
  const allKeys = await idbReq(filesStore.getAllKeys());
  const fileKeys = allKeys.filter((k) => k.startsWith(prefix));
  if (fileKeys.length) {
    const fileTx = db.transaction(STORE_FILES, "readwrite");
    const ws = fileTx.objectStore(STORE_FILES);
    for (const key of fileKeys) ws.delete(key);
    await new Promise((resolve, reject) => {
      fileTx.oncomplete = resolve;
      fileTx.onerror = () => reject(fileTx.error);
    });
  }

  // Clear all _untitled blobs in a single transaction
  const blobStore = await tx(STORE_BLOBS);
  const allBlobKeys = await idbReq(blobStore.getAllKeys());
  const blobKeys = allBlobKeys.filter((k) => k.startsWith(prefix));
  if (blobKeys.length) {
    const blobTx = db.transaction(STORE_BLOBS, "readwrite");
    const bs = blobTx.objectStore(STORE_BLOBS);
    for (const key of blobKeys) bs.delete(key);
    await new Promise((resolve, reject) => {
      blobTx.oncomplete = resolve;
      blobTx.onerror = () => reject(blobTx.error);
    });
  }

  setActiveProjectName(DEFAULT_PROJECT);
}

// ---------------------------------------------------------------------------
// Project export/import (ZIP)
// ---------------------------------------------------------------------------

export async function exportProjectZip(name, { includeChat = true } = {}) {
  const sanitized = sanitizeName(name);
  const store = await tx(STORE_PROJECTS);
  let meta = await idbReq(store.get(sanitized));
  if (!meta) throw new Error(`Project not found: ${name}`);

  // Ensure v2 manifest
  if (!meta.schema_version || meta.schema_version < CURRENT_SCHEMA_VERSION) {
    meta = migrateV1toV2(meta);
  }
  const manifest = validateManifest(meta);

  // Collect text files from STORE_FILES
  const filesStore = await tx(STORE_FILES);
  const allKeys = await idbReq(filesStore.getAllKeys());
  const prefix = `${sanitized}/`;
  const files = {};
  for (const key of allKeys.filter((k) => k.startsWith(prefix))) {
    const relPath = key.slice(prefix.length);
    if (!includeChat && relPath === "chat_history.json") continue;
    // Skip old manifest from files (we include it separately)
    if (relPath === MANIFEST_FILENAME) continue;
    const fs = await tx(STORE_FILES);
    files[relPath] = await idbReq(fs.get(key));
  }

  // Collect binary blobs from STORE_BLOBS (uploads, thumbnail)
  const blobStore = await tx(STORE_BLOBS);
  const allBlobKeys = await idbReq(blobStore.getAllKeys());
  const blobPrefix = `${sanitized}/`;
  const blobs = {};
  for (const key of allBlobKeys.filter((k) => k.startsWith(blobPrefix))) {
    const relPath = key.slice(blobPrefix.length);
    const bs = await tx(STORE_BLOBS);
    const entry = await idbReq(bs.get(key));
    if (entry && entry.data) {
      const bytes = new Uint8Array(entry.data);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      blobs[relPath] = { data_b64: btoa(binary), mimeType: entry.mimeType, size: entry.size };
    }
  }

  // Collect project nodes
  const nodes = await listProjectNodes(sanitized);

  return JSON.stringify({ schema_version: CURRENT_SCHEMA_VERSION, manifest, meta: manifest, files, blobs, nodes }, null, 2);
}

export async function importProjectZip(jsonStr, { isExternal = true } = {}) {
  const parsed = JSON.parse(jsonStr);
  // Support both v2 (has manifest field) and v1 (just meta)
  let meta = parsed.manifest || parsed.meta || {};
  const files = parsed.files || {};
  const blobs = parsed.blobs || {};
  const nodes = parsed.nodes || [];

  // Migrate v1 to v2 if needed
  if (!meta.schema_version || meta.schema_version < CURRENT_SCHEMA_VERSION) {
    meta = migrateV1toV2(meta);
  }

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

  // Set safe_mode for external imports
  if (isExternal) {
    meta.trust = { safe_mode: true, trusted_by: null, trusted_at: null };
    if (!meta.provenance || meta.provenance.source_type === "local") {
      meta.provenance = buildProvenanceZip(parsed.meta?.name || "unknown");
    }
  }

  meta = validateManifest(meta);

  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.put(meta, candidate));

  for (const [filename, data] of Object.entries(files)) {
    const ws = await tx(STORE_FILES, "readwrite");
    await idbReq(ws.put(data, `${candidate}/${filename}`));
  }

  // Write manifest to files store
  const mfStore = await tx(STORE_FILES, "readwrite");
  await idbReq(mfStore.put(meta, `${candidate}/${MANIFEST_FILENAME}`));

  // Restore binary blobs (uploads, thumbnail)
  if (blobs && typeof blobs === "object") {
    for (const [relPath, entry] of Object.entries(blobs)) {
      const binary = atob(entry.data_b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const bs = await tx(STORE_BLOBS, "readwrite");
      await idbReq(bs.put({ data: bytes.buffer, mimeType: entry.mimeType, size: entry.size }, `${candidate}/${relPath}`));
    }
  }

  // Restore project nodes
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      const updatedNode = { ...node, projectName: candidate };
      const ns = await tx(STORE_NODES, "readwrite");
      await idbReq(ns.put(updatedNode));
    }
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Project export/import (real ZIP via JSZip)
// ---------------------------------------------------------------------------

// Note: JSZip must be installed as a dependency (`npm install jszip`).
// It is imported dynamically to avoid bundling overhead when not used.

const PROJECT_JSON_FILES = [
  "scene.json",
  "ui_config.json",
  "workspace_state.json",
  "panels.json",
  "chat_history.json",
];

/**
 * Export a single project as a real ZIP blob.
 *
 * File structure inside the ZIP:
 *   siljangnim-project.json
 *   scene.json
 *   ui_config.json
 *   workspace_state.json
 *   panels.json
 *   chat_history.json
 *   uploads/
 *     file1.png
 *     ...
 *   nodes/
 *     <nodeId>.json
 *     ...
 *
 * @param {string} projectName - display or sanitized project name
 * @returns {Promise<Blob>} ZIP blob (application/zip)
 */
export async function exportProjectAsZip(projectName) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const sanitized = sanitizeName(projectName);

  // --- manifest -----------------------------------------------------------
  const projStore = await tx(STORE_PROJECTS);
  let meta = await idbReq(projStore.get(sanitized));
  if (!meta) throw new Error(`Project not found: ${projectName}`);

  if (!meta.schema_version || meta.schema_version < CURRENT_SCHEMA_VERSION) {
    meta = migrateV1toV2(meta);
  }
  meta = validateManifest(meta);
  zip.file(MANIFEST_FILENAME, JSON.stringify(meta, null, 2));

  // --- workspace JSON files -----------------------------------------------
  const filesStore = await tx(STORE_FILES);
  const allFileKeys = await idbReq(filesStore.getAllKeys());
  const prefix = `${sanitized}/`;

  for (const key of allFileKeys.filter((k) => k.startsWith(prefix))) {
    const relPath = key.slice(prefix.length);
    // Skip the manifest (already added above)
    if (relPath === MANIFEST_FILENAME) continue;
    const fs = await tx(STORE_FILES);
    const data = await idbReq(fs.get(key));
    if (data !== undefined) {
      const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      zip.file(relPath, text);
    }
  }

  // --- uploaded blobs (binary) --------------------------------------------
  const blobStore = await tx(STORE_BLOBS);
  const allBlobKeys = await idbReq(blobStore.getAllKeys());
  const blobPrefix = `${sanitized}/`;

  for (const key of allBlobKeys.filter((k) => k.startsWith(blobPrefix))) {
    const relPath = key.slice(blobPrefix.length);
    const bs = await tx(STORE_BLOBS);
    const entry = await idbReq(bs.get(key));
    if (entry && entry.data) {
      zip.file(relPath, new Uint8Array(entry.data));
    }
  }

  // --- project tree nodes -------------------------------------------------
  try {
    const nodes = await listProjectNodes(sanitized);
    if (nodes.length > 0) {
      const nodesFolder = zip.folder("nodes");
      for (const node of nodes) {
        nodesFolder.file(`${node.id}.json`, JSON.stringify(node, null, 2));
      }
    }
  } catch {
    /* nodes store may not exist — skip */
  }

  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

/**
 * Export the entire workspace (all projects) as a single ZIP blob.
 *
 * File structure:
 *   siljangnim-workspace.json
 *   projects/
 *     project-a/
 *       siljangnim-project.json
 *       scene.json
 *       ...
 *     project-b/
 *       ...
 *
 * @returns {Promise<Blob>} ZIP blob
 */
export async function exportWorkspaceAsZip() {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const allProjects = await listProjects();
  const projectEntries = [];

  for (const projMeta of allProjects) {
    const name = projMeta.name;
    const sanitized = sanitizeName(name);
    const projFolder = zip.folder(`projects/${sanitized}`);

    // manifest
    let meta = validateManifest(projMeta);
    projFolder.file(MANIFEST_FILENAME, JSON.stringify(meta, null, 2));

    projectEntries.push({
      path: sanitized,
      display_name: meta.display_name || sanitized,
    });

    // workspace JSON files
    const filesStore = await tx(STORE_FILES);
    const allFileKeys = await idbReq(filesStore.getAllKeys());
    const prefix = `${sanitized}/`;

    for (const key of allFileKeys.filter((k) => k.startsWith(prefix))) {
      const relPath = key.slice(prefix.length);
      if (relPath === MANIFEST_FILENAME) continue;
      const fs = await tx(STORE_FILES);
      const data = await idbReq(fs.get(key));
      if (data !== undefined) {
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        projFolder.file(relPath, text);
      }
    }

    // blobs
    const blobStore = await tx(STORE_BLOBS);
    const allBlobKeys = await idbReq(blobStore.getAllKeys());
    const blobPrefix = `${sanitized}/`;

    for (const key of allBlobKeys.filter((k) => k.startsWith(blobPrefix))) {
      const relPath = key.slice(blobPrefix.length);
      const bs = await tx(STORE_BLOBS);
      const entry = await idbReq(bs.get(key));
      if (entry && entry.data) {
        projFolder.file(relPath, new Uint8Array(entry.data));
      }
    }

    // project tree nodes
    try {
      const nodes = await listProjectNodes(sanitized);
      if (nodes.length > 0) {
        const nodesFolder = projFolder.folder("nodes");
        for (const node of nodes) {
          nodesFolder.file(`${node.id}.json`, JSON.stringify(node, null, 2));
        }
      }
    } catch {
      /* skip */
    }
  }

  // workspace manifest at root
  const wsMeta = createWorkspaceManifest("Siljangnim Workspace", projectEntries);
  zip.file(WORKSPACE_MANIFEST_FILENAME, JSON.stringify(wsMeta, null, 2));

  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

/**
 * Import a single project from a ZIP blob.
 *
 * Handles:
 * - Missing manifest (creates a default one)
 * - v1 manifests (migrates to v2)
 * - External imports (sets safe_mode = true when opts.isExternal)
 * - Name conflict resolution (appends -2, -3, ...)
 * - Binary uploads
 * - Project tree nodes
 *
 * @param {Blob} zipBlob - ZIP file blob
 * @param {object} opts - { isExternal?: boolean }
 * @returns {Promise<object>} imported manifest
 */
export async function importProjectFromZip(zipBlob, opts = {}) {
  const { isExternal = true } = opts;
  const JSZip = (await import("jszip")).default;

  let zip;
  try {
    zip = await JSZip.loadAsync(zipBlob);
  } catch (err) {
    throw new Error(`Failed to read ZIP file: ${err.message}`);
  }

  // --- read manifest ------------------------------------------------------
  let meta = null;
  const manifestFile = zip.file(MANIFEST_FILENAME);
  if (manifestFile) {
    try {
      const manifestText = await manifestFile.async("string");
      meta = JSON.parse(manifestText);
    } catch {
      meta = null;
    }
  }

  // Create default manifest if missing
  if (!meta) {
    meta = createProjectManifest({ name: "imported" });
  }

  // Migrate v1 -> v2 if needed
  if (!meta.schema_version || meta.schema_version < CURRENT_SCHEMA_VERSION) {
    meta = migrateV1toV2(meta);
  }
  meta = validateManifest(meta);

  // --- resolve project name -----------------------------------------------
  const baseName = sanitizeName(meta.name || "imported");
  let candidate = baseName;
  let counter = 2;
  const ps = await tx(STORE_PROJECTS);
  while (await idbReq(ps.get(candidate))) {
    candidate = `${baseName}-${counter}`;
    counter++;
  }
  meta.name = candidate;
  meta.updated_at = new Date().toISOString();

  // --- trust / provenance for external imports ----------------------------
  if (isExternal) {
    meta.trust = { safe_mode: true, trusted_by: null, trusted_at: null };
    if (!meta.provenance || meta.provenance.source_type === "local") {
      meta.provenance = buildProvenanceZip(baseName);
    }
  }

  meta = validateManifest(meta);

  // --- save manifest to projects store ------------------------------------
  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.put(meta, candidate));

  // --- import files -------------------------------------------------------
  const prefix = `${candidate}/`;

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    // Skip manifest (already handled above)
    if (relativePath === MANIFEST_FILENAME) continue;

    // nodes/ folder is handled separately below
    if (relativePath.startsWith("nodes/")) continue;

    // Uploads (binary files in uploads/ or thumbnail)
    if (relativePath.startsWith("uploads/") || relativePath === "thumbnail.jpg") {
      try {
        const arrayBuffer = await zipEntry.async("arraybuffer");
        const mimeType = guessMimeType(relativePath);
        const bs = await tx(STORE_BLOBS, "readwrite");
        await idbReq(
          bs.put(
            { data: arrayBuffer, mimeType, size: arrayBuffer.byteLength },
            `${prefix}${relativePath}`
          )
        );
      } catch {
        console.warn(`[importProjectFromZip] skipping corrupt blob: ${relativePath}`);
      }
      continue;
    }

    // JSON / text files
    try {
      const text = await zipEntry.async("string");
      let data;
      if (relativePath.endsWith(".json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text; // store as raw string if JSON parse fails
        }
      } else {
        data = text;
      }
      const ws = await tx(STORE_FILES, "readwrite");
      await idbReq(ws.put(data, `${prefix}${relativePath}`));
    } catch {
      console.warn(`[importProjectFromZip] skipping corrupt file: ${relativePath}`);
    }
  }

  // Write manifest to files store for consistency
  const mfStore = await tx(STORE_FILES, "readwrite");
  await idbReq(mfStore.put(meta, `${prefix}${MANIFEST_FILENAME}`));

  // --- import nodes -------------------------------------------------------
  const nodeFiles = Object.entries(zip.files).filter(
    ([p, e]) => p.startsWith("nodes/") && !e.dir && p.endsWith(".json")
  );
  for (const [nodePath, nodeEntry] of nodeFiles) {
    try {
      const nodeText = await nodeEntry.async("string");
      const node = JSON.parse(nodeText);
      node.projectName = candidate; // remap to new project name
      const ns = await tx(STORE_NODES, "readwrite");
      await idbReq(ns.put(node));
    } catch {
      console.warn(`[importProjectFromZip] skipping corrupt node: ${nodePath}`);
    }
  }

  return meta;
}

/**
 * Import a full workspace from a ZIP blob.
 *
 * Expects:
 *   siljangnim-workspace.json
 *   projects/<name>/...
 *
 * @param {Blob} zipBlob - workspace ZIP blob
 * @returns {Promise<object[]>} array of imported project manifests
 */
export async function importWorkspaceFromZip(zipBlob) {
  const JSZip = (await import("jszip")).default;

  let zip;
  try {
    zip = await JSZip.loadAsync(zipBlob);
  } catch (err) {
    throw new Error(`Failed to read workspace ZIP: ${err.message}`);
  }

  // --- read workspace manifest --------------------------------------------
  let wsMeta = null;
  const wsManifestFile = zip.file(WORKSPACE_MANIFEST_FILENAME);
  if (wsManifestFile) {
    try {
      const text = await wsManifestFile.async("string");
      wsMeta = validateWorkspaceManifest(JSON.parse(text));
    } catch {
      wsMeta = null;
    }
  }

  // --- discover project folders -------------------------------------------
  // Look for projects/<name>/ directories
  const projectDirs = new Set();
  for (const path of Object.keys(zip.files)) {
    if (path.startsWith("projects/")) {
      const parts = path.slice("projects/".length).split("/");
      if (parts.length >= 1 && parts[0]) {
        projectDirs.add(parts[0]);
      }
    }
  }

  if (projectDirs.size === 0) {
    throw new Error("No projects found in workspace ZIP");
  }

  // --- import each project ------------------------------------------------
  const importedManifests = [];

  for (const projDir of projectDirs) {
    try {
      // Create a sub-zip containing only this project's files (with paths relative to project root)
      const subZip = new JSZip();
      const projPrefix = `projects/${projDir}/`;

      for (const [fullPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (!fullPath.startsWith(projPrefix)) continue;
        const relativePath = fullPath.slice(projPrefix.length);
        if (!relativePath) continue;

        const content = await entry.async("arraybuffer");
        subZip.file(relativePath, content);
      }

      const subBlob = await subZip.generateAsync({ type: "blob" });
      const manifest = await importProjectFromZip(subBlob, { isExternal: true });
      importedManifests.push(manifest);
    } catch (err) {
      console.warn(`[importWorkspaceFromZip] failed to import project "${projDir}":`, err);
    }
  }

  return importedManifests;
}

// ---------------------------------------------------------------------------
// Auto-save (Figma-style)
// ---------------------------------------------------------------------------

/**
 * Auto-save the current project (manifest-only update).
 * Files are already written under the correct prefix in IndexedDB,
 * so we just update chat_history, thumbnail, and manifest metadata.
 *
 * @param {Array} chatHistory - current chat messages
 * @param {string|null} thumbnailB64 - optional thumbnail data URL
 * @returns {Promise<object|null>} updated manifest or null if skipped
 */
export async function autoSaveCurrentProject(chatHistory, thumbnailB64 = null) {
  const currentName = getActiveProjectName();
  if (!currentName || currentName === DEFAULT_PROJECT) return null;

  const store = await tx(STORE_PROJECTS);
  const existing = await idbReq(store.get(currentName));
  if (!existing) return null;

  const now = new Date().toISOString();

  // Update chat_history
  if (chatHistory) {
    const chatStore = await tx(STORE_FILES, "readwrite");
    await idbReq(chatStore.put(chatHistory, `${currentName}/chat_history.json`));
  }

  // Update thumbnail
  let hasThumbnail = existing.has_thumbnail || false;
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
          `${currentName}/thumbnail.jpg`
        )
      );
      hasThumbnail = true;
    } catch { /* ignore */ }
  }

  // Update manifest
  existing.updated_at = now;
  existing.has_thumbnail = hasThumbnail;

  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.put(existing, currentName));

  // Update manifest in files store
  const mfStore = await tx(STORE_FILES, "readwrite");
  await idbReq(mfStore.put(existing, `${currentName}/${MANIFEST_FILENAME}`));

  return existing;
}

/**
 * Auto-create a project from the current _untitled workspace.
 * Moves all _untitled/* files and blobs to newName/*.
 *
 * @param {string} suggestedName - desired project name
 * @param {Array} chatHistory - current chat messages
 * @param {string|null} thumbnailB64 - optional thumbnail data URL
 * @returns {Promise<object>} created manifest
 */
export async function autoCreateProject(suggestedName, chatHistory, thumbnailB64 = null) {
  // Sanitize and resolve conflicts
  let baseName = sanitizeName(suggestedName || "untitled-project");
  let targetName = baseName;
  const ps = await tx(STORE_PROJECTS);
  const allKeys = await idbReq(ps.getAllKeys());
  const keySet = new Set(allKeys);
  if (keySet.has(targetName)) {
    let counter = 1;
    while (keySet.has(`${baseName}_${counter}`)) counter++;
    targetName = `${baseName}_${counter}`;
  }

  const now = new Date().toISOString();
  const srcPrefix = `${DEFAULT_PROJECT}/`;
  const dstPrefix = `${targetName}/`;

  // Move files: _untitled/* → targetName/*
  const db = await openDB();
  const filesStore = await tx(STORE_FILES);
  const allFileKeys = await idbReq(filesStore.getAllKeys());
  const fileKeysToMove = allFileKeys.filter((k) => k.startsWith(srcPrefix));

  for (const key of fileKeysToMove) {
    const data = await idbReq((await tx(STORE_FILES)).get(key));
    const newKey = dstPrefix + key.slice(srcPrefix.length);
    await idbReq((await tx(STORE_FILES, "readwrite")).put(data, newKey));
    await idbReq((await tx(STORE_FILES, "readwrite")).delete(key));
  }

  // Move blobs: _untitled/* → targetName/*
  const blobStore = await tx(STORE_BLOBS);
  const allBlobKeys = await idbReq(blobStore.getAllKeys());
  const blobKeysToMove = allBlobKeys.filter((k) => k.startsWith(srcPrefix));

  for (const key of blobKeysToMove) {
    const data = await idbReq((await tx(STORE_BLOBS)).get(key));
    const newKey = dstPrefix + key.slice(srcPrefix.length);
    await idbReq((await tx(STORE_BLOBS, "readwrite")).put(data, newKey));
    await idbReq((await tx(STORE_BLOBS, "readwrite")).delete(key));
  }

  // Move project tree nodes
  const nodes = await listProjectNodes(DEFAULT_PROJECT);
  for (const node of nodes) {
    node.projectName = targetName;
    await writeNode(node);
  }

  // Save chat history
  const chatStore = await tx(STORE_FILES, "readwrite");
  await idbReq(chatStore.put(chatHistory || [], `${targetName}/chat_history.json`));

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
    } catch { /* ignore */ }
  }

  // Build display name (preserve original casing)
  const displayName = (suggestedName || "Untitled Project").trim().slice(0, 128);

  // Create manifest
  const manifest = createProjectManifest(
    {
      name: targetName,
      display_name: displayName,
      description: "",
      created_at: now,
      updated_at: now,
      has_thumbnail: hasThumbnail,
    },
    [],
    {
      provenance: buildProvenanceLocal(),
      trust: { safe_mode: false, trusted_by: null, trusted_at: null },
    }
  );

  const metaStore = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(metaStore.put(manifest, targetName));

  // Write manifest to files store
  const mfStore = await tx(STORE_FILES, "readwrite");
  await idbReq(mfStore.put(manifest, `${targetName}/${MANIFEST_FILENAME}`));

  setActiveProjectName(targetName);
  return manifest;
}

// ---------------------------------------------------------------------------
// Trust management
// ---------------------------------------------------------------------------

export async function trustProject(projectName) {
  const sanitized = sanitizeName(projectName || getActiveProjectName());
  const store = await tx(STORE_PROJECTS);
  let meta = await idbReq(store.get(sanitized));
  if (!meta) return null;

  meta = trustManifest(meta, "user");
  const ws = await tx(STORE_PROJECTS, "readwrite");
  await idbReq(ws.put(meta, sanitized));

  // Update manifest in files store
  const fs = await tx(STORE_FILES, "readwrite");
  await idbReq(fs.put(meta, `${sanitized}/${MANIFEST_FILENAME}`));

  return meta;
}

export async function getProjectManifest(projectName) {
  const sanitized = sanitizeName(projectName || getActiveProjectName());
  const store = await tx(STORE_PROJECTS);
  const meta = await idbReq(store.get(sanitized));
  return meta ? validateManifest(meta) : null;
}

export { isSafeMode } from "./portableSchema.js";

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
  const db = await openDB();

  // Files store — batch read in a single transaction
  const fileTx = db.transaction(STORE_FILES, "readonly");
  const filesStore = fileTx.objectStore(STORE_FILES);
  const fileKeys = await idbReq(filesStore.getAllKeys());
  const matchingFileKeys = fileKeys.filter((k) => k.startsWith(prefix));
  for (const key of matchingFileKeys) {
    const path = key.slice(prefix.length);
    const data = await idbReq(filesStore.get(key));
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    results.push({
      path,
      name: path.split("/").pop(),
      size: new Blob([text]).size,
      mime_type: guessMimeType(path),
    });
  }

  // Blobs store — batch read in a single transaction
  const blobTx = db.transaction(STORE_BLOBS, "readonly");
  const blobStore = blobTx.objectStore(STORE_BLOBS);
  const blobKeys = await idbReq(blobStore.getAllKeys());
  for (const key of blobKeys.filter((k) => k.startsWith(prefix))) {
    const path = key.slice(prefix.length);
    if (path === "thumbnail.jpg") continue;
    const entry = await idbReq(blobStore.get(key));
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
// Project Node CRUD (tree-based version history)
// ---------------------------------------------------------------------------

export async function writeNode(node) {
  const store = await tx(STORE_NODES, "readwrite");
  await idbReq(store.put(node));
}

export async function readNode(nodeId) {
  const store = await tx(STORE_NODES);
  const node = await idbReq(store.get(nodeId));
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  return node;
}

export async function deleteNode(nodeId) {
  const store = await tx(STORE_NODES, "readwrite");
  await idbReq(store.delete(nodeId));
}

export async function listProjectNodes(projectName) {
  const db = await openDB();
  const nodeTx = db.transaction(STORE_NODES, "readonly");
  const store = nodeTx.objectStore(STORE_NODES);
  const index = store.index("projectName");
  const nodes = await idbReq(index.getAll(projectName));
  return nodes || [];
}

export async function deleteProjectNodes(projectName) {
  const nodes = await listProjectNodes(projectName);
  if (nodes.length === 0) return;
  const db = await openDB();
  const nodeTx = db.transaction(STORE_NODES, "readwrite");
  const store = nodeTx.objectStore(STORE_NODES);
  for (const node of nodes) store.delete(node.id);
  await new Promise((resolve, reject) => {
    nodeTx.oncomplete = resolve;
    nodeTx.onerror = () => reject(nodeTx.error);
  });
}

export async function readNodeThumbnailUrl(projectName, nodeId) {
  try {
    const store = await tx(STORE_BLOBS);
    const entry = await idbReq(store.get(`${projectName}/_thumbs/${nodeId}.jpg`));
    if (!entry) return null;
    const blob = new Blob([entry.data], { type: entry.mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function writeNodeThumbnail(projectName, nodeId, dataUrl) {
  if (!dataUrl) return;
  try {
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const store = await tx(STORE_BLOBS, "readwrite");
    await idbReq(
      store.put(
        { data: bytes.buffer, mimeType: "image/jpeg", size: bytes.length },
        `${projectName}/_thumbs/${nodeId}.jpg`
      )
    );
  } catch { /* ignore */ }
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
