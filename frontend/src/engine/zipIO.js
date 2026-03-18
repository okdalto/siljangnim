/**
 * zipIO.js — Pure-JS ZIP creation and parsing for Siljangnim project export/import.
 *
 * Implements a minimal ZIP file writer and reader using only browser-native APIs.
 * Supports STORE (no compression) and DEFLATE (via CompressionStream where available).
 * Handles both text (JSON) and binary (images, audio) file entries.
 *
 * ZIP format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */

import {
  MANIFEST_FILENAME,
  createProjectManifest,
  buildProvenanceZip,
  migrateV1toV2,
  validateManifest,
} from "./portableSchema.js";

import * as storageApi from "./storage.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Signature bytes used in the ZIP format. */
const SIG_LOCAL_FILE = 0x04034b50;
const SIG_CENTRAL_DIR = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/** Compression methods. */
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** General purpose bit flag: bit 11 = UTF-8 filenames. */
const FLAG_UTF8 = 1 << 11;

/** Text encoder/decoder instances (reused). */
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** JSON files included in a project export. */
const PROJECT_JSON_FILES = [
  "scene.json",
  "ui_config.json",
  "workspace_state.json",
  "panels.json",
  "chat_history.json",
  "debug_logs.json",
];

// ---------------------------------------------------------------------------
// CRC-32 (ISO 3309 / ITU-T V.42)
// ---------------------------------------------------------------------------

/** Pre-computed CRC-32 lookup table (256 entries). */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

/**
 * Compute the CRC-32 checksum of a Uint8Array.
 * @param {Uint8Array} data
 * @returns {number} unsigned 32-bit CRC value
 */
function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Compression helpers
// ---------------------------------------------------------------------------

/** Whether the browser supports CompressionStream("deflate-raw"). */
let _deflateSupported = null;

/**
 * Check (once) whether DeflateRaw is available via CompressionStream.
 * @returns {Promise<boolean>}
 */
async function isDeflateSupported() {
  if (_deflateSupported !== null) return _deflateSupported;
  try {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.close();
    await cs.readable.getReader().read();
    _deflateSupported = true;
  } catch {
    _deflateSupported = false;
  }
  return _deflateSupported;
}

/**
 * Compress data using DeflateRaw via CompressionStream.
 * @param {Uint8Array} data
 * @returns {Promise<Uint8Array>} deflated bytes
 */
