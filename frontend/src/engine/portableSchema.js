/**
 * Portable Schema v2 — unified project manifest for local/zip/GitHub storage.
 *
 * The manifest file is `siljangnim-project.json` and lives at the project root.
 * It replaces the old `meta.json` while remaining backwards-compatible.
 */

export const CURRENT_SCHEMA_VERSION = 2;
export const MANIFEST_FILENAME = "siljangnim-project.json";
export const WORKSPACE_MANIFEST_FILENAME = "siljangnim-workspace.json";

// ---------------------------------------------------------------------------
// Provenance builders
// ---------------------------------------------------------------------------

export function buildProvenanceLocal() {
  return {
    source_type: "local",
    github_repo: null,
    github_path: null,
    imported_commit_sha: null,
    forked_from: null,
    original_author: null,
  };
}

export function buildProvenanceGitHub(repo, owner, sha, path) {
  return {
    source_type: "github",
    github_repo: `${owner}/${repo}`,
    github_path: path || null,
    imported_commit_sha: sha || null,
    forked_from: null,
    original_author: owner,
  };
}

export function buildProvenanceZip(originalName) {
  return {
    source_type: "zip",
    github_repo: null,
    github_path: null,
    imported_commit_sha: null,
    forked_from: null,
    original_author: originalName || null,
  };
}

// ---------------------------------------------------------------------------
// Trust defaults
// ---------------------------------------------------------------------------

function defaultTrust(safeMode = false) {
  return {
    safe_mode: safeMode,
    trusted_by: null,
    trusted_at: null,
  };
}

// ---------------------------------------------------------------------------
// Manifest creation
// ---------------------------------------------------------------------------

/**
 * Create a v2 project manifest.
 *
 * @param {object} meta - { name, display_name, description, created_at, updated_at, has_thumbnail }
 * @param {object[]} assets - Array of asset descriptors for Asset Nodes
 * @param {object} opts - { provenance, trust }
 * @returns {object} siljangnim-project.json content
 */
export function createProjectManifest(meta, assets = [], opts = {}) {
  const now = new Date().toISOString();
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    name: meta.name || "untitled",
    display_name: meta.display_name || meta.name || "Untitled",
    description: meta.description || "",
    created_at: meta.created_at || now,
    updated_at: meta.updated_at || now,
    has_thumbnail: meta.has_thumbnail || false,
    backendTarget: meta.backendTarget || "auto",
    provenance: opts.provenance || buildProvenanceLocal(),
    trust: opts.trust || defaultTrust(false),
    assets: assets.map((a) => ({
      filename: a.filename,
      category: a.category || "unknown",
      semantic_name: a.semanticName || a.semantic_name || a.filename,
      mime_type: a.mimeType || a.mime_type || "application/octet-stream",
      file_size: a.fileSize || a.file_size || 0,
      technical_info: a.technicalInfo || a.technical_info || {},
    })),
    excluded_assets: opts.excluded_assets || [],
  };
}

// ---------------------------------------------------------------------------
// Migration: v1 (meta.json) -> v2
// ---------------------------------------------------------------------------

/**
 * Migrate a v1 meta.json object to v2 manifest format.
 * Non-destructive: adds new fields with sensible defaults.
 */
export function migrateV1toV2(oldMeta) {
  if (!oldMeta) return createProjectManifest({ name: "untitled" });

  // Already v2
  if (oldMeta.schema_version === CURRENT_SCHEMA_VERSION) return oldMeta;

  return createProjectManifest(
    {
      name: oldMeta.name || "untitled",
      display_name: oldMeta.display_name || oldMeta.name || "Untitled",
      description: oldMeta.description || "",
      created_at: oldMeta.created_at || new Date().toISOString(),
      updated_at: oldMeta.updated_at || new Date().toISOString(),
      has_thumbnail: oldMeta.has_thumbnail || false,
    },
    [],
    {
      provenance: oldMeta.provenance || buildProvenanceLocal(),
      trust: oldMeta.trust || defaultTrust(false),
    }
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a manifest object.
 * Returns a valid manifest, filling in missing fields with defaults.
 */
export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return createProjectManifest({ name: "untitled" });
  }

  const m = { ...manifest };

  // Ensure schema version
  if (!m.schema_version || m.schema_version < CURRENT_SCHEMA_VERSION) {
    return migrateV1toV2(m);
  }

  // Ensure required fields
  m.name = m.name || "untitled";
  m.display_name = m.display_name || m.name;
  m.description = m.description || "";
  m.created_at = m.created_at || new Date().toISOString();
  m.updated_at = m.updated_at || new Date().toISOString();
  m.has_thumbnail = m.has_thumbnail || false;
  m.backendTarget = m.backendTarget || "auto";

  // Ensure provenance
  if (!m.provenance || typeof m.provenance !== "object") {
    m.provenance = buildProvenanceLocal();
  } else {
    m.provenance = {
      source_type: m.provenance.source_type || "local",
      github_repo: m.provenance.github_repo || null,
      github_path: m.provenance.github_path || null,
      imported_commit_sha: m.provenance.imported_commit_sha || null,
      forked_from: m.provenance.forked_from || null,
      original_author: m.provenance.original_author || null,
    };
  }

  // Ensure trust
  if (!m.trust || typeof m.trust !== "object") {
    m.trust = defaultTrust(false);
  } else {
    m.trust = {
      safe_mode: m.trust.safe_mode || false,
      trusted_by: m.trust.trusted_by || null,
      trusted_at: m.trust.trusted_at || null,
    };
  }

  // Ensure assets array
  if (!Array.isArray(m.assets)) {
    m.assets = [];
  }

  // Ensure excluded_assets array
  if (!Array.isArray(m.excluded_assets)) {
    m.excluded_assets = [];
  }

  return m;
}

// ---------------------------------------------------------------------------
// Workspace manifest (multi-project repo/zip)
// ---------------------------------------------------------------------------

export function createWorkspaceManifest(name, projects = []) {
  return {
    schema_version: 1,
    workspace_name: name || "My Workspace",
    projects: projects.map((p) => ({
      path: p.path,
      display_name: p.display_name || p.path,
    })),
  };
}

export function validateWorkspaceManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return null;
  return {
    schema_version: manifest.schema_version || 1,
    workspace_name: manifest.workspace_name || "Workspace",
    projects: Array.isArray(manifest.projects) ? manifest.projects : [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the core meta fields from a v2 manifest (for backwards compat with
 * code that expects the old meta.json shape).
 */
export function manifestToMeta(manifest) {
  return {
    name: manifest.name,
    display_name: manifest.display_name,
    description: manifest.description,
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
    has_thumbnail: manifest.has_thumbnail,
    // Extra v2 fields kept for reference
    provenance: manifest.provenance,
    trust: manifest.trust,
  };
}

/**
 * Check whether a project manifest indicates safe mode.
 */
export function isSafeMode(manifest) {
  return manifest?.trust?.safe_mode === true;
}

/**
 * Mark a manifest as trusted (disable safe mode).
 */
export function trustManifest(manifest, trustedBy) {
  return {
    ...manifest,
    trust: {
      safe_mode: false,
      trusted_by: trustedBy || "user",
      trusted_at: new Date().toISOString(),
    },
  };
}
