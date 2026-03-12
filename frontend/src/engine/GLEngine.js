/**
 * GLEngine — Rendering engine with WebGL2/WebGPU backend abstraction.
 *
 * The agent writes raw WebGL2 JS code in script.setup / script.render / script.cleanup.
 * Shader compilation helpers and geometry creators are exposed via ctx.utils.
 *
 * The engine now supports a backend abstraction layer (engine/gpu/) that allows
 * backend-agnostic rendering through ctx.renderer. Direct ctx.gl access is preserved
 * for backward compatibility with existing scenes.
 */

import { getAllUploadBlobUrls, getUploadBlobUrl, readJson, writeJson, getProjectManifest } from "./storage.js";
import { createProgram, compileShader, DEFAULT_QUAD_VERTEX_SHADER, DEFAULT_3D_VERTEX_SHADER } from "./shaderUtils.js";
import { createQuadGeometry, createBoxGeometry, createSphereGeometry, createPlaneGeometry } from "./geometries.js";
import { uniformSetter, GEOMETRY_CREATORS } from "./uniformSetters.js";
import AudioManager from "./AudioManager.js";
import MediaPipeManager from "./MediaPipeManager.js";
import MIDIManager from "./MIDIManager.js";
import TFDetectorManager from "./TFDetectorManager.js";
import SAMManager from "./SAMManager.js";
import OSCManager from "./OSCManager.js";
import MicManager from "./MicManager.js";
import { sampleCurve } from "../utils/curves.js";
import * as mat4 from "./mat4.js";
import * as quat from "./quat.js";
import { createPingPong } from "./pingPong.js";
import { createOrbitCamera } from "./orbitCamera.js";
import * as noise from "./noise.js";
import * as glsl from "./glslSnippets.js";
import { createVerletSystem } from "./verletPhysics.js";
import VideoFrameExtractor from "./VideoFrameExtractor.js";
import { selectBackend, getBackendDisplayName, BackendType } from "./gpu/index.js";
import * as shaderTarget from "./gpu/shaderTarget.js";
import { RenderGraph } from "./gpu/renderGraph.js";
import { transpileGLSL, transpileFragmentGLSL, transpileVertexGLSL } from "./gpu/glslToWgsl.js";

/**
 * JSON replacer/reviver for preprocess state serialization.
 * Converts Maps to tagged objects so they survive JSON round-trip.
 */
const _MAP_TAG = "__map__";
const _SET_TAG = "__set__";

/** Recursively convert Maps/Sets to tagged plain objects for IndexedDB storage. */
function _prepareForPersist(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Map) {
    return { [_MAP_TAG]: true, entries: [...value].map(([k, v]) => [k, _prepareForPersist(v, seen)]) };
  }
  if (value instanceof Set) {
    return { [_SET_TAG]: true, values: [...value].map(v => _prepareForPersist(v, seen)) };
  }
  // Skip DOM nodes, WebGL objects, WebGPU objects, functions
  if (value instanceof HTMLElement || value instanceof WebGLProgram ||
      value instanceof WebGLTexture || value instanceof WebGLBuffer ||
      typeof value === "function") return undefined;
  // Skip WebGPU native objects (not serializable to IndexedDB)
  // Check constructor name prefix for broad coverage without risking ReferenceError
  const ctorName = value.constructor?.name || "";
  if (ctorName.startsWith("GPU")) return undefined;
  // Prevent circular references
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) return value.map(v => _prepareForPersist(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const prepared = _prepareForPersist(v, seen);
    if (prepared !== undefined) out[k] = prepared;
  }
  return out;
}

/** Recursively restore tagged objects back to Maps/Sets after IndexedDB read. */
function _restoreFromPersist(value) {
  if (value == null || typeof value !== "object") return value;
  if (value[_MAP_TAG] && Array.isArray(value.entries)) {
    return new Map(value.entries.map(([k, v]) => [k, _restoreFromPersist(v)]));
  }
  if (value[_SET_TAG] && Array.isArray(value.values)) {
    return new Set(value.values.map(v => _restoreFromPersist(v)));
  }
  if (Array.isArray(value)) return value.map(v => _restoreFromPersist(v));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = _restoreFromPersist(v);
  }
  return out;
}

/**
 * Seek a video to exact time and wait for frame decode completion.
 * seeked event alone does NOT guarantee the frame is ready for texImage2D/detect.
 */