async function deflateRaw(data) {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Decompress deflate-raw data via DecompressionStream.
 * @param {Uint8Array} data - deflated bytes
 * @returns {Promise<Uint8Array>} inflated bytes
 */
async function inflateRaw(data) {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Low-level binary helpers
// ---------------------------------------------------------------------------

/**
 * Write a 16-bit unsigned integer (little-endian) into a DataView.
 */
function writeU16(view, offset, value) {
  view.setUint16(offset, value, true);
}

/**
 * Write a 32-bit unsigned integer (little-endian) into a DataView.
 */
function writeU32(view, offset, value) {
  view.setUint32(offset, value, true);
}

/**
 * Read a 16-bit unsigned integer (little-endian) from a DataView.
 */
function readU16(view, offset) {
  return view.getUint16(offset, true);
}

/**
 * Read a 32-bit unsigned integer (little-endian) from a DataView.
 */
function readU32(view, offset) {
  return view.getUint32(offset, true);
}

/**
 * Convert a JS Date to MS-DOS date/time format used by ZIP.
 * @param {Date} date
 * @returns {{ dosTime: number, dosDate: number }}
 */
function toDosDateTime(date) {
  const dosTime =
    (date.getSeconds() >> 1) |
    (date.getMinutes() << 5) |
    (date.getHours() << 11);
  const dosDate =
    date.getDate() |
    ((date.getMonth() + 1) << 5) |
    ((date.getFullYear() - 1980) << 9);
  return { dosTime, dosDate };
}

// ---------------------------------------------------------------------------
// ZIP Writer
// ---------------------------------------------------------------------------

/**
 * Minimal ZIP file builder.
 *
 * Usage:
 *   const writer = new ZipWriter();
 *   await writer.addFile("hello.txt", textEncoder.encode("Hello"));
 *   await writer.addFile("image.png", pngBytes);
 *   const blob = await writer.finalize();
 */
class ZipWriter {
  constructor() {
    /** @type {{ name: Uint8Array, data: Uint8Array, compressedData: Uint8Array, crc: number, method: number, offset: number }[]} */
    this._entries = [];
    /** Accumulated raw chunks forming the ZIP body. */
    this._parts = [];
    /** Current byte offset in the output stream. */
    this._offset = 0;
    /** Whether to attempt DEFLATE compression. */
    this._useDeflate = null; // resolved lazily
  }

  /**
   * Add a file entry to the ZIP archive.
   *
   * @param {string} filename - path inside the ZIP (forward slashes)
   * @param {Uint8Array} data - raw file contents
   */
  async addFile(filename, data) {
    // Resolve deflate support on first call.
    if (this._useDeflate === null) {
      this._useDeflate = await isDeflateSupported();
    }

    const nameBytes = TEXT_ENCODER.encode(filename);
    const crcValue = crc32(data);
    const uncompressedSize = data.length;

    // Attempt compression; fall back to STORE if deflate is unavailable or
    // if the compressed output is not smaller than the original.
    let compressedData = data;
    let method = METHOD_STORE;

    if (this._useDeflate && uncompressedSize > 64) {
      try {
        const deflated = await deflateRaw(data);
        if (deflated.length < uncompressedSize) {
          compressedData = deflated;
          method = METHOD_DEFLATE;
        }
      } catch {
        // Compression failed — use STORE.
      }
    }

    const compressedSize = compressedData.length;
    const { dosTime, dosDate } = toDosDateTime(new Date());

    // --- Build the local file header (30 bytes + filename) -----------------
    const localHeaderSize = 30 + nameBytes.length;
    const localHeader = new ArrayBuffer(localHeaderSize);
    const lhView = new DataView(localHeader);

    writeU32(lhView, 0, SIG_LOCAL_FILE);       // Local file header signature
    writeU16(lhView, 4, 20);                    // Version needed to extract (2.0)
    writeU16(lhView, 6, FLAG_UTF8);             // General purpose bit flag
    writeU16(lhView, 8, method);                // Compression method
    writeU16(lhView, 10, dosTime);              // Last mod file time
    writeU16(lhView, 12, dosDate);              // Last mod file date
    writeU32(lhView, 14, crcValue);             // CRC-32
    writeU32(lhView, 18, compressedSize);       // Compressed size
    writeU32(lhView, 22, uncompressedSize);     // Uncompressed size
    writeU16(lhView, 26, nameBytes.length);     // Filename length
    writeU16(lhView, 28, 0);                    // Extra field length

    // Copy filename into the header
    const lhBytes = new Uint8Array(localHeader);
    lhBytes.set(nameBytes, 30);

    // Record entry for central directory
    const entryOffset = this._offset;
    this._entries.push({
      name: nameBytes,
      data,
      compressedData,
      crc: crcValue,
      method,
      offset: entryOffset,
      compressedSize,
      uncompressedSize,
      dosTime,
      dosDate,
    });

    // Append local header + file data
    this._parts.push(lhBytes);
    this._offset += localHeaderSize;

    this._parts.push(compressedData);
    this._offset += compressedSize;
  }

  /**
   * Finalize the archive and return a Blob.
   * Writes the central directory and End-of-Central-Directory record.
   *
   * @returns {Promise<Blob>} the complete ZIP file
   */
  async finalize() {
    const centralDirOffset = this._offset;
    let centralDirSize = 0;

    // --- Central directory entries ----------------------------------------
    for (const entry of this._entries) {
      const cdSize = 46 + entry.name.length;
      const cdBuf = new ArrayBuffer(cdSize);
      const cdView = new DataView(cdBuf);

      writeU32(cdView, 0, SIG_CENTRAL_DIR);       // Central directory signature
      writeU16(cdView, 4, 20);                     // Version made by (2.0)
      writeU16(cdView, 6, 20);                     // Version needed to extract
      writeU16(cdView, 8, FLAG_UTF8);              // General purpose bit flag
      writeU16(cdView, 10, entry.method);          // Compression method
      writeU16(cdView, 12, entry.dosTime);         // Last mod time
      writeU16(cdView, 14, entry.dosDate);         // Last mod date
      writeU32(cdView, 16, entry.crc);             // CRC-32
      writeU32(cdView, 20, entry.compressedSize);  // Compressed size
      writeU32(cdView, 24, entry.uncompressedSize);// Uncompressed size
      writeU16(cdView, 28, entry.name.length);     // Filename length
      writeU16(cdView, 30, 0);                     // Extra field length
      writeU16(cdView, 32, 0);                     // File comment length
      writeU16(cdView, 34, 0);                     // Disk number start
      writeU16(cdView, 36, 0);                     // Internal file attributes
      writeU32(cdView, 38, 0);                     // External file attributes
      writeU32(cdView, 42, entry.offset);          // Relative offset of local header

      const cdBytes = new Uint8Array(cdBuf);
      cdBytes.set(entry.name, 46);

      this._parts.push(cdBytes);
      centralDirSize += cdSize;
    }

    // --- End of central directory record (22 bytes) -----------------------
    const eocdBuf = new ArrayBuffer(22);
    const eocdView = new DataView(eocdBuf);

    writeU32(eocdView, 0, SIG_EOCD);                    // EOCD signature
    writeU16(eocdView, 4, 0);                            // Disk number
    writeU16(eocdView, 6, 0);                            // Disk with central dir
    writeU16(eocdView, 8, this._entries.length);         // Entries on this disk
    writeU16(eocdView, 10, this._entries.length);        // Total entries
    writeU32(eocdView, 12, centralDirSize);              // Size of central dir
    writeU32(eocdView, 16, centralDirOffset);            // Offset of central dir
    writeU16(eocdView, 20, 0);                           // Comment length

    this._parts.push(new Uint8Array(eocdBuf));

    return new Blob(this._parts, { type: "application/zip" });
  }
}

// ---------------------------------------------------------------------------
// ZIP Reader
// ---------------------------------------------------------------------------

/**
 * Parsed ZIP file entry descriptor.
 * @typedef {object} ZipEntry
 * @property {string} filename
 * @property {number} method - compression method (0 = STORE, 8 = DEFLATE)
 * @property {number} compressedSize
 * @property {number} uncompressedSize
 * @property {number} crc
 * @property {number} localHeaderOffset - byte offset of the local file header
 * @property {boolean} isDirectory
 */

/**
 * Minimal ZIP file reader.
 *
 * Parses the central directory to enumerate files, then extracts individual
 * entries on demand. Supports STORE and DEFLATE methods.
 */
class ZipReader {
  /**
   * @param {ArrayBuffer} buffer - the entire ZIP file contents
   */
  constructor(buffer) {
    this._buffer = buffer;
    this._view = new DataView(buffer);
    this._bytes = new Uint8Array(buffer);
    /** @type {ZipEntry[]} */
    this.entries = [];
    this._parse();
  }

  /**
   * Create a ZipReader from a Blob or File.
   * @param {Blob|File} blob
   * @returns {Promise<ZipReader>}
   */
  static async fromBlob(blob) {
    const buffer = await blob.arrayBuffer();
    return new ZipReader(buffer);
  }

  /**
   * Find the End-of-Central-Directory record and parse all central
   * directory entries.
   */
  _parse() {
    const eocdOffset = this._findEOCD();
    if (eocdOffset === -1) {
      throw new Error("Invalid ZIP file: End-of-Central-Directory record not found");
    }

    const totalEntries = readU16(this._view, eocdOffset + 10);
    const centralDirOffset = readU32(this._view, eocdOffset + 16);

    let offset = centralDirOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (readU32(this._view, offset) !== SIG_CENTRAL_DIR) {
        throw new Error(`Invalid central directory entry at offset ${offset}`);
      }

      const method = readU16(this._view, offset + 10);
      const crcValue = readU32(this._view, offset + 16);
      const compressedSize = readU32(this._view, offset + 20);
      const uncompressedSize = readU32(this._view, offset + 24);
      const nameLen = readU16(this._view, offset + 28);
      const extraLen = readU16(this._view, offset + 30);
      const commentLen = readU16(this._view, offset + 32);
      const localHeaderOffset = readU32(this._view, offset + 42);

      const nameBytes = this._bytes.slice(offset + 46, offset + 46 + nameLen);
      const filename = TEXT_DECODER.decode(nameBytes);

      this.entries.push({
        filename,
        method,
        compressedSize,
        uncompressedSize,
        crc: crcValue,
        localHeaderOffset,
        isDirectory: filename.endsWith("/"),
      });

      offset += 46 + nameLen + extraLen + commentLen;
    }
  }

  /**
   * Locate the EOCD signature by scanning backwards from the end of the file.
   * The EOCD is at least 22 bytes and can have a variable-length comment.
   * @returns {number} byte offset, or -1 if not found
   */
  _findEOCD() {
    const minOffset = Math.max(0, this._bytes.length - 65557); // max comment = 65535
    for (let i = this._bytes.length - 22; i >= minOffset; i--) {
      if (readU32(this._view, i) === SIG_EOCD) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Extract a single file entry as a Uint8Array.
   *
   * Reads the local file header to locate the data, then decompresses if
   * the entry uses DEFLATE.
   *
   * @param {ZipEntry} entry
   * @returns {Promise<Uint8Array>} uncompressed file data
   */
  async extractEntry(entry) {
    if (entry.isDirectory) return new Uint8Array(0);

    const lhOffset = entry.localHeaderOffset;

    // Validate local file header signature
    if (readU32(this._view, lhOffset) !== SIG_LOCAL_FILE) {
      throw new Error(`Invalid local file header at offset ${lhOffset}`);
    }

    const nameLen = readU16(this._view, lhOffset + 26);
    const extraLen = readU16(this._view, lhOffset + 28);
    const dataOffset = lhOffset + 30 + nameLen + extraLen;

    const compressedData = this._bytes.slice(
      dataOffset,
      dataOffset + entry.compressedSize
    );

    let data;
    if (entry.method === METHOD_STORE) {
      data = compressedData;
    } else if (entry.method === METHOD_DEFLATE) {
      data = await inflateRaw(compressedData);
    } else {
      throw new Error(`Unsupported compression method: ${entry.method}`);
    }

    // Verify CRC-32 integrity
    const actualCrc = crc32(data);
    if (actualCrc !== entry.crc) {
      console.warn(
        `[ZipReader] CRC mismatch for "${entry.filename}": ` +
        `expected 0x${entry.crc.toString(16)}, got 0x${actualCrc.toString(16)}`
      );
    }

    return data;
  }

  /**
   * Extract a file entry as a UTF-8 string.
   * @param {ZipEntry} entry
   * @returns {Promise<string>}
   */
  async extractEntryAsString(entry) {
    const data = await this.extractEntry(entry);
    return TEXT_DECODER.decode(data);
  }

  /**
   * Find an entry by its filename path.
   * @param {string} filename
   * @returns {ZipEntry|undefined}
   */
  findEntry(filename) {
    return this.entries.find((e) => e.filename === filename);
  }

  /**
   * List all file entries (non-directory) whose path starts with the
   * given prefix.
   * @param {string} prefix
   * @returns {ZipEntry[]}
   */
  listByPrefix(prefix) {
    return this.entries.filter((e) => !e.isDirectory && e.filename.startsWith(prefix));
  }
}

// ---------------------------------------------------------------------------
// MIME type guesser (mirrors storage.js)
// ---------------------------------------------------------------------------

/**
 * Guess MIME type from a filename extension.
 * @param {string} filename
 * @returns {string}
 */
function guessMimeType(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const mimes = {
    json: "application/json",
    js: "text/javascript",
    glsl: "text/plain",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return mimes[ext] || "application/octet-stream";
}

/**
 * Sanitize a project name to a filesystem-safe slug.
 * Mirrors the private sanitizeName in storage.js.
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  let s = name.trim().toLowerCase().slice(0, 128);
  s = s.replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "untitled";
}

// ---------------------------------------------------------------------------
// Public API: exportProjectToZip
// ---------------------------------------------------------------------------

/**
 * Create a ZIP file from a project stored in IndexedDB.
 *
 * ZIP structure:
 *   project-name/
 *     siljangnim-project.json
 *     scene.json
 *     ui_config.json
 *     workspace_state.json
 *     panels.json
 *     chat_history.json          (optional)
 *     debug_logs.json            (optional)
 *     uploads/
 *       image.png
 *       audio.mp3
 *     _nodes/
 *       nodes.json
 *
 * @param {string} projectName - display or sanitized project name
 * @param {object} options
 * @param {boolean} [options.includeChat=true] - include chat_history.json
 * @param {boolean} [options.includeNodes=true] - include version tree nodes
 * @returns {Promise<Blob>} ZIP file as a Blob (application/zip)
 */
export async function exportProjectToZip(projectName, options = {}) {
  const { includeChat = true, includeNodes = true, excludeAssets = null } = options;
  const excludeSet = excludeAssets instanceof Set ? excludeAssets : (excludeAssets ? new Set(excludeAssets) : null);
  const sanitized = sanitizeName(projectName);
  const zip = new ZipWriter();

  // --- Manifest -----------------------------------------------------------
  // Read the project manifest from storage. If missing, build a default one.
  let manifest;
  try {
    manifest = await storageApi.getProjectManifest(sanitized);
  } catch {
    manifest = null;
  }
  if (!manifest) {
    throw new Error(`Project not found: ${projectName}`);
  }
  manifest = validateManifest(manifest);

  const rootPrefix = `${sanitized}/`;

  // Manifest will be written after we know which assets are excluded.

  // --- Workspace JSON files -----------------------------------------------
  for (const filename of PROJECT_JSON_FILES) {
    // Optionally skip chat history
    if (!includeChat && filename === "chat_history.json") continue;

    try {
      const data = await storageApi.readJson(filename);
      if (data !== undefined && data !== null) {
        const text =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        await zip.addFile(
          `${rootPrefix}${filename}`,
          TEXT_ENCODER.encode(text)
        );
      }
    } catch {
      // File may not exist — skip silently.
    }
  }

  // --- Uploaded binary assets (uploads/) -----------------------------------
  const excludedMeta = [];
  try {
    const uploadNames = await storageApi.listUploads();
    for (const uploadName of uploadNames) {
      if (excludeSet && excludeSet.has(uploadName)) {
        // Record excluded asset metadata
        try {
          const info = await storageApi.getUploadInfo(uploadName);
          excludedMeta.push(storageApi.buildExcludedAssetMeta(uploadName, info));
        } catch {
          excludedMeta.push(storageApi.buildExcludedAssetMeta(uploadName));
        }
        continue;
      }
      try {
        const upload = await storageApi.readUpload(uploadName);
        if (upload && upload.data) {
          await zip.addFile(
            `${rootPrefix}uploads/${uploadName}`,
            new Uint8Array(upload.data)
          );
        }
      } catch {
        console.warn(`[exportProjectToZip] skipping upload: ${uploadName}`);
      }
    }
  } catch {
    // No uploads store or empty — continue.
  }

  // Record excluded assets in manifest
  if (excludedMeta.length > 0) {
    manifest = { ...manifest, excluded_assets: excludedMeta };
  }

  // --- Write manifest (after excluded_assets are known) --------------------
  await zip.addFile(
    `${rootPrefix}${MANIFEST_FILENAME}`,
    TEXT_ENCODER.encode(JSON.stringify(manifest, null, 2))
  );

  // --- Version tree nodes (_nodes/) ----------------------------------------
  if (includeNodes) {
    try {
      const nodes = await storageApi.listProjectNodes(sanitized);
      if (nodes && nodes.length > 0) {
        await zip.addFile(
          `${rootPrefix}_nodes/nodes.json`,
          TEXT_ENCODER.encode(JSON.stringify(nodes, null, 2))
        );
      }
    } catch {
      // Nodes store may not exist — skip.
    }
  }

  return zip.finalize();
}

// ---------------------------------------------------------------------------
// Public API: importProjectFromZip
// ---------------------------------------------------------------------------

/**
 * Import a project from a ZIP file (Blob or File).
 *
 * Handles:
 * - Root folder detection (strips common prefix if present)
 * - Missing manifest (creates a default one)
 * - v1 manifests (migrates to v2)
 * - External imports (sets safe_mode = true)
 * - Name conflict resolution (appends -2, -3, ...)
 * - Binary uploads
 * - Version tree nodes
 *
 * @param {File|Blob} zipFile - the ZIP file to import
 * @param {object} options
 * @param {boolean} [options.isExternal=true] - treat as external (enables safe mode)
 * @returns {Promise<object>} the imported project manifest
 */
export async function importProjectFromZip(zipFile, options = {}) {
  const { isExternal = true } = options;

  let reader;
  try {
    reader = await ZipReader.fromBlob(zipFile);
  } catch (err) {
    throw new Error(`Failed to read ZIP file: ${err.message}`);
  }

  // --- Detect root folder prefix ------------------------------------------
  // ZIP files may contain everything under a single root folder, e.g.
  // "my-project/scene.json". Detect and strip this prefix.
  const rootPrefix = detectRootPrefix(reader.entries);

  /**
   * Strip the detected root prefix from a path.
   * @param {string} path
   * @returns {string}
   */
  function stripPrefix(path) {
    if (rootPrefix && path.startsWith(rootPrefix)) {
      return path.slice(rootPrefix.length);
    }
    return path;
  }

  // --- Read manifest -------------------------------------------------------
  let meta = null;
  const manifestEntry =
    reader.findEntry(`${rootPrefix}${MANIFEST_FILENAME}`) ||
    reader.findEntry(MANIFEST_FILENAME);

  if (manifestEntry) {
    try {
      const text = await reader.extractEntryAsString(manifestEntry);
      meta = JSON.parse(text);
    } catch {
      meta = null;
    }
  }

  if (!meta) {
    // Derive a name from the root folder or the ZIP filename.
    const fallbackName =
      rootPrefix ? rootPrefix.replace(/\/$/, "") : "imported";
    meta = createProjectManifest({ name: fallbackName });
  }

  // Migrate v1 -> v2 if needed
  if (!meta.schema_version || meta.schema_version < 2) {
    meta = migrateV1toV2(meta);
  }
  meta = validateManifest(meta);

  // --- Resolve project name (avoid conflicts) ------------------------------
  const baseName = sanitizeName(meta.name || "imported");
  let candidate = baseName;
  let counter = 2;

  // Check for existing projects to avoid overwriting.
  try {
    const existingProjects = await storageApi.listProjects();
    const existingNames = new Set(
      existingProjects.map((p) => sanitizeName(p.name))
    );
    while (existingNames.has(candidate)) {
      candidate = `${baseName}-${counter}`;
      counter++;
    }
  } catch {
    // If listProjects fails, just use the candidate as-is.
  }

  meta.name = candidate;
  meta.display_name = meta.display_name || candidate;
  meta.updated_at = new Date().toISOString();

  // --- Trust / provenance for external imports -----------------------------
  if (isExternal) {
    meta.trust = { safe_mode: true, trusted_by: null, trusted_at: null };
    if (!meta.provenance || meta.provenance.source_type === "local") {
      meta.provenance = buildProvenanceZip(baseName);
    }
  }
  meta = validateManifest(meta);

  // --- Import files --------------------------------------------------------
  for (const entry of reader.entries) {
    if (entry.isDirectory) continue;

    const relPath = stripPrefix(entry.filename);

    // Skip manifest (handled above)
    if (relPath === MANIFEST_FILENAME) continue;

    // Nodes are handled separately below
    if (relPath.startsWith("_nodes/") || relPath.startsWith("nodes/")) continue;

    // Binary uploads
    if (relPath.startsWith("uploads/") || relPath === "thumbnail.jpg") {
      try {
        const data = await reader.extractEntry(entry);
        const uploadFilename = relPath.startsWith("uploads/")
          ? relPath.slice("uploads/".length)
          : relPath;
        const mimeType = guessMimeType(relPath);
        await storageApi.saveUpload(uploadFilename, data.buffer, mimeType);
      } catch {
        console.warn(`[importProjectFromZip] skipping corrupt blob: ${relPath}`);
      }
      continue;
    }

    // JSON / text files
    try {
      const text = await reader.extractEntryAsString(entry);
      if (relPath.endsWith(".json")) {
        try {
          const jsonData = JSON.parse(text);
          await storageApi.writeJson(relPath, jsonData);
        } catch {
          // Store as raw string if JSON parse fails
          await storageApi.writeJson(relPath, text);
        }
      } else {
        await storageApi.writeJson(relPath, text);
      }
    } catch {
      console.warn(`[importProjectFromZip] skipping corrupt file: ${relPath}`);
    }
  }

  // Write the manifest itself into the workspace files
  await storageApi.writeJson(MANIFEST_FILENAME, meta);

  // --- Import version tree nodes -------------------------------------------
  const nodeEntries = reader.entries.filter((e) => {
    const rel = stripPrefix(e.filename);
    return (
      !e.isDirectory &&
      (rel.startsWith("_nodes/") || rel.startsWith("nodes/")) &&
      rel.endsWith(".json")
    );
  });

  for (const nodeEntry of nodeEntries) {
    try {
      const text = await reader.extractEntryAsString(nodeEntry);
      const nodeData = JSON.parse(text);

      // If this is a consolidated nodes.json file, it's an array of nodes.
      if (Array.isArray(nodeData)) {
        for (const node of nodeData) {
          node.projectName = candidate;
          await storageApi.writeNode(node);
        }
      } else {
        // Individual node file
        nodeData.projectName = candidate;
        await storageApi.writeNode(nodeData);
      }
    } catch {
      console.warn(
        `[importProjectFromZip] skipping corrupt node: ${nodeEntry.filename}`
      );
    }
  }

  // --- Activate the imported project ---------------------------------------
  storageApi.setActiveProjectName(candidate);

  return meta;
}

// ---------------------------------------------------------------------------
// Public API: downloadProjectZip
// ---------------------------------------------------------------------------

/**
 * Export a project as a ZIP file and trigger a browser download.
 *
 * Creates a temporary <a> element with a blob URL and clicks it to start
 * the download, then revokes the URL after a short delay.
 *
 * @param {string} projectName - project name to export
 * @param {object} options - passed to exportProjectToZip
 * @param {boolean} [options.includeChat=true]
 * @param {boolean} [options.includeNodes=true]
 */
export async function downloadProjectZip(projectName, options = {}) {
  const blob = await exportProjectToZip(projectName, options);

  const sanitized = sanitizeName(projectName);
  const filename = `${sanitized}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  // Clean up after a short delay to ensure the download starts.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect a common root folder prefix shared by all entries in a ZIP.
 *
 * For example, if all entries start with "my-project/", this returns
 * "my-project/". If there is no common folder, returns "".
 *
 * @param {ZipEntry[]} entries
 * @returns {string} common prefix (including trailing slash), or ""
 */
function detectRootPrefix(entries) {
  const fileEntries = entries.filter((e) => !e.isDirectory);
  if (fileEntries.length === 0) return "";

  // Find the first slash in each path
  const prefixes = fileEntries.map((e) => {
    const slashIdx = e.filename.indexOf("/");
    return slashIdx >= 0 ? e.filename.slice(0, slashIdx + 1) : "";
  });

  // All must share the same prefix
  const candidate = prefixes[0];
  if (!candidate) return "";

  for (const p of prefixes) {
    if (p !== candidate) return "";
  }

  return candidate;
}
