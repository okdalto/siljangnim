/**
 * AssetDescriptor — first-class metadata model for workspace assets.
 *
 * Every uploaded file becomes an Asset with a descriptor that holds
 * semantic, technical, and AI-generated metadata.
 */

// ---- Asset categories ----

export const ASSET_CATEGORY = {
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
  MODEL_3D: "model_3d",
  FONT: "font",
  SVG: "svg",
  UNKNOWN: "unknown",
};

const EXT_TO_CATEGORY = {
  png: ASSET_CATEGORY.IMAGE, jpg: ASSET_CATEGORY.IMAGE, jpeg: ASSET_CATEGORY.IMAGE,
  gif: ASSET_CATEGORY.IMAGE, webp: ASSET_CATEGORY.IMAGE, bmp: ASSET_CATEGORY.IMAGE,
  mp3: ASSET_CATEGORY.AUDIO, wav: ASSET_CATEGORY.AUDIO, ogg: ASSET_CATEGORY.AUDIO,
  flac: ASSET_CATEGORY.AUDIO,
  mp4: ASSET_CATEGORY.VIDEO, webm: ASSET_CATEGORY.VIDEO, mov: ASSET_CATEGORY.VIDEO,
  obj: ASSET_CATEGORY.MODEL_3D, fbx: ASSET_CATEGORY.MODEL_3D,
  gltf: ASSET_CATEGORY.MODEL_3D, glb: ASSET_CATEGORY.MODEL_3D,
  ttf: ASSET_CATEGORY.FONT, otf: ASSET_CATEGORY.FONT,
  woff: ASSET_CATEGORY.FONT, woff2: ASSET_CATEGORY.FONT,
  svg: ASSET_CATEGORY.SVG,
};

export function categoryFromFilename(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return EXT_TO_CATEGORY[ext] || ASSET_CATEGORY.UNKNOWN;
}

// ---- Default descriptor factory ----

/**
 * Create a fresh AssetDescriptor from an uploaded file.
 *
 * @param {string} id        - Unique node id (e.g. "asset_<timestamp>")
 * @param {string} filename  - Original filename
 * @param {object} opts      - Optional overrides
 * @returns {AssetDescriptor}
 */
export function createAssetDescriptor(id, filename, opts = {}) {
  const category = opts.category || categoryFromFilename(filename);
  return {
    id,
    filename,
    category,

    // Semantic (user-editable + AI-generated)
    semanticName: opts.semanticName || stripExtension(filename),
    aiSummary: opts.aiSummary || null,
    detectedFeatures: opts.detectedFeatures || [],

    // Technical info (populated by analysis pipeline)
    technicalInfo: opts.technicalInfo || {},

    // Preview
    previewUrl: opts.previewUrl || null,
    thumbnailUrl: opts.thumbnailUrl || null,

    // Processing state
    processingStatus: opts.processingStatus || "pending", // pending | processing | ready | error
    processingError: opts.processingError || null,

    // Processor outputs (from backend pipeline)
    processorOutputs: opts.processorOutputs || [],
    processorMetadata: opts.processorMetadata || {},

    // File info
    mimeType: opts.mimeType || "application/octet-stream",
    fileSize: opts.fileSize || 0,

    // Timestamps
    createdAt: opts.createdAt || new Date().toISOString(),
    updatedAt: opts.updatedAt || new Date().toISOString(),
  };
}

function stripExtension(filename) {
  const parts = filename.split(".");
  if (parts.length > 1) parts.pop();
  return parts.join(".").replace(/[_-]+/g, " ").trim();
}

// ---- Category-specific technical info templates ----

export function buildImageTechInfo(meta) {
  return {
    width: meta.width || 0,
    height: meta.height || 0,
    hasAlpha: meta.hasAlpha ?? false,
    dominantColors: meta.dominantColors || [],
    isTileable: meta.isTileable ?? null,
    textureRoleCandidates: meta.textureRoleCandidates || [],
  };
}

export function buildAudioTechInfo(meta) {
  return {
    duration: meta.duration || 0,
    sampleRate: meta.sample_rate || meta.sampleRate || 0,
    channels: meta.channels || 0,
    bpm: meta.bpm ?? null,
    peaks: meta.peaks || [],
    bandEnergy: meta.bandEnergy || null, // { bass, mid, treble }
    fftSummary: meta.fftSummary || null,
  };
}

export function buildVideoTechInfo(meta) {
  return {
    duration: meta.duration || 0,
    fps: meta.fps || 0,
    width: meta.width || 0,
    height: meta.height || 0,
    frameCount: meta.frame_count || meta.frameCount || 0,
  };
}

export function buildModel3dTechInfo(meta) {
  return {
    vertexCount: meta.vertex_count || meta.vertexCount || 0,
    materialCount: meta.material_count || meta.materialCount || 0,
    hasSkeleton: meta.has_skeleton ?? false,
    boneCount: meta.bone_count || meta.boneCount || 0,
    animationCount: meta.animation_count || meta.animationCount || 0,
    boundingBox: meta.boundingBox || meta.bounding_box || null,
  };
}

export function buildFontTechInfo(meta) {
  return {
    family: meta.family || "",
    glyphCount: meta.glyph_count || meta.glyphCount || 0,
    hasAtlas: !!meta.hasAtlas,
    hasMsdf: !!meta.hasMsdf,
  };
}

export function buildSvgTechInfo(meta) {
  return {
    elementCount: meta.element_count || meta.elementCount || 0,
    pathCount: meta.path_count || meta.pathCount || 0,
    shapeCount: meta.shape_count || meta.shapeCount || 0,
    viewBox: meta.viewBox || null,
  };
}

/**
 * Given a category and raw processor metadata, build the typed technicalInfo.
 */
export function buildTechInfo(category, meta) {
  switch (category) {
    case ASSET_CATEGORY.IMAGE: return buildImageTechInfo(meta);
    case ASSET_CATEGORY.AUDIO: return buildAudioTechInfo(meta);
    case ASSET_CATEGORY.VIDEO: return buildVideoTechInfo(meta);
    case ASSET_CATEGORY.MODEL_3D: return buildModel3dTechInfo(meta);
    case ASSET_CATEGORY.FONT: return buildFontTechInfo(meta);
    case ASSET_CATEGORY.SVG: return buildSvgTechInfo(meta);
    default: return { ...meta };
  }
}

// ---- Serialisation helpers ----

export function serializeDescriptor(desc) {
  return { ...desc };
}

export function deserializeDescriptor(raw) {
  return {
    ...createAssetDescriptor(raw.id, raw.filename),
    ...raw,
  };
}
