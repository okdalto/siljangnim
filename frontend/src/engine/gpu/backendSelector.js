/**
 * backendSelector — Capability detection and backend creation.
 *
 * Usage:
 *   const backend = await selectBackend(canvas, { prefer: "webgpu" });
 *   // backend is a RendererInterface (WebGLBackend or WebGPUBackend)
 */

import { BackendType } from "./RendererInterface.js";
import { WebGLBackend } from "./WebGLBackend.js";
import { WebGPUBackend } from "./WebGPUBackend.js";

/**
 * Detect available GPU backends.
 * @returns {Promise<{ webgl2: boolean, webgpu: boolean }>}
 */
export async function detectCapabilities() {
  const result = { webgl2: false, webgpu: false };

  // Check WebGL2
  try {
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2");
    result.webgl2 = !!gl;
    // Force context loss to free resources
    const ext = gl?.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  } catch {
    result.webgl2 = false;
  }

  // Check WebGPU
  try {
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      result.webgpu = !!adapter;
    }
  } catch {
    result.webgpu = false;
  }

  return result;
}

/** Cached detection result */
let _cachedCapabilities = null;

/**
 * Get capabilities (cached after first call).
 */
export async function getCapabilities() {
  if (!_cachedCapabilities) {
    _cachedCapabilities = await detectCapabilities();
  }
  return _cachedCapabilities;
}

/**
 * Create and initialize the best available backend.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ prefer?: "webgpu"|"webgl2", forceBackend?: "webgpu"|"webgl2", alpha?: boolean, antialias?: boolean }} options
 * @returns {Promise<RendererInterface>}
 */
export async function selectBackend(canvas, options = {}) {
  const {
    prefer = "webgpu",
    forceBackend = null,
    ...contextOptions
  } = options;

  const caps = await getCapabilities();

  // Forced backend
  if (forceBackend) {
    if (forceBackend === BackendType.WEBGPU) {
      if (!caps.webgpu) throw new Error("WebGPU forced but not available");
      return _initWebGPU(canvas, contextOptions);
    }
    if (forceBackend === BackendType.WEBGL2) {
      if (!caps.webgl2) throw new Error("WebGL2 forced but not available");
      return _initWebGL(canvas, contextOptions);
    }
    throw new Error(`Unknown backend: ${forceBackend}`);
  }

  // Preferred backend with fallback
  if (prefer === BackendType.WEBGPU && caps.webgpu) {
    try {
      return await _initWebGPU(canvas, contextOptions);
    } catch (err) {
      console.warn("[backendSelector] WebGPU init failed, falling back to WebGL2:", err.message);
    }
  }

  if (caps.webgl2) {
    return _initWebGL(canvas, contextOptions);
  }

  throw new Error("No supported GPU backend available (need WebGL2 or WebGPU)");
}

/**
 * Get backend type name for display.
 * @param {RendererInterface} backend
 * @returns {string}
 */
export function getBackendDisplayName(backend) {
  switch (backend?.backendType) {
    case BackendType.WEBGPU: return "WebGPU";
    case BackendType.WEBGL2: return "WebGL2";
    default: return "Unknown";
  }
}

// ─── Internal ────────────────────────────────────────────

async function _initWebGPU(canvas, options) {
  const backend = new WebGPUBackend();
  await backend.init(canvas, options);
  console.log("[backendSelector] Initialized WebGPU backend");
  return backend;
}

async function _initWebGL(canvas, options) {
  const backend = new WebGLBackend();
  await backend.init(canvas, options);
  console.log("[backendSelector] Initialized WebGL2 backend");
  return backend;
}