async function _seekVideo(video, time) {
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

export default class GLEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ preferBackend?: "webgpu"|"webgl2", forceBackend?: "webgpu"|"webgl2" }} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this._backendOptions = options;

    // --- Backend abstraction (initialized async via initBackend()) ---
    /** @type {import('./gpu/RendererInterface.js').RendererInterface|null} */
    this._backend = null;
    this._backendReady = false;
    this._backendPromise = null; // resolves when initBackend() completes
    this.onBackendReady = null; // callback(backendType)

    // --- Legacy WebGL2 direct access (always available as fallback) ---
    this.gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!this.gl) {
      throw new Error("WebGL2 not supported");
    }

    // Enable float textures for FBOs
    this._extColorBufferFloat = this.gl.getExtension("EXT_color_buffer_float");
    if (!this._extColorBufferFloat) {
      console.warn("[GLEngine] EXT_color_buffer_float not available — float FBOs may fail");
    }
    // Enable linear filtering of 32-bit float textures
    this._extFloatLinear = this.gl.getExtension("OES_texture_float_linear");
    if (!this._extFloatLinear) {
      console.warn("[GLEngine] OES_texture_float_linear not available — rgba32f will use NEAREST filtering");
    }

    // State
    this._running = false;
    this._rafId = null;
    this._startTime = performance.now() / 1000;
    this._lastFrameTime = this._startTime;
    this._frameCount = 0;
    this._paused = false;
    this._pausedTime = 0;
    this._pauseStart = 0;
    this._needsPausedRender = false;

    // Scene data
    this._scene = null;
    this._customUniforms = {};
    this._mouse = [0, 0, 0, 0]; // x, y, clickX, clickY (normalized)
    this._mouseSnapshot = [0, 0, 0, 0]; // snapshot at start of current frame
    this._mousePrev = [0, 0, 0, 0]; // previous frame's mouse state
    this._mouseDown = false;
    this._mouseDownSnapshot = false;
    this._mouseDownPrev = false;
    this._mouseHover = false;
    this._pressedKeys = new Set();
    this._keyboardBindings = {}; // uniform name → KeyboardEvent.code

    // Keyframe manager (set externally via setKeyframeManager)
    this._keyframeManager = null;

    // Active node ID for per-node preprocess state scoping
    this._activeNodeId = null;

    // Audio manager
    this._audioManager = new AudioManager();

    // MediaPipe Vision manager
    this._mediapipeManager = new MediaPipeManager();

    // MIDI manager
    this._midiManager = new MIDIManager();

    // TensorFlow.js detector manager
    this._tfDetectorManager = new TFDetectorManager();

    // SAM (Segment Anything Model) manager
    this._samManager = new SAMManager();

    // OSC manager
    this._oscManager = new OSCManager();
    this._micManager = new MicManager();

    // Manager registry for centralized cleanup
    this._managers = [
      this._audioManager,
      this._mediapipeManager,
      this._midiManager,
      this._tfDetectorManager,
      this._samManager,
      this._oscManager,
      this._micManager,
    ];

    // Blob URL tracking for memory leak prevention
    this._individualBlobUrls = new Set();

    // Script mode
    this._scriptCtx = null;
    this._scriptSetupFn = null;
    this._scriptRenderFn = null;
    this._scriptCleanupFn = null;
    this._setupReady = false; // true after async setup() completes
    this._loadGeneration = 0; // incremented on each loadScene to cancel stale async setups

    // Timeline
    this._duration = 0;      // 0 = infinite (no loop)
    this._loop = true;       // true = loop, false = stop at end
    this.onTime = null;      // callback(currentTime) — called every frame
    this.onTimelineEnd = null; // callback() — called when non-loop playback reaches end

    // Error state
    this.onError = null;     // callback(error)
    this._lastErrorMessage = null; // debounce repeated render errors
    this.onFPS = null;       // callback(fps)
    this._fpsCounter = { frames: 0, lastTime: performance.now() };

    // Handle context loss
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this._scriptCtx = null; // prevent hot-reload after context restore
      this.stop();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      if (this._scene) {
        this.loadScene(this._scene);
        this.start();
      }
    });
  }

  /**
   * Initialize the backend abstraction layer (async).
   * Call after construction. Falls back to WebGL2 if WebGPU unavailable.
   * Existing scenes continue to work via ctx.gl regardless.
   */
  async initBackend() {
    this._backendPromise = this._initBackendInner();
    return this._backendPromise;
  }

  async _initBackendInner() {
    try {
      // For backend abstraction, we need a separate canvas or to
      // coordinate with the existing GL context. Since we can't use
      // the same canvas for both WebGL2 and WebGPU simultaneously,
      // the backend is initialized on a NEW offscreen canvas when WebGPU,
      // or wraps the existing GL context for WebGL2.
      const prefer = this._backendOptions.preferBackend || "webgl2";
      const force = this._backendOptions.forceBackend || null;

      if (prefer === "webgpu" || force === "webgpu") {
        // WebGPU needs its own canvas context — create offscreen
        // For now, the abstraction backend is a secondary renderer
        // that can be used for compute and offscreen rendering.
        // The primary display path remains the direct GL context.
        try {
          const { WebGPUBackend } = await import("./gpu/WebGPUBackend.js");
          const offscreen = new OffscreenCanvas(this.canvas.width, this.canvas.height);
          const gpuBackend = new WebGPUBackend();
          await gpuBackend.init(offscreen, { alpha: false });
          this._backend = gpuBackend;
        } catch (err) {
          const failMsg = `WebGPU initialization failed: ${err.message}. Falling back to WebGL2.`;
          console.error("[GLEngine]", failMsg);
          this.onError?.(new Error(failMsg));
          window.dispatchEvent(new ErrorEvent("error", { message: failMsg, error: new Error(failMsg) }));
          await this._initWebGLBackend();
        }
      } else {
        await this._initWebGLBackend();
      }

      this._backendReady = true;
      this.onBackendReady?.(this._backend.backendType);
    } catch (err) {
      const failMsg = `Backend initialization failed: ${err.message}`;
      console.error("[GLEngine]", failMsg);
      this.onError?.(new Error(failMsg));
      window.dispatchEvent(new ErrorEvent("error", { message: failMsg, error: new Error(failMsg) }));
    }
  }

  async _initWebGLBackend() {
    const { WebGLBackend } = await import("./gpu/WebGLBackend.js");
    const backend = new WebGLBackend();
    // Initialize wrapping the existing GL context
    backend.canvas = this.canvas;
    backend.gl = this.gl;
    backend._extensions = {
      colorBufferFloat: this._extColorBufferFloat,
      floatLinear: this._extFloatLinear,
    };
    backend.ready = true;
    this._backend = backend;
  }

  /**
   * Switch backend at runtime (e.g. when backendTarget changes).
   * Disposes the old backend and initializes the new one.
   */
  async switchBackend(preferBackend) {
    if (this._backendOptions.preferBackend === preferBackend) return;
    // Dispose old backend
    if (this._backend) {
      this._backend.dispose();
      this._backend = null;
      this._backendReady = false;
    }
    this._backendOptions = { ...this._backendOptions, preferBackend };
    await this.initBackend();
  }

  /** Get the active backend (or null if not initialized). */
  get backend() { return this._backend; }

  /** Get the backend display name (e.g. "WebGL2" or "WebGPU"). */
  get backendName() {
    return this._backend ? getBackendDisplayName(this._backend) : "WebGL2";
  }

  /**
   * Auto-blit WebGPU OffscreenCanvas to the visible WebGL2 canvas after render.
   * Called automatically by the render loop — agent code does NOT need to call
   * ctx.utils.blitToCanvas() manually (though it still works if they do).
   */
  _autoBlitIfWebGPU(ctx) {
    if (this._backend?.backendType === BackendType.WEBGPU && this._backend?.canvas) {
      ctx.utils.blitToCanvas();
    }
  }

  /**
   * Recreate the WebGL2 context with different options (e.g. alpha).
   * Saves the current scene, destroys old context, creates new one,
   * re-enables extensions, and reloads the scene.
   */
  recreateContext({ alpha = false } = {}) {
    const savedScene = this._scene;
    const wasRunning = this._running;

    // Dispose current scene & stop render loop
    this.stop();
    this._disposeScene();

    // Lose old context
    const loseExt = this.gl.getExtension("WEBGL_lose_context");
    if (loseExt) loseExt.loseContext();

    // Create new context
    this.gl = this.canvas.getContext("webgl2", {
      alpha,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!this.gl) {
      throw new Error("WebGL2 not supported on context recreation");
    }

    // Re-enable extensions
    this._extColorBufferFloat = this.gl.getExtension("EXT_color_buffer_float");
    this._extFloatLinear = this.gl.getExtension("OES_texture_float_linear");

    // Reload scene
    if (savedScene) {
      this.loadScene(savedScene);
    }

    if (wasRunning) {
      this.start();
    }
  }

  /**
   * Load a scene JSON and set up script execution.
   */
  async loadScene(sceneJSON) {
    const gl = this.gl;
    if (!gl) return;

    // --- HOT RELOAD: setup이 동일하면 render/cleanup만 교체 ---
    const newScript = sceneJSON.script || {};
    const prevScript = this._scene?.script || {};
    if (
      this._scriptCtx &&
      newScript.setup === prevScript.setup &&
      newScript.setup !== undefined
    ) {
      this._scene = sceneJSON;
      this._lastErrorMessage = null;
      try {
        this._scriptRenderFn = newScript.render
          ? new Function("ctx", `return (async () => { ${newScript.render} })();`)
          : null;
        // cleanup 함수는 교체만 하고 실행하지 않음 — state 보존이 목적
        this._scriptCleanupFn = newScript.cleanup
          ? new Function("ctx", newScript.cleanup)
          : null;
      } catch (err) {
        // Compilation failed — clear the broken function and mark setup as failed
        // so the render loop doesn't try to use it.
        this._scriptRenderFn = null;
        this._setupReady = false;
        console.error("[GLEngine] Hot-reload compile error:", err);
        this.onError?.(err);
        window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
      }
      // Merge new uniform defaults (only if not already set)
      if (sceneJSON.uniforms) {
        for (const [name, def] of Object.entries(sceneJSON.uniforms)) {
          if (def?.value !== undefined && !(name in this._customUniforms)) {
            this._customUniforms[name] = def.value;
          }
        }
      }
      return;
    }

    // --- FULL RELOAD ---
    this._disposeScene();
    this._setupReady = false;
    const generation = ++this._loadGeneration; // cancel any in-flight async setup
    this._scene = sceneJSON;
    this._lastErrorMessage = null; // reset error debounce for new scene

    // Restore persisted preprocess state from IndexedDB if not already in memory
    if (!this._preprocessState) {
      await this._restorePreprocessState();
    }

    const script = sceneJSON.script || {};
    const setupBody = script.setup || "";
    const renderBody = script.render || "";
    const cleanupBody = script.cleanup || "";

    const ctx = {
      gl: this.gl,
      canvas: this.canvas,
      state: { ...(this._preprocessState || {}) },
      uploads: {},
      isOffline: false, // populated with blob URLs for uploaded files
      _registeredVideos: new Map(),
      utils: {
        /**
         * Register a video element for automatic time-sync during offline recording.
         * In offline mode, the engine will seek the video to ctx.time before each frame.
         * @param {HTMLVideoElement} video - The video element to register
         * @param {Object} [options] - { loop: true } (default: loop)
         */
        registerVideo: (video, options = {}) => {
          ctx._registeredVideos.set(video, { loop: options.loop !== false });
        },
        unregisterVideo: (video) => {
          ctx._registeredVideos.delete(video);
        },

        seekVideo: _seekVideo,

        /**
         * Fetch JSON from a URL. Returns parsed object.
         */
        fetchJSON: async (url) => {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`fetchJSON failed: ${resp.status} ${resp.statusText}`);
          return resp.json();
        },

        /**
         * Fetch text from a URL. Returns string.
         */
        fetchText: async (url) => {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`fetchText failed: ${resp.status} ${resp.statusText}`);
          return resp.text();
        },

        /**
         * Fetch binary data from a URL. Returns ArrayBuffer.
         */
        fetchBuffer: async (url) => {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`fetchBuffer failed: ${resp.status} ${resp.statusText}`);
          return resp.arrayBuffer();
        },

        /**
         * Blit the WebGPU OffscreenCanvas to the visible WebGL canvas.
         * Call once per frame in render() after WebGPU rendering is done.
         * Sets up a fullscreen-quad blit program on first call (cached).
         */
        blitToCanvas: () => {
          const g = this.gl;
          const src = this._backend?.canvas;
          if (!g || !src) return;
          // Lazy-init blit resources
          if (!this._blitProgram) {
            const vs = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0,1);}`;
            const fs = `#version 300 es
precision mediump float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
void main(){fragColor=texture(u_tex,v_uv);}`;
            this._blitProgram = createProgram(g, vs, fs);
            this._blitTex = g.createTexture();
            const buf = g.createBuffer();
            g.bindBuffer(g.ARRAY_BUFFER, buf);
            g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), g.STATIC_DRAW);
            this._blitVAO = g.createVertexArray();
            g.bindVertexArray(this._blitVAO);
            g.enableVertexAttribArray(0);
            g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
            g.bindVertexArray(null);
          }
          g.bindFramebuffer(g.FRAMEBUFFER, null);
          g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
          g.useProgram(this._blitProgram);
          g.activeTexture(g.TEXTURE0);
          g.bindTexture(g.TEXTURE_2D, this._blitTex);
          g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
          g.bindVertexArray(this._blitVAO);
          g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
          g.bindVertexArray(null);
        },

        createProgram: (vertSource, fragSource) => createProgram(this.gl, vertSource, fragSource),
        compileShader: (type, source) => compileShader(this.gl, type, source),
        createQuadGeometry,
        createBoxGeometry,
        createSphereGeometry,
        createPlaneGeometry,
        GEOMETRY_CREATORS,
        DEFAULT_QUAD_VERTEX_SHADER,
        DEFAULT_3D_VERTEX_SHADER,

        sampleCurve,

        /**
         * Upload an image/video/canvas source to a texture with Y-flip.
         * Handles UNPACK_FLIP_Y_WEBGL automatically so GL coordinates match.
         */
        uploadTexture: (texture, source) => {
          const g = this.gl;
          // If source is a video element with an offline frame, use that instead
          const actual = source._offlineFrame || source;
          g.bindTexture(g.TEXTURE_2D, texture);
          g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
          g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, actual);
          g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        },

        /**
         * Load an image from URL → Promise<{ texture, width, height }>.
         * Y-flipped automatically for GL coordinates.
         */
        loadImage: async (url) => {
          const g = this.gl;
          // For /api/uploads/* URLs, load directly from IndexedDB
          // (Service Worker may not be active on first load / hard refresh)
          let imgSrc = url;
          if (url.includes("/api/uploads/")) {
            const filename = url.split("/api/uploads/").pop();
            try {
              imgSrc = await this._getUploadBlobUrl(filename);
            } catch {
              // Fall back to original URL (SW might handle it)
              imgSrc = url;
            }
          }
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              const texture = g.createTexture();
              g.bindTexture(g.TEXTURE_2D, texture);
              g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
              g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img);
              g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
              g.generateMipmap(g.TEXTURE_2D);
              g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
              g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
              g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
              g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);
              // Revoke blob URL to free memory
              if (imgSrc !== url) URL.revokeObjectURL(imgSrc);
              resolve({ texture, width: img.width, height: img.height });
            };
            img.onerror = () => {
              if (imgSrc !== url) URL.revokeObjectURL(imgSrc);
              reject(new Error(`Failed to load image: ${url}`));
            };
            img.src = imgSrc;
          });
        },

        /**
         * Start webcam → Promise<{ video, texture, stream }>.
         * Use updateWebcamTexture() each frame to refresh.
         */
        initWebcam: () => {
          const g = this.gl;
          const texture = g.createTexture();
          g.bindTexture(g.TEXTURE_2D, texture);
          g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

          return navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
            const video = document.createElement("video");
            video.playsInline = true;
            video.muted = true;
            video.srcObject = stream;
            return new Promise((resolve) => {
              video.onloadeddata = () => {
                video.play();
                resolve({ video, texture, stream });
              };
            });
          });
        },

        /**
         * Refresh a webcam/video texture each frame. Y-flipped for GL.
         */
        updateVideoTexture: (texture, video) => {
          const g = this.gl;
          // Prefer decoded offline frame (VideoFrame from WebCodecs)
          const source = video._offlineFrame || video;
          const ready = video._offlineFrame || video.readyState >= video.HAVE_CURRENT_DATA;
          if (ready) {
            g.bindTexture(g.TEXTURE_2D, texture);
            g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
            g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, source);
            g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
          }
        },

        /**
         * Create a ready-to-draw mesh from a geometry object and a shader program.
         * Handles VAO, VBOs, optional index buffer, and attribute binding automatically.
         * @param {WebGLProgram} prog
         * @param {object} geometry — from createQuadGeometry / createBoxGeometry / etc.
         * @returns {{ vao, draw, dispose }}
         */
        createMesh: (prog, geometry) => {
          const g = this.gl;
          const vao = g.createVertexArray();
          g.bindVertexArray(vao);
          const buffers = [];

          // Attribute mapping: geometry key → { name, size }
          const attribs = [
            { key: "positions", name: "a_position", size: geometry.dimension || 3 },
            { key: "normals",   name: "a_normal",   size: 3 },
            { key: "uvs",      name: "a_uv",       size: 2 },
          ];
          for (const attr of attribs) {
            const data = geometry[attr.key];
            if (!data) continue;
            const loc = g.getAttribLocation(prog, attr.name);
            if (loc < 0) continue;
            const buf = g.createBuffer();
            g.bindBuffer(g.ARRAY_BUFFER, buf);
            g.bufferData(g.ARRAY_BUFFER, data, g.STATIC_DRAW);
            g.enableVertexAttribArray(loc);
            g.vertexAttribPointer(loc, attr.size, g.FLOAT, false, 0, 0);
            buffers.push(buf);
          }

          // Index buffer
          let indexBuf = null;
          const hasIndices = !!geometry.indices;
          if (hasIndices) {
            indexBuf = g.createBuffer();
            g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, indexBuf);
            g.bufferData(g.ELEMENT_ARRAY_BUFFER, geometry.indices, g.STATIC_DRAW);
          }
          g.bindVertexArray(null);

          const vertexCount = geometry.vertexCount;
          const indexType = hasIndices && geometry.indices instanceof Uint32Array
            ? g.UNSIGNED_INT : g.UNSIGNED_SHORT;

          return {
            vao,
            draw: (mode) => {
              g.bindVertexArray(vao);
              if (hasIndices) {
                g.drawElements(mode ?? g.TRIANGLES, vertexCount, indexType, 0);
              } else {
                g.drawArrays(mode ?? g.TRIANGLES, 0, vertexCount);
              }
              g.bindVertexArray(null);
            },
            dispose: () => {
              g.deleteVertexArray(vao);
              for (const b of buffers) g.deleteBuffer(b);
              if (indexBuf) g.deleteBuffer(indexBuf);
            },
          };
        },

        /**
         * Get all active uniform locations from a program, with setter methods.
         * Returns an object keyed by uniform name, each with a .set(...) method.
         * @param {WebGLProgram} prog
         * @returns {object} uniforms — e.g. uniforms.u_time.set(1.0)
         */
        getUniforms: (prog) => {
          const g = this.gl;
          const count = g.getProgramParameter(prog, g.ACTIVE_UNIFORMS);
          const uniforms = {};
          for (let i = 0; i < count; i++) {
            const info = g.getActiveUniform(prog, i);
            if (!info) continue;
            const name = info.name.replace(/\[0\]$/, "");
            const loc = g.getUniformLocation(prog, name);
            if (!loc) continue;
            const setter = uniformSetter(g, info.type, loc);
            uniforms[name] = { location: loc, type: info.type, set: setter };
          }
          return uniforms;
        },

        // --- New utility modules ---
        mat4,
        quat,
        createPingPong: (w, h, opts) => createPingPong(this.gl, w, h, opts),
        createOrbitCamera,
        noise,
        glsl,
        createVerletSystem,

        /**
         * Create a fullscreen effect from a fragment shader source.
         * Handles program creation, quad geometry, VAO, uniform binding.
         * @param {string} fragSrc - Fragment shader source (GLSL #version 300 es)
         * @param {object} [defaultUniforms] - Default uniform values
         * @returns {{ prog, uniforms, draw(overrides?), drawToTarget(rt, overrides?), dispose() }}
         */
        createFullscreenEffect: (fragSrc, defaultUniforms = {}) => {
          const g = this.gl;
          const prog = createProgram(g, DEFAULT_QUAD_VERTEX_SHADER, fragSrc);
          const quadGeom = createQuadGeometry();

          // Build VAO
          const vao = g.createVertexArray();
          g.bindVertexArray(vao);
          const buf = g.createBuffer();
          g.bindBuffer(g.ARRAY_BUFFER, buf);
          g.bufferData(g.ARRAY_BUFFER, quadGeom.positions, g.STATIC_DRAW);
          const posLoc = g.getAttribLocation(prog, "a_position");
          if (posLoc >= 0) {
            g.enableVertexAttribArray(posLoc);
            g.vertexAttribPointer(posLoc, quadGeom.dimension || 2, g.FLOAT, false, 0, 0);
          }
          g.bindVertexArray(null);

          // Auto-discover uniforms
          const uCount = g.getProgramParameter(prog, g.ACTIVE_UNIFORMS);
          const uniforms = {};
          for (let i = 0; i < uCount; i++) {
            const info = g.getActiveUniform(prog, i);
            if (!info) continue;
            const name = info.name.replace(/\[0\]$/, "");
            const loc = g.getUniformLocation(prog, name);
            if (!loc) continue;
            uniforms[name] = { location: loc, type: info.type, set: uniformSetter(g, info.type, loc) };
          }

          const _applyUniforms = (overrides) => {
            const merged = { ...defaultUniforms, ...overrides };
            for (const [key, val] of Object.entries(merged)) {
              if (uniforms[key]) {
                if (Array.isArray(val)) uniforms[key].set(...val);
                else uniforms[key].set(val);
              }
            }
          };

          const _draw = (overrides, targetFBO) => {
            if (targetFBO) {
              g.bindFramebuffer(g.FRAMEBUFFER, targetFBO.framebuffer || targetFBO);
            }
            g.useProgram(prog);
            // Auto-bind built-in uniforms
            if (uniforms.u_time) uniforms.u_time.set(ctx.time ?? 0);
            if (uniforms.u_resolution) uniforms.u_resolution.set(ctx.resolution?.[0] ?? g.canvas.width, ctx.resolution?.[1] ?? g.canvas.height);
            if (uniforms.u_mouse && ctx.mouse) uniforms.u_mouse.set(...ctx.mouse);
            _applyUniforms(overrides);
            g.bindVertexArray(vao);
            g.drawArrays(g.TRIANGLES, 0, quadGeom.vertexCount);
            g.bindVertexArray(null);
            if (targetFBO) {
              g.bindFramebuffer(g.FRAMEBUFFER, null);
            }
          };

          return {
            prog,
            uniforms,
            draw: (overrides) => _draw(overrides, null),
            drawToTarget: (rt, overrides) => _draw(overrides, rt),
            dispose: () => {
              g.deleteProgram(prog);
              g.deleteVertexArray(vao);
              g.deleteBuffer(buf);
            },
          };
        },

        /**
         * Create a multi-pass post-process chain from an array of effects.
         * Uses ping-pong FBOs internally.
         * @param {Array<{fragSrc: string, uniforms?: object}>} effects
         * @returns {{ drawToScreen(inputTexture), dispose() }}
         */
        createPostProcessChain: (effects) => {
          const g = this.gl;
          const w = g.canvas.width;
          const h = g.canvas.height;
          const pp = createPingPong(g, w, h, { filter: g.LINEAR });

          // Build an effect pipeline from fragment sources
          const fxPipeline = effects.map((fx) => {
            const prog = createProgram(g, DEFAULT_QUAD_VERTEX_SHADER, fx.fragSrc);
            const quadGeom = createQuadGeometry();
            const vao = g.createVertexArray();
            g.bindVertexArray(vao);
            const buf = g.createBuffer();
            g.bindBuffer(g.ARRAY_BUFFER, buf);
            g.bufferData(g.ARRAY_BUFFER, quadGeom.positions, g.STATIC_DRAW);
            const posLoc = g.getAttribLocation(prog, "a_position");
            if (posLoc >= 0) {
              g.enableVertexAttribArray(posLoc);
              g.vertexAttribPointer(posLoc, quadGeom.dimension || 2, g.FLOAT, false, 0, 0);
            }
            g.bindVertexArray(null);

            // Get uniforms
            const uCount = g.getProgramParameter(prog, g.ACTIVE_UNIFORMS);
            const uniforms = {};
            for (let i = 0; i < uCount; i++) {
              const info = g.getActiveUniform(prog, i);
              if (!info) continue;
              const name = info.name.replace(/\[0\]$/, "");
              const loc = g.getUniformLocation(prog, name);
              if (!loc) continue;
              uniforms[name] = { location: loc, type: info.type, set: uniformSetter(g, info.type, loc) };
            }

            return { prog, vao, buf, uniforms, vertexCount: quadGeom.vertexCount, defaults: fx.uniforms || {} };
          });

          return {
            drawToScreen: (inputTexture) => {
              let currentInput = inputTexture;
              for (let i = 0; i < fxPipeline.length; i++) {
                const fx = fxPipeline[i];
                const isLast = i === fxPipeline.length - 1;

                if (!isLast) {
                  g.bindFramebuffer(g.FRAMEBUFFER, pp.write().framebuffer);
                } else {
                  g.bindFramebuffer(g.FRAMEBUFFER, null);
                }
                g.viewport(0, 0, isLast ? g.canvas.width : w, isLast ? g.canvas.height : h);
                g.useProgram(fx.prog);

                // Bind input texture
                g.activeTexture(g.TEXTURE0);
                g.bindTexture(g.TEXTURE_2D, currentInput);
                if (fx.uniforms.u_texture) fx.uniforms.u_texture.set(0);
                if (fx.uniforms.u_input) fx.uniforms.u_input.set(0);

                // Auto-bind built-ins
                if (fx.uniforms.u_time) fx.uniforms.u_time.set(ctx.time ?? 0);
                if (fx.uniforms.u_resolution) fx.uniforms.u_resolution.set(ctx.resolution?.[0] ?? g.canvas.width, ctx.resolution?.[1] ?? g.canvas.height);

                // Apply effect-specific defaults
                for (const [key, val] of Object.entries(fx.defaults)) {
                  if (fx.uniforms[key]) {
                    if (Array.isArray(val)) fx.uniforms[key].set(...val);
                    else fx.uniforms[key].set(val);
                  }
                }

                g.bindVertexArray(fx.vao);
                g.drawArrays(g.TRIANGLES, 0, fx.vertexCount);
                g.bindVertexArray(null);

                if (!isLast) {
                  currentInput = pp.write().texture;
                  pp.swap();
                }
              }
            },
            dispose: () => {
              for (const fx of fxPipeline) {
                g.deleteProgram(fx.prog);
                g.deleteVertexArray(fx.vao);
                g.deleteBuffer(fx.buf);
              }
              pp.dispose();
            },
          };
        },

        createRenderTarget: (width, height, options = {}) => {
          const g = this.gl;
          const {
            internalFormat = g.RGBA8,
            format = g.RGBA,
            type = g.UNSIGNED_BYTE,
            filter = g.LINEAR,
            depth = false,
          } = options;
          const texture = g.createTexture();
          g.bindTexture(g.TEXTURE_2D, texture);
          g.texImage2D(g.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, filter);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, filter);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
          const framebuffer = g.createFramebuffer();
          g.bindFramebuffer(g.FRAMEBUFFER, framebuffer);
          g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texture, 0);
          let depthRenderbuffer = null;
          if (depth) {
            depthRenderbuffer = g.createRenderbuffer();
            g.bindRenderbuffer(g.RENDERBUFFER, depthRenderbuffer);
            g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH_COMPONENT24, width, height);
            g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.RENDERBUFFER, depthRenderbuffer);
          }
          g.bindFramebuffer(g.FRAMEBUFFER, null);
          return { framebuffer, texture, width, height, depthRenderbuffer, _isRenderTarget: true };
        },
      },

      // --- Renderer Abstraction Layer ---
      // backend-agnostic API (available after initBackend())
      renderer: this._backend || null,
      backendType: this._backend?.backendType || BackendType.WEBGL2,

      // Shader target helpers (dual GLSL/WGSL)
      shaderTarget,
      RenderGraph,
    };
    // Audio API (methods delegate to AudioManager, properties updated per frame)
    this._audioManager.reset();
    ctx.audioContext = this._audioManager.getAudioContext();
    ctx.audioDestination = this._audioManager.getRecordingDestination();
    ctx.audio = {
      load: (url) => this._audioManager.load(url),
      play: (offset) => this._audioManager.play(offset),
      pause: () => this._audioManager.pause(),
      stop: () => this._audioManager.stop(),
      setVolume: (v) => this._audioManager.setVolume(v),
      isLoaded: false,
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      energy: 0,
      frequencyData: null,
      waveformData: null,
      fftTexture: null,
      volume: 1,
    };

    // MediaPipe Vision API (user calls detect() explicitly with their video source)
    const mpManager = this._mediapipeManager;
    ctx.mediapipe = {
      init: (options) => mpManager.init(this.gl, options),
      detect: (source, timestamp) => {
        // In offline mode, use ctx.time-based timestamp (ms) for monotonic MediaPipe input
        const ts = timestamp ?? (ctx.isOffline ? Math.round(ctx.time * 1000) : undefined);
        mpManager.detect(source, ts);
        mpManager.updateTextures(this.gl);
      },
      get initialized() { return mpManager.initialized; },
      get pose() { return mpManager.pose; },
      get hands() { return mpManager.hands; },
      get faceMesh() { return mpManager.faceMesh; },
      get poseTexture() { return mpManager.poseTexture; },
      get handsTexture() { return mpManager.handsTexture; },
      get faceMeshTexture() { return mpManager.faceMeshTexture; },
    };

    // MIDI API
    const midiMgr = this._midiManager;
    ctx.midi = {
      init: () => midiMgr.init(),
      get initialized() { return midiMgr.initialized; },
      get devices() { return midiMgr.devices; },
      selectInput: (id) => midiMgr.selectInput(id),
      mapCC: (cc, uniform, min, max) => midiMgr.mapCC(cc, uniform, min, max),
      unmapCC: (cc) => midiMgr.unmapCC(cc),
      get cc() { return midiMgr.cc; },
      get notes() { return midiMgr.notes; },
      get activeNotes() { return midiMgr.activeNotes; },
      get pitchBend() { return midiMgr.pitchBend; },
      get lastCC() { return midiMgr.lastCC; },
      get lastNote() { return midiMgr.lastNote; },
      get texture() { return midiMgr.texture; },
    };

    // TensorFlow.js object detection API
    const tfMgr = this._tfDetectorManager;
    ctx.detector = {
      init: (options) => tfMgr.init(options),
      load: (options) => tfMgr.init(options), // alias for init
      detect: async (source, options) => {
        const opts = ctx.isOffline ? { isOffline: true, ...options } : options;
        const results = await tfMgr.detect(source, opts);
        if (!opts?.immediate) tfMgr.updateTextures(this.gl);
        return results;
      },
      get initialized() { return tfMgr.initialized; },
      get detections() { return tfMgr.detections; },
      get count() { return tfMgr.count; },
      get bboxTexture() { return tfMgr.bboxTexture; },
      get classTexture() { return tfMgr.classTexture; },
    };

    // SAM (Segment Anything) API
    const samMgr = this._samManager;
    ctx.sam = {
      init: () => samMgr.init(),
      encode: (source, sourceId) => samMgr.encode(source, sourceId),
      segment: async (prompt) => {
        await samMgr.segment(prompt);
        samMgr.updateTextures(this.gl);
      },
      get initialized() { return samMgr.initialized; },
      get isEncoding() { return samMgr.isEncoding; },
      get modelProgress() { return samMgr.modelProgress; },
      get mask() { return samMgr.mask; },
      get maskWidth() { return samMgr.maskWidth; },
      get maskHeight() { return samMgr.maskHeight; },
      get masks() { return samMgr.masks; },
      get maskTexture() { return samMgr.maskTexture; },
      set onProgress(fn) { samMgr.onProgress = fn; },
    };

    // OSC API
    const oscMgr = this._oscManager;
    ctx.osc = {
      init: (options) => oscMgr.init(options),
      get initialized() { return oscMgr.initialized; },
      get connected() { return oscMgr.connected; },
      getValue: (address, argIndex) => oscMgr.getValue(address, argIndex),
      get values() { return oscMgr.values; },
      mapAddress: (addr, uniform, argIdx, min, max) => oscMgr.mapAddress(addr, uniform, argIdx, min, max),
      unmapAddress: (addr) => oscMgr.unmapAddress(addr),
      send: (addr, args, host, port) => oscMgr.send(addr, args, host, port),
      get messageLog() { return oscMgr.messageLog; },
      get texture() { return oscMgr.texture; },
    };

    // --- Mic ---
    const micMgr = this._micManager;
    ctx.mic = {
      init: () => micMgr.init(),
      get initialized() { return micMgr.initialized; },
      get bass() { return micMgr.bass; },
      get mid() { return micMgr.mid; },
      get treble() { return micMgr.treble; },
      get energy() { return micMgr.energy; },
      get frequencyData() { return micMgr.frequencyData; },
      get waveformData() { return micMgr.waveformData; },
      get fftTexture() { return micMgr.fftTexture; },
    };

    this._scriptCtx = ctx;

    // --- Draw call validation wrapper ---
    // Intercept drawArrays/drawArraysInstanced to produce actionable error messages
    // when vertex buffers are too small. Without this, the browser only logs a generic
    // GL_INVALID_OPERATION warning that the AI agent cannot diagnose or fix.
    {
      const gl = this.gl;
      // Save originals from prototype (avoid re-wrapping on successive loadScene calls)
      const proto = Object.getPrototypeOf(gl);
      const origDrawArrays = proto.drawArrays.bind(gl);
      const origDrawArraysInstanced = proto.drawArraysInstanced.bind(gl);

      const TYPE_BYTES = {
        [gl.FLOAT]: 4, [gl.INT]: 4, [gl.UNSIGNED_INT]: 4,
        [gl.SHORT]: 2, [gl.UNSIGNED_SHORT]: 2,
        [gl.BYTE]: 1, [gl.UNSIGNED_BYTE]: 1,
      };

      function validateVertexBuffers(first, count) {
        const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
        const savedBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        try {
          for (let i = 0; i < maxAttribs; i++) {
            if (!gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED)) continue;
            const buffer = gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
            if (!buffer) continue;

            const components = gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_SIZE);
            const type = gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_TYPE);
            const stride = gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_STRIDE);
            const offset = gl.getVertexAttribOffset(i, gl.VERTEX_ATTRIB_ARRAY_POINTER);
            const bytesPerElem = TYPE_BYTES[type] || 4;
            const effectiveStride = stride || (components * bytesPerElem);

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            const bufSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);

            const lastVertex = first + count - 1;
            const required = offset + lastVertex * effectiveStride + components * bytesPerElem;

            if (required > bufSize) {
              const fits = Math.max(0, Math.floor((bufSize - offset) / effectiveStride));
              throw new Error(
                `drawArrays vertex buffer error on attribute ${i}: ` +
                `requested ${count} vertices (first=${first}) but buffer only has room for ${fits}. ` +
                `Buffer: ${bufSize} bytes, stride: ${effectiveStride}, components: ${components}, offset: ${offset}. ` +
                `Fix: change drawArrays count from ${count} to ${fits}, ` +
                `or upload more data with bufferData (need at least ${required} bytes).`
              );
            }
          }
        } finally {
          gl.bindBuffer(gl.ARRAY_BUFFER, savedBuf);
        }
      }

      ctx.gl.drawArrays = function (mode, first, count) {
        validateVertexBuffers(first, count);
        return origDrawArrays(mode, first, count);
      };
      ctx.gl.drawArraysInstanced = function (mode, first, count, instanceCount) {
        validateVertexBuffers(first, count);
        return origDrawArraysInstanced(mode, first, count, instanceCount);
      };
    }

    // --- GLSL→WGSL auto-transpilation for WebGPU backend ---
    // When the active backend is WebGPU, wrap shader-related utilities
    // so that AI-generated GLSL code is automatically transpiled to WGSL.
    const isWebGPU = this._backend?.backendType === BackendType.WEBGPU ||
      this._backendOptions?.forceBackend === "webgpu" ||
      this._backendOptions?.preferBackend === "webgpu";

    if (isWebGPU) {
      // Expose transpiler utilities for direct use by AI-generated code
      ctx.utils.transpileGLSL = transpileGLSL;
      ctx.utils.transpileFragmentGLSL = transpileFragmentGLSL;
      ctx.utils.transpileVertexGLSL = transpileVertexGLSL;

      // Note: We do NOT wrap ctx.utils.createProgram here because it targets
      // WebGL2's shader compiler. Passing transpiled WGSL to it would always fail.
      // Instead, AI-generated code on WebGPU should use the transpiler utilities
      // above (transpileGLSL, transpileFragmentGLSL, transpileVertexGLSL) directly,
      // or use ctx.renderer.createShaderModule which is wrapped below.

      // If renderer abstraction is available, wrap createShaderModule too
      if (ctx.renderer && typeof ctx.renderer.createShaderModule === "function") {
        const origCreateShaderModule = ctx.renderer.createShaderModule.bind(ctx.renderer);
        ctx.renderer.createShaderModule = (desc) => {
          const transpiledCode = this._transpileShaderSource(desc.code);
          return origCreateShaderModule({ ...desc, code: transpiledCode });
        };
      }
    }

    try {
      if (setupBody) {
        this._scriptSetupFn = new Function("ctx", `return (async () => { ${setupBody} })();`);
      }
      if (renderBody) {
        this._scriptRenderFn = new Function("ctx", `return (async () => { ${renderBody} })();`);
      }
      if (cleanupBody) {
        this._scriptCleanupFn = new Function("ctx", cleanupBody);
      }

      // Pre-populate ctx.uploads with blob URLs, then run setup.
      // Store promise so callers (e.g. ViewportNode) can await setup completion.
      this._setupPromise = this._prepareUploadsAndRunSetup(ctx, generation);
    } catch (err) {
      console.error("[GLEngine] Script error:", err);
      this.onError?.(err);
      window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
      this._setupPromise = Promise.resolve();
    }

    // Parse custom uniforms
    if (sceneJSON.uniforms) {
      for (const [name, def] of Object.entries(sceneJSON.uniforms)) {
        if (def && def.value !== undefined) {
          this._customUniforms[name] = def.value;
        }
      }
    }

    this._frameCount = 0;
  }

  /**
   * Start the render loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._startTime = performance.now() / 1000;
    this._lastFrameTime = this._startTime;
    this._frameCount = 0;
    this._pausedTime = 0;
    this._renderLoop();
  }

  /**
   * Stop the render loop.
   */
  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  setPaused(paused) {
    if (paused && !this._paused) {
      this._paused = true;
      this._pauseStart = performance.now() / 1000;
    } else if (!paused && this._paused) {
      this._paused = false;
      this._pausedTime += (performance.now() / 1000) - this._pauseStart;
    }
    this._audioManager?.syncPaused(paused, this.getCurrentTime());
  }

  get paused() {
    return this._paused;
  }

  getCurrentTime() {
    if (this._paused) {
      return this._pauseStart - this._startTime - this._pausedTime;
    }
    return (performance.now() / 1000) - this._startTime - this._pausedTime;
  }

  seekTo(targetTime) {
    const now = performance.now() / 1000;
    if (this._paused) {
      // Adjust _startTime so that getCurrentTime() returns targetTime
      this._startTime = this._pauseStart - this._pausedTime - targetTime;
      // Trigger a render so the viewport shows the frame at the new time
      this._needsPausedRender = true;
    } else {
      this._startTime = now - this._pausedTime - targetTime;
    }
    this._audioManager?.syncSeek(targetTime, this._paused);

    // Seek registered video elements to match
    const videos = this._scriptCtx?._registeredVideos;
    if (videos?.size) {
      for (const [video, opts] of videos) {
        const dur = video.duration;
        if (!dur || isNaN(dur)) continue;
        const t = opts.loop !== false ? (targetTime % dur) : Math.min(targetTime, dur);
        video.currentTime = t;
        // Video decode is async — re-render once the frame is ready
        if (this._paused) {
          video.addEventListener("seeked", () => {
            this._needsPausedRender = true;
          }, { once: true });
        }
      }
    }
  }

  setDuration(d) {
    this._duration = d;
  }

  setLoop(loop) {
    this._loop = loop;
  }

  _renderLoop() {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(() => this._renderLoop());

    // Always report current time (for timeline UI even when paused)
    this.onTime?.(this.getCurrentTime());

    if (this._paused) {
      if (this._needsPausedRender) {
        this._needsPausedRender = false;
        const wasPaused = this._paused;
        try {
          this._renderFrame(this.getCurrentTime(), 0);
          this._frameCount++;
        } catch (e) {
          // ignore render errors during paused frame
        }
        // Script may have unpaused during render — restore paused state
        if (wasPaused && !this._paused) {
          this.setPaused(true);
        }
      }
      return;
    }

    const now = performance.now() / 1000;
    const dt = now - this._lastFrameTime;
    this._lastFrameTime = now;

    let time = now - this._startTime - this._pausedTime;

    // Duration boundary
    if (this._duration > 0 && time >= this._duration) {
      if (this._loop) {
        this.seekTo(0);
        time = this.getCurrentTime();
      } else {
        this.seekTo(this._duration);
        this.setPaused(true);
        this.onTimelineEnd?.();
        return;
      }
    }

    try {
      this._renderFrame(time, dt);
    } catch (err) {
      console.error("[GLEngine] Render error:", err);
      if (err.message !== this._lastErrorMessage) {
        this._lastErrorMessage = err.message;
        this.onError?.(err);
        window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
      }
    }
    this._frameCount++;

    // FPS counter
    this._fpsCounter.frames++;
    const elapsed = performance.now() - this._fpsCounter.lastTime;
    if (elapsed >= 1000) {
      const fps = Math.round((this._fpsCounter.frames * 1000) / elapsed);
      this.onFPS?.(fps);
      this._fpsCounter.frames = 0;
      this._fpsCounter.lastTime = performance.now();
    }
  }

  _renderFrame(time, dt) {
    const gl = this.gl;
    if (!gl) return null;
    if (!this._scene || !this._scriptRenderFn || !this._scriptCtx || !this._setupReady) {
      // No active scene or setup not ready — clear to black so stale frames don't linger
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      return null;
    }

    // Snapshot previous mouse state at start of frame (reuse arrays to avoid GC)
    const mp = this._mousePrev, ms = this._mouseSnapshot, m = this._mouse;
    mp[0] = ms[0]; mp[1] = ms[1]; mp[2] = ms[2]; mp[3] = ms[3];
    this._mouseDownPrev = this._mouseDownSnapshot;
    ms[0] = m[0]; ms[1] = m[1]; ms[2] = m[2]; ms[3] = m[3];
    this._mouseDownSnapshot = this._mouseDown;

    const ctx = this._scriptCtx;
    ctx.time = time;
    ctx.dt = dt;
    ctx.isOffline ??= false;
    ctx.mouse = [this._mouseSnapshot[0], this._mouseSnapshot[1], this._mouseSnapshot[2], this._mouseSnapshot[3]];
    ctx.mousePrev = [this._mousePrev[0], this._mousePrev[1], this._mousePrev[2], this._mousePrev[3]];
    ctx.mouseDown = this._mouseDownSnapshot;
    ctx.mouseHover = this._mouseHover;
    ctx.resolution = [this.canvas.width, this.canvas.height];
    ctx.frame = this._frameCount;
    ctx.uniforms = { ...this._customUniforms };
    if (this._keyframeManager) {
      Object.assign(ctx.uniforms, this._keyframeManager.evaluateAll(time));
    }
    ctx.keys = this._pressedKeys;

    // Sync renderer abstraction reference (may have been initialized after scene load)
    if (this._backend && !ctx.renderer) {
      ctx.renderer = this._backend;
      ctx.backendType = this._backend.backendType;
      // Apply shader module wrapping if not already done
      if (typeof ctx.renderer.createShaderModule === "function" && !ctx.renderer._wrapped) {
        const origCreateShaderModule = ctx.renderer.createShaderModule.bind(ctx.renderer);
        ctx.renderer.createShaderModule = (desc) => {
          const transpiledCode = this._transpileShaderSource(desc.code);
          return origCreateShaderModule({ ...desc, code: transpiledCode });
        };
        ctx.renderer._wrapped = true;
      }
    }

    // Drift-correct registered video elements to match ctx.time.
    // In real-time mode, video.play() runs on its own clock which drifts
    // from ctx.time. Re-sync when drift exceeds threshold to keep
    // video frames aligned with agent graphics (e.g. bounding boxes).
    if (!ctx.isOffline) {
      const videos = ctx._registeredVideos;
      if (videos?.size) {
        for (const [video, opts] of videos) {
          const dur = video.duration;
          if (!dur || isNaN(dur) || video.readyState < 2) continue;
          const targetTime = opts.loop !== false ? (time % dur) : Math.min(time, dur);
          const drift = Math.abs(video.currentTime - targetTime);
          if (drift > 0.1) {
            video.currentTime = targetTime;
          }
        }
      }
    }

    // Update MIDI texture before script render (messages arrive via callbacks)
    if (this._midiManager?.initialized) {
      this._midiManager.updateTextures(gl);
    }

    // Update OSC texture before script render
    if (this._oscManager?.initialized) {
      this._oscManager.updateTextures(gl);
    }

    // Update mic FFT data before script render
    if (this._micManager?.initialized) {
      this._micManager.updateFrame(gl, ctx.isOffline);
    }

    // Update audio data before script render
    if (this._audioManager) {
      this._audioManager.updateFrame(gl, time, ctx.isOffline);
      const am = this._audioManager;
      ctx.audio.isLoaded = am.isLoaded;
      ctx.audio.isPlaying = am.isPlaying;
      ctx.audio.duration = am.duration;
      ctx.audio.currentTime = am.currentTime;
      ctx.audio.bass = am.bass;
      ctx.audio.mid = am.mid;
      ctx.audio.treble = am.treble;
      ctx.audio.energy = am.energy;
      ctx.audio.frequencyData = am.frequencyData;
      ctx.audio.waveformData = am.waveformData;
      ctx.audio.fftTexture = am.fftTexture;
      ctx.audio.volume = am.volume;
    }

    try {
      const p = this._scriptRenderFn(ctx);
      if (p && typeof p.catch === "function") {
        p.then(() => {
          // Auto-blit WebGPU OffscreenCanvas to visible canvas after async render
          this._autoBlitIfWebGPU(ctx);
        }).catch((err) => {
          console.error("[GLEngine] Script render error (async):", err);
          if (err.message !== this._lastErrorMessage) {
            this._lastErrorMessage = err.message;
            this.onError?.(err);
            window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
          }
        });
        return p; // return promise for offline rendering to await
      }
      // Auto-blit WebGPU OffscreenCanvas to visible canvas after sync render
      this._autoBlitIfWebGPU(ctx);
    } catch (err) {
      console.error("[GLEngine] Script render error:", err);
      if (err.message !== this._lastErrorMessage) {
        this._lastErrorMessage = err.message;
        this.onError?.(err);
        window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
      }
    }
    return null;
  }

  /**
   * Render a single frame at the given time for offline recording.
   * Called by the recorder loop instead of the normal rAF loop.
   * Async to allow awaiting async render functions (e.g. detector.detect).
   */
  async renderOfflineFrame(time, dt) {
    if (this._scriptCtx) this._scriptCtx.isOffline = true;
    this.onTime?.(time);

    // Timeout helper — prevents hanging on broken video seeks or async renders
    const withFrameTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => {
          console.warn("[GLEngine] %s timed out at t=%s (skipping)", label, time.toFixed(3));
          resolve();
        }, ms)),
      ]);

    // Seek all registered video elements to the target time before rendering.
    // Uses VideoFrameExtractor (WebCodecs) for MP4s when available,
    // falls back to _seekVideo for non-MP4 or unsupported browsers.
    const videos = this._scriptCtx?._registeredVideos;
    if (videos?.size) {
      const seekPromises = [];
      for (const [video, opts] of videos) {
        const extractor = this._offlineExtractors?.get(video);

        if (extractor) {
          // WebCodecs path — decode frame directly
          // Use video.duration (same as online drift-correction) for consistent loop timing
          const dur = video.duration && !isNaN(video.duration) ? video.duration : extractor.duration;
          const targetTime = opts.loop !== false ? (time % dur) : Math.min(time, dur);
          const extractors = this._offlineExtractors;

          // Sync video.currentTime so scripts reading it get the correct value
          video.currentTime = targetTime;

          seekPromises.push(
            (async () => {
              let timedOut = false;
              const result = await Promise.race([
                extractor.getFrameAtTime(targetTime),
                new Promise((resolve) => setTimeout(() => { timedOut = true; resolve(null); }, 3000)),
              ]);
              if (timedOut) {
                console.warn("[GLEngine] extractor timed out for video, removing (fallback to seek)");
                extractors.delete(video);
                try { extractor.dispose(); } catch (_) {}
                return;
              }
              video._offlineFrame = result;
            })(),
          );
        } else {
          // Legacy seek path
          if (!video.paused) {
            video.pause();
          }
          const dur = video.duration;
          if (!dur || isNaN(dur)) continue;
          const targetTime = opts.loop !== false ? (time % dur) : Math.min(time, dur);

          const needsSeek = Math.abs(video.currentTime - targetTime) > 0.001;
          const firstFrameNotReady = time < 0.001 && video.readyState < 2;

          if (needsSeek || firstFrameNotReady) {
            seekPromises.push(withFrameTimeout((async () => {
              if (!needsSeek && firstFrameNotReady) {
                await _seekVideo(video, 0.001);
              }
              await _seekVideo(video, targetTime);
            })(), 3000, "seekVideo"));
          }
        }
      }
      if (seekPromises.length) await Promise.all(seekPromises);
    }

    const p = this._renderFrame(time, dt);
    if (p) await withFrameTimeout(p, 5000, "scriptRender");
    this._frameCount++;
  }

  /**
   * Prepare VideoFrameExtractors for all registered MP4 videos.
   * Call once before the offline render loop begins.
   * Non-MP4 or failed videos silently fall back to the legacy seek path.
   */
  async prepareOfflineVideos() {
    this._offlineExtractors = new Map();
    const videos = this._scriptCtx?._registeredVideos;
    if (!videos?.size) return;

    // Pause all registered videos so they don't play independently during offline rendering
    for (const [video] of videos) {
      if (!video.paused) video.pause();
    }

    if (typeof VideoDecoder === "undefined") return;

    const promises = [];
    for (const [video] of videos) {
      promises.push(
        (async () => {
          try {
            const src = video.currentSrc || video.src;
            if (!src) return;
            const resp = await fetch(src);
            const buf = await resp.arrayBuffer();
            // Check for MP4 ftyp header
            const header = new Uint8Array(buf, 0, 8);
            const ftyp =
              header[4] === 0x66 && // f
              header[5] === 0x74 && // t
              header[6] === 0x79 && // y
              header[7] === 0x70;   // p
            if (!ftyp) return;

            const extractor = new VideoFrameExtractor();
            await extractor.init(buf);
            this._offlineExtractors.set(video, extractor);
          } catch (e) {
            console.warn("[GLEngine] VideoFrameExtractor init failed, using seek fallback:", e);
          }
        })(),
      );
    }
    await Promise.all(promises);
  }

  /**
   * Dispose all offline VideoFrameExtractors.
   * Call after the offline render loop finishes.
   */
  disposeOfflineVideos() {
    // Reset offline flag so drift correction resumes in _renderFrame
    if (this._scriptCtx) {
      this._scriptCtx.isOffline = false;
    }

    if (!this._offlineExtractors) return;
    for (const [video, extractor] of this._offlineExtractors) {
      extractor.dispose();
      if (video._offlineFrame) {
        video._offlineFrame.close();
        video._offlineFrame = null;
      }
    }
    this._offlineExtractors = null;

    // Resume playback on registered videos (paused during offline recording)
    const videos = this._scriptCtx?._registeredVideos;
    if (videos?.size) {
      for (const [video] of videos) {
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    }
  }

  /**
   * Capture a buffer as ImageData for preview.
   * Supports both createRenderTarget() objects (_isRenderTarget) and
   * raw { texture, width, height } objects in ctx.state[stateKey].
   */
  captureBuffer(stateKey, maxSize = 256) {
    const gl = this.gl;
    const ctx = this._scriptCtx;
    if (!gl || !ctx) return null;
    const rt = ctx.state[stateKey];
    if (!rt) return null;

    // Determine source FBO and dimensions
    let srcFBO, srcW, srcH;
    let useTempFBO = false;
    if (rt._isRenderTarget) {
      srcFBO = rt.framebuffer;
      srcW = rt.width;
      srcH = rt.height;
    } else if (rt.texture && rt.width && rt.height) {
      // Raw texture wrapper — need a temp FBO to read from it
      srcW = rt.width;
      srcH = rt.height;
      useTempFBO = true;
    } else {
      return null;
    }

    const aspect = srcW / srcH;
    let dstW, dstH;
    if (srcW >= srcH) {
      dstW = Math.min(srcW, maxSize);
      dstH = Math.round(dstW / aspect);
    } else {
      dstH = Math.min(srcH, maxSize);
      dstW = Math.round(dstH * aspect);
    }

    // Per-key readback FBO cache
    if (!this._readbackCache) this._readbackCache = {};
    let rb = this._readbackCache[stateKey];
    if (!rb || rb.w !== dstW || rb.h !== dstH) {
      if (rb) {
        gl.deleteFramebuffer(rb.fbo);
        gl.deleteTexture(rb.tex);
        if (rb.srcFBO) gl.deleteFramebuffer(rb.srcFBO);
      }
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, dstW, dstH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      rb = { fbo, tex, w: dstW, h: dstH, srcFBO: null };
      this._readbackCache[stateKey] = rb;
    }

    // For raw textures, use a cached source FBO and attach the texture each frame
    if (useTempFBO) {
      if (!rb.srcFBO) {
        rb.srcFBO = gl.createFramebuffer();
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, rb.srcFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt.texture, 0);
      srcFBO = rb.srcFBO;
    }

    // Save current framebuffer binding
    const prevReadFBO = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const prevDrawFBO = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);

    // Blit source FBO → readback FBO (downscale)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFBO);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rb.fbo);
    gl.blitFramebuffer(
      0, 0, srcW, srcH,
      0, 0, dstW, dstH,
      gl.COLOR_BUFFER_BIT, gl.LINEAR
    );

    // Read pixels
    gl.bindFramebuffer(gl.FRAMEBUFFER, rb.fbo);
    const pixels = new Uint8Array(dstW * dstH * 4);
    gl.readPixels(0, 0, dstW, dstH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Restore previous framebuffer bindings
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevReadFBO);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, prevDrawFBO);

    // Y-flip the pixels (GL reads bottom-to-top)
    const rowSize = dstW * 4;
    const tempRow = new Uint8Array(rowSize);
    for (let y = 0; y < (dstH >> 1); y++) {
      const topOffset = y * rowSize;
      const botOffset = (dstH - 1 - y) * rowSize;
      tempRow.set(pixels.subarray(topOffset, topOffset + rowSize));
      pixels.copyWithin(topOffset, botOffset, botOffset + rowSize);
      pixels.set(tempRow, botOffset);
    }

    return new ImageData(new Uint8ClampedArray(pixels.buffer), dstW, dstH);
  }

  updateUniform(name, value) {
    this._customUniforms[name] = value;
    this._needsPausedRender = true;
  }

  setKeyframeManager(km) {
    this._keyframeManager = km;
  }

  updateMouse(x, y, pressed) {
    this._mouse = [x, y, pressed ? x : this._mouse[2], pressed ? y : this._mouse[3]];
    this._mouseDown = pressed;
  }

  updateMouseHover(hovering) {
    this._mouseHover = hovering;
  }

  updateKey(code, pressed) {
    if (pressed) {
      this._pressedKeys.add(code);
    } else {
      this._pressedKeys.delete(code);
    }
  }

  releaseAllKeys() {
    this._pressedKeys.clear();
  }

  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Detect whether a shader source string looks like GLSL (not WGSL).
   * @param {string} code
   * @returns {boolean}
   */
  static _looksLikeGLSL(code) {
    if (!code || typeof code !== "string") return false;
    const looksGLSL = code.includes("#version") || code.includes("gl_Frag") ||
      code.includes("gl_Position") ||
      (code.includes("uniform ") && !code.includes("@group"));
    const looksWGSL = code.includes("@vertex") || code.includes("@fragment") ||
      code.includes("@compute") || code.includes("@group");
    return looksGLSL && !looksWGSL;
  }

  /**
   * Auto-transpile a GLSL shader source to WGSL.
   * Detects vertex vs fragment automatically.
   * Returns the original source unchanged if it doesn't look like GLSL.
   * @param {string} source — shader source code
   * @returns {string} — WGSL code (or original if not GLSL / transpilation fails)
   */
  _transpileShaderSource(source) {
    if (!GLEngine._looksLikeGLSL(source)) return source;
    try {
      const result = transpileGLSL(source);
      if (result.wgsl && result.errors.length === 0) {
        console.log("[GLEngine] GLSL→WGSL auto-transpiled successfully");
        return result.wgsl;
      }
      if (result.wgsl) {
        // Transpilation produced output but with warnings
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

  _disposeReadbackCache() {
    if (this._readbackCache) {
      for (const rb of Object.values(this._readbackCache)) {
        this.gl?.deleteFramebuffer(rb.fbo);
        this.gl?.deleteTexture(rb.tex);
        if (rb.srcFBO) this.gl?.deleteFramebuffer(rb.srcFBO);
      }
      this._readbackCache = null;
    }
  }

  _disposeScene() {
    const gl = this.gl;
    if (!gl) return;

    // Clean up script mode
    if (this._scriptCleanupFn && this._scriptCtx) {
      try {
        this._scriptCleanupFn(this._scriptCtx);
      } catch (err) {
        console.error("[GLEngine] Script cleanup error:", err);
      }
    }
    // Revoke upload blob URLs to free memory
    if (this._scriptCtx?.uploads) {
      for (const url of Object.values(this._scriptCtx.uploads)) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
    }
    // Revoke individually tracked blob URLs
    for (const url of this._individualBlobUrls) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    this._individualBlobUrls.clear();

    // Auto-destroy GL/GPU objects left in ctx.state by scripts that didn't clean up
    if (this._scriptCtx?.state) {
      this._autoDestroyGLObjects(gl, this._scriptCtx.state);
    }

    // Restore original drawArrays (remove validation wrapper)
    if (this.gl) {
      delete this.gl.drawArrays;
      delete this.gl.drawArraysInstanced;
    }

    this._scriptCtx = null;
    this._scriptSetupFn = null;
    this._scriptRenderFn = null;
    this._scriptCleanupFn = null;

    for (const mgr of this._managers) {
      mgr?.deleteTextures?.(gl);
    }
    for (const mgr of this._managers) {
      mgr?.reset?.();
    }
    this._disposeReadbackCache();

    // Reset WebGL global state to defaults so the next project starts clean.
    // Without this, state left by the previous project (depth test, blend mode,
    // bound textures/buffers/framebuffers, etc.) corrupts the new project.
    this._resetGLState(gl);

    this._customUniforms = {};
    this._keyboardBindings = {};
    this._pressedKeys.clear();
  }

  /**
   * Reset WebGL2 global state to defaults.
   * Called between project switches to prevent state leakage.
   */
  _resetGLState(gl) {
    // Unbind everything
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.useProgram(null);

    // Unbind all texture units
    const maxUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    for (let i = 0; i < Math.min(maxUnits, 16); i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      gl.bindTexture(gl.TEXTURE_3D, null);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    }
    gl.activeTexture(gl.TEXTURE0);

    // Disable capabilities
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

    // Reset write masks
    gl.depthMask(true);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0xFF);

    // Reset functions
    gl.depthFunc(gl.LESS);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.blendEquation(gl.FUNC_ADD);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    // Reset viewport and clear
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1.0);
    gl.clearStencil(0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    // Clear canvas
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  /**
   * Recursively walk an object and delete any WebGL resources found.
   * Handles textures, buffers, programs, VAOs, framebuffers, renderbuffers, samplers.
   * Prevents leaks when scripts don't implement cleanup properly.
   */
  _autoDestroyGLObjects(gl, obj, seen = new WeakSet()) {
    if (!obj || typeof obj !== "object") return;
    if (seen.has(obj)) return;
    seen.add(obj);

    if (obj instanceof WebGLTexture) { try { gl.deleteTexture(obj); } catch {} return; }
    if (obj instanceof WebGLBuffer) { try { gl.deleteBuffer(obj); } catch {} return; }
    if (obj instanceof WebGLProgram) { try { gl.deleteProgram(obj); } catch {} return; }
    if (obj instanceof WebGLVertexArrayObject) { try { gl.deleteVertexArray(obj); } catch {} return; }
    if (obj instanceof WebGLFramebuffer) { try { gl.deleteFramebuffer(obj); } catch {} return; }
    if (obj instanceof WebGLRenderbuffer) { try { gl.deleteRenderbuffer(obj); } catch {} return; }
    if (obj instanceof WebGLShader) { try { gl.deleteShader(obj); } catch {} return; }
    if (obj instanceof WebGLSampler) { try { gl.deleteSampler(obj); } catch {} return; }

    // Recurse into plain objects, arrays, and Maps
    if (Array.isArray(obj)) {
      for (const item of obj) this._autoDestroyGLObjects(gl, item, seen);
    } else if (obj instanceof Map) {
      for (const value of obj.values()) this._autoDestroyGLObjects(gl, value, seen);
    } else {
      for (const value of Object.values(obj)) {
        if (value && typeof value === "object") {
          this._autoDestroyGLObjects(gl, value, seen);
        }
      }
    }
  }

  /** Pre-populate ctx.uploads with blob URLs for all uploaded files, then run setup. */
  async _prepareUploadsAndRunSetup(ctx, generation) {
    try {
      const blobUrls = await getAllUploadBlobUrls();
      if (generation !== this._loadGeneration) return; // stale — a newer loadScene superseded us
      for (const [filename, url] of blobUrls) {
        ctx.uploads[filename] = url;
      }
    } catch (e) {
      console.warn("[GLEngine] Failed to pre-populate uploads:", e);
    }
    if (generation !== this._loadGeneration) return;

    // Check for missing assets — both excluded and genuinely absent from IndexedDB
    try {
      const manifest = await getProjectManifest();
      if (generation !== this._loadGeneration) return;
      const missingList = [];

      // Check excluded assets
      if (manifest?.excluded_assets?.length > 0) {
        for (const asset of manifest.excluded_assets) {
          if (!ctx.uploads[asset.filename]) {
            ctx.uploads[asset.filename] = null;
            missingList.push(asset);
          }
        }
      }

      // Check all declared assets — detect ones missing from IndexedDB
      if (manifest?.assets?.length > 0) {
        const excludedNames = new Set((manifest.excluded_assets || []).map((a) => a.filename));
        for (const asset of manifest.assets) {
          if (excludedNames.has(asset.filename)) continue; // already handled above
          if (!ctx.uploads[asset.filename]) {
            ctx.uploads[asset.filename] = null;
            missingList.push(asset);
          }
        }
      }

      if (missingList.length > 0) {
        this.onMissingAssets?.(missingList);
      }
    } catch {
      // Manifest read may fail — continue.
    }
    if (generation !== this._loadGeneration) return;

    // Wait for backend initialization before running setup
    // (WebGPU scenes need ctx.renderer to be available in setup)
    if (this._backendPromise) {
      try { await this._backendPromise; } catch { /* handled in initBackend */ }
      if (generation !== this._loadGeneration) return;
      // Inject backend into ctx now that it's ready
      if (this._backend && !ctx.renderer) {
        ctx.renderer = this._backend;
        ctx.backendType = this._backend.backendType;

        // Apply shader module wrapping (transpilation + error interception)
        // that was skipped in loadScene because ctx.renderer was null
        if (typeof ctx.renderer.createShaderModule === "function" && !ctx.renderer._wrapped) {
          const origCreateShaderModule = ctx.renderer.createShaderModule.bind(ctx.renderer);
          ctx.renderer.createShaderModule = (desc) => {
            const transpiledCode = this._transpileShaderSource(desc.code);
            return origCreateShaderModule({ ...desc, code: transpiledCode });
          };
          ctx.renderer._wrapped = true;
        }
      }
    }

    // Check if scene requested WebGPU but got WebGL2
    // "hybrid" mode is allowed — it uses WebGPU for compute but WebGL2 for rendering
    const wantedBackend = this._scene?.backendTarget;
    const needsWebGPU = wantedBackend === "webgpu" || wantedBackend === "hybrid";
    if (needsWebGPU && this._backend?.backendType !== "webgpu") {
      const msg = wantedBackend === "hybrid"
        ? "Hybrid mode requires WebGPU for compute shaders but WebGPU is not available. " +
          (navigator.gpu ? "WebGPU adapter/device request failed." : "This browser does not support WebGPU.")
        : "Scene requires WebGPU backend but WebGPU is not available. " +
          (navigator.gpu ? "WebGPU adapter/device request failed." : "This browser does not support WebGPU.");
      console.error("[GLEngine]", msg);
      this.onError?.(new Error(msg));
      window.dispatchEvent(new ErrorEvent("error", { message: msg, error: new Error(msg) }));
      // For pure WebGPU scenes, this is fatal. For hybrid, fall back to CPU-only.
      if (wantedBackend === "webgpu") {
        this._setupReady = false;
        if (this.gl) {
          const g = this.gl;
          g.clearColor(0.15, 0.05, 0.05, 1);
          g.clear(g.COLOR_BUFFER_BIT);
        }
        return;
      }
    }

    // Run setup (async)
    let setupOk = true;
    if (this._scriptSetupFn) {
      try {
        await this._scriptSetupFn(ctx);
      } catch (err) {
        setupOk = false;
        console.error("[GLEngine] Setup error:", err);
        this.onError?.(err);
        window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
      }
    }
    if (generation !== this._loadGeneration) return; // another loadScene started while setup ran

    // Drain async WebGPU validation errors (shader compilation, pipeline creation, etc.)
    // These arrive asynchronously via the `uncapturederror` device event and may not
    // be caught by the try/catch above.
    if (this._backend?.consumeValidationErrors) {
      // Brief yield to let queued GPU validation errors arrive
      await new Promise((r) => setTimeout(r, 150));
      if (generation !== this._loadGeneration) return;
      const gpuErrors = this._backend.consumeValidationErrors();
      if (gpuErrors.length > 0) {
        setupOk = false;
        for (const e of gpuErrors) {
          const msg = `[WebGPU ${e.type}] ${e.message}`;
          console.error(msg);
          this.onError?.(new Error(msg));
          window.dispatchEvent(new ErrorEvent("error", { message: msg, error: new Error(msg) }));
        }
      }
    }

    this._setupReady = setupOk;

    // If setup failed, draw a visible error indicator on the canvas so
    // the agent and user can clearly see something went wrong (instead of
    // a silent white screen that looks like "no errors").
    if (!setupOk && this.gl) {
      const g = this.gl;
      g.clearColor(0.15, 0.05, 0.05, 1);
      g.clear(g.COLOR_BUFFER_BIT);
    }
  }

  /**
   * Run a preprocess script in the engine context.
   * The script has access to ctx.uploads, ctx.utils, gl, canvas, and ctx.state.
   * Data stored in ctx.state persists and is carried into subsequent scenes'
   * setup/render via ctx.state (merged automatically on loadScene).
   */
  async runPreprocess(code) {
    const gl = this.gl;
    const canvas = this.canvas;

    // Build a lightweight ctx with uploads + utils
    const uploads = {};
    try {
      const blobUrls = await getAllUploadBlobUrls();
      for (const [filename, url] of blobUrls) {
        uploads[filename] = url;
      }
    } catch { /* ignore */ }

    // Use persistent preprocess state — survives across loadScene calls
    if (!this._preprocessState) this._preprocessState = {};

    // Expose managers so preprocess can use ctx.detector, ctx.audio, etc.
    const tfMgr = this._tfDetectorManager;
    const samMgr = this._samManager;

    const ctx = {
      gl,
      canvas,
      uploads,
      utils: { seekVideo: _seekVideo, ...(this._scriptCtx?.utils || {}) },
      state: this._preprocessState,
      detector: {
        init: (options) => tfMgr.init(options),
        detect: async (source, options) => {
          const results = await tfMgr.detect(source, { ...options });
          return results;
        },
        get initialized() { return tfMgr.initialized; },
        get detections() { return tfMgr.detections; },
        get count() { return tfMgr.count; },
      },
      sam: {
        init: () => samMgr.init(),
        encode: (source, sourceId) => samMgr.encode(source, sourceId),
        segment: (prompt) => samMgr.segment(prompt),
        get mask() { return samMgr.mask; },
        get masks() { return samMgr.masks; },
      },
      audio: this._scriptCtx?.audio || {},
      mediapipe: this._scriptCtx?.mediapipe || {},
      midi: this._scriptCtx?.midi || {},
      osc: this._scriptCtx?.osc || {},
      mic: this._scriptCtx?.mic || {},
      // Expose renderer so preprocess can check WebGPU availability
      renderer: this._backend || null,
      backendType: this._backend?.backendType || "webgl2",
    };

    // Wait for backend if still initializing
    if (this._backendPromise && !this._backend) {
      try { await this._backendPromise; } catch { /* handled in initBackend */ }
      ctx.renderer = this._backend || null;
      ctx.backendType = this._backend?.backendType || "webgl2";
    }

    const fn = new Function("ctx", "gl", "canvas", `return (async () => { ${code} })();`);
    const result = await fn(ctx, gl, canvas);

    // ctx.state may have been mutated by the script — keep reference
    this._preprocessState = ctx.state;

    // Merge new preprocess state into the active scene's ctx.state so
    // changes are visible immediately without requiring a scene reload.
    if (this._scriptCtx && this._scriptCtx.state !== ctx.state) {
      Object.assign(this._scriptCtx.state, ctx.state);
    }

    // Persist to IndexedDB so state survives page refresh
    this._persistPreprocessState(this._preprocessState, this._activeNodeId);

    return result;
  }

  /** Load an uploaded file from IndexedDB and return a blob URL. */
  async _getUploadBlobUrl(filename) {
    const url = await getUploadBlobUrl(filename);
    if (url) this._individualBlobUrls.add(url);
    return url;
  }

  /**
   * Set the active node ID for per-node preprocess state scoping.
   * Call before loadScene when switching nodes.
   * @param {string|null} nodeId
   */
  setActiveNodeId(nodeId) {
    // Save current state for the outgoing node before switching
    if (this._activeNodeId && this._preprocessState) {
      this._persistPreprocessState(this._preprocessState, this._activeNodeId);
    }
    this._activeNodeId = nodeId;
    // Clear in-memory state; loadScene will restore from IndexedDB for the new node
    this._preprocessState = null;
  }

  /** Clear preprocess state for the current node. */
  clearPreprocessState() {
    this._preprocessState = null;
    if (this._activeNodeId) {
      this._persistPreprocessState(null, this._activeNodeId);
    }
  }

  /**
   * Persist preprocess state to IndexedDB, scoped by node ID.
   * Handles Maps, Sets, and strips non-serializable values (DOM, WebGL, etc.).
   */
  async _persistPreprocessState(state, nodeId) {
    const key = nodeId ? `preprocess_state_${nodeId}.json` : "preprocess_state.json";
    try {
      if (state == null) {
        await writeJson(key, null);
      } else {
        let serializable;
        try {
          serializable = _prepareForPersist(state);
        } catch {
          console.warn("[GLEngine] preprocess state not serializable, skipping persist");
          return;
        }
        await writeJson(key, serializable);
      }
    } catch (err) {
      console.warn("[GLEngine] failed to persist preprocess state:", err);
    }
  }

  /**
   * Restore preprocess state from IndexedDB for the active node.
   */
  async _restorePreprocessState() {
    // Try node-scoped key first, then legacy global key
    const nodeKey = this._activeNodeId ? `preprocess_state_${this._activeNodeId}.json` : null;
    try {
      if (nodeKey) {
        const data = await readJson(nodeKey);
        if (data != null) {
          this._preprocessState = _restoreFromPersist(data);
          return;
        }
      }
      // Fallback to legacy global key (for backward compat)
      const data = await readJson("preprocess_state.json");
      if (data != null) {
        this._preprocessState = _restoreFromPersist(data);
      }
    } catch {
      // File not found — no persisted state, that's fine
    }
  }

  dispose() {
    this.stop();
    this._disposeScene();
    this._preprocessState = null;
    for (const mgr of this._managers) {
      mgr?.dispose?.();
    }
    this._disposeReadbackCache();
    if (this._backend) {
      this._backend.dispose();
      this._backend = null;
      this._backendReady = false;
    }
    this._scene = null;
  }
}
