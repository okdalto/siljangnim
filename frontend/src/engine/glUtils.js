/**
 * Standalone GL utilities extracted from GLEngine.
 * No coupling to GLEngine class — pure functions.
 */

// ---------------------------------------------------------------------------
// JSON persistence helpers (Map/Set ↔ tagged plain objects)
// ---------------------------------------------------------------------------

const _MAP_TAG = "__map__";
const _SET_TAG = "__set__";

/** Recursively convert Maps/Sets to tagged plain objects for IndexedDB storage. */
export function prepareForPersist(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Map) {
    return { [_MAP_TAG]: true, entries: [...value].map(([k, v]) => [k, prepareForPersist(v, seen)]) };
  }
  if (value instanceof Set) {
    return { [_SET_TAG]: true, values: [...value].map(v => prepareForPersist(v, seen)) };
  }
  // Skip DOM nodes, WebGL objects, WebGPU objects, functions
  if (value instanceof HTMLElement || value instanceof WebGLProgram ||
      value instanceof WebGLTexture || value instanceof WebGLBuffer ||
      typeof value === "function") return undefined;
  const ctorName = value.constructor?.name || "";
  if (ctorName.startsWith("GPU")) return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) return value.map(v => prepareForPersist(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const prepared = prepareForPersist(v, seen);
    if (prepared !== undefined) out[k] = prepared;
  }
  return out;
}

/** Recursively restore tagged objects back to Maps/Sets after IndexedDB read. */
export function restoreFromPersist(value) {
  if (value == null || typeof value !== "object") return value;
  if (value[_MAP_TAG] && Array.isArray(value.entries)) {
    return new Map(value.entries.map(([k, v]) => [k, restoreFromPersist(v)]));
  }
  if (value[_SET_TAG] && Array.isArray(value.values)) {
    return new Set(value.values.map(v => restoreFromPersist(v)));
  }
  if (Array.isArray(value)) return value.map(v => restoreFromPersist(v));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = restoreFromPersist(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Video seek helper
// ---------------------------------------------------------------------------

/**
 * Seek a video to exact time and wait for frame decode completion.
 * seeked event alone does NOT guarantee the frame is ready for texImage2D/detect.
 */
export async function seekVideo(video, time) {
  if (!video || !Number.isFinite(time)) return;
  video.currentTime = time;
  await new Promise((resolve) => {
    video.addEventListener("seeked", resolve, { once: true });
  });
  try {
    const bmp = await createImageBitmap(video);
    bmp.close();
  } catch { /* ignore if unsupported */ }
}

// ---------------------------------------------------------------------------
// WebGL state reset
// ---------------------------------------------------------------------------

/**
 * Reset WebGL2 global state to defaults.
 * Called between project switches to prevent state leakage.
 */
export function resetGLState(gl) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  gl.useProgram(null);

  const maxUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
  for (let i = 0; i < Math.min(maxUnits, 16); i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    gl.bindTexture(gl.TEXTURE_3D, null);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }
  gl.activeTexture(gl.TEXTURE0);

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.disable(gl.DITHER);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.disable(gl.SAMPLE_COVERAGE);
  gl.disable(gl.RASTERIZER_DISCARD);

  gl.depthMask(true);
  gl.colorMask(true, true, true, true);
  gl.stencilMask(0xFF);

  gl.depthFunc(gl.LESS);
  gl.blendFunc(gl.ONE, gl.ZERO);
  gl.blendEquation(gl.FUNC_ADD);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
  gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 1);
  gl.clearDepth(1.0);
  gl.clearStencil(0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
}

// ---------------------------------------------------------------------------
// Shader transpilation helper
// ---------------------------------------------------------------------------

/**
 * Auto-transpile a shader source from GLSL to WGSL if applicable.
 * Returns the original source unchanged if not GLSL or transpilation fails.
 */
export function transpileShaderSource(source, looksLikeGLSL, transpileGLSL) {
  if (!looksLikeGLSL(source)) return source;
  try {
    const result = transpileGLSL(source);
    if (result.wgsl && result.errors.length === 0) {
      console.log("[GLEngine] GLSL→WGSL auto-transpiled successfully");
      return result.wgsl;
    }
    if (result.wgsl) {
      console.warn("[GLEngine] GLSL→WGSL transpiled with warnings:", result.errors);
      return result.wgsl;
    }
    console.warn("[GLEngine] GLSL→WGSL transpilation produced no output:", result.errors);
    return source;
  } catch (err) {
    console.warn("[GLEngine] GLSL→WGSL auto-transpile failed:", err.message);
    return source;
  }
}
