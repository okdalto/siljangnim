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

import { getAllUploadBlobUrls, getUploadBlobUrl } from "./storage.js";
import { createProgram, compileShader, DEFAULT_QUAD_VERTEX_SHADER, DEFAULT_3D_VERTEX_SHADER } from "./shaderUtils.js";
import { createQuadGeometry, createBoxGeometry, createSphereGeometry, createPlaneGeometry } from "./geometries.js";
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
import { createVerletSystem } from "./verletPhysics.js";
import { selectBackend, getBackendDisplayName, BackendType } from "./gpu/index.js";
import * as shaderTarget from "./gpu/shaderTarget.js";
import { RenderGraph } from "./gpu/renderGraph.js";
import { transpileGLSL, transpileFragmentGLSL, transpileVertexGLSL } from "./gpu/glslToWgsl.js";

/** Map GL uniform type enum → setter function */
function _uniformSetter(gl, type, loc) {
  switch (type) {
    case gl.FLOAT:        return (v) => gl.uniform1f(loc, v);
    case gl.FLOAT_VEC2:   return (x, y) => gl.uniform2f(loc, x, y);
    case gl.FLOAT_VEC3:   return (x, y, z) => gl.uniform3f(loc, x, y, z);
    case gl.FLOAT_VEC4:   return (x, y, z, w) => gl.uniform4f(loc, x, y, z, w);
    case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: case gl.SAMPLER_3D: case gl.SAMPLER_CUBE:
                          return (v) => gl.uniform1i(loc, v);
    case gl.INT_VEC2:     return (x, y) => gl.uniform2i(loc, x, y);
    case gl.INT_VEC3:     return (x, y, z) => gl.uniform3i(loc, x, y, z);
    case gl.INT_VEC4:     return (x, y, z, w) => gl.uniform4i(loc, x, y, z, w);
    case gl.FLOAT_MAT2:   return (v) => gl.uniformMatrix2fv(loc, false, v);
    case gl.FLOAT_MAT3:   return (v) => gl.uniformMatrix3fv(loc, false, v);
    case gl.FLOAT_MAT4:   return (v) => gl.uniformMatrix4fv(loc, false, v);
    default:              return (v) => gl.uniform1f(loc, v);
  }
}

const GEOMETRY_CREATORS = {
  quad: createQuadGeometry,
  box: createBoxGeometry,
  sphere: createSphereGeometry,
  plane: createPlaneGeometry,
};

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
    this._pressedKeys = new Set();
    this._keyboardBindings = {}; // uniform name → KeyboardEvent.code

    // Keyframe manager (set externally via setKeyframeManager)
    this._keyframeManager = null;

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

    // Script mode
    this._scriptCtx = null;
    this._scriptSetupFn = null;
    this._scriptRenderFn = null;
    this._scriptCleanupFn = null;
    this._setupReady = false; // true after async setup() completes

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
          console.warn("[GLEngine] WebGPU backend init failed, using WebGL2:", err.message);
          await this._initWebGLBackend();
        }
      } else {
        await this._initWebGLBackend();
      }

      this._backendReady = true;
      this.onBackendReady?.(this._backend.backendType);
    } catch (err) {
      console.warn("[GLEngine] Backend init failed:", err.message);
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

  /** Get the active backend (or null if not initialized). */
  get backend() { return this._backend; }

  /** Get the backend display name (e.g. "WebGL2" or "WebGPU"). */
  get backendName() {
    return this._backend ? getBackendDisplayName(this._backend) : "WebGL2";
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
  loadScene(sceneJSON) {
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
          ? new Function("ctx", newScript.render)
          : null;
        // cleanup 함수는 교체만 하고 실행하지 않음 — state 보존이 목적
        this._scriptCleanupFn = newScript.cleanup
          ? new Function("ctx", newScript.cleanup)
          : null;
      } catch (err) {
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
    this._scene = sceneJSON;
    this._lastErrorMessage = null; // reset error debounce for new scene

    const script = sceneJSON.script || {};
    const setupBody = script.setup || "";
    const renderBody = script.render || "";
    const cleanupBody = script.cleanup || "";

    const ctx = {
      gl: this.gl,
      canvas: this.canvas,
      state: {},
      uploads: {}, // populated with blob URLs for uploaded files
      utils: {
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
          g.bindTexture(g.TEXTURE_2D, texture);
          g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
          g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, source);
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
          if (video.readyState >= video.HAVE_CURRENT_DATA) {
            g.bindTexture(g.TEXTURE_2D, texture);
            g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
            g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, video);
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
            const setter = _uniformSetter(g, info.type, loc);
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
        createVerletSystem,

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
        mpManager.detect(source, timestamp);
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
      detect: async (source) => {
        await tfMgr.detect(source);
        tfMgr.updateTextures(this.gl);
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
        this._scriptRenderFn = new Function("ctx", renderBody);
      }
      if (cleanupBody) {
        this._scriptCleanupFn = new Function("ctx", cleanupBody);
      }

      // Pre-populate ctx.uploads with blob URLs, then run setup
      this._prepareUploadsAndRunSetup(ctx);
    } catch (err) {
      console.error("[GLEngine] Script error:", err);
      this.onError?.(err);
      window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
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
    } else {
      this._startTime = now - this._pausedTime - targetTime;
    }
    this._audioManager?.syncSeek(targetTime, this._paused);
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
    if (!gl || !this._scene) return;

    // Snapshot previous mouse state at start of frame (reuse arrays to avoid GC)
    const mp = this._mousePrev, ms = this._mouseSnapshot, m = this._mouse;
    mp[0] = ms[0]; mp[1] = ms[1]; mp[2] = ms[2]; mp[3] = ms[3];
    this._mouseDownPrev = this._mouseDownSnapshot;
    ms[0] = m[0]; ms[1] = m[1]; ms[2] = m[2]; ms[3] = m[3];
    this._mouseDownSnapshot = this._mouseDown;

    if (this._scriptRenderFn && this._scriptCtx && this._setupReady) {
      const ctx = this._scriptCtx;
      ctx.time = time;
      ctx.dt = dt;
      ctx.mouse = [this._mouseSnapshot[0], this._mouseSnapshot[1], this._mouseSnapshot[2], this._mouseSnapshot[3]];
      ctx.mousePrev = [this._mousePrev[0], this._mousePrev[1], this._mousePrev[2], this._mousePrev[3]];
      ctx.mouseDown = this._mouseDownSnapshot;
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
        this._micManager.updateFrame(gl);
      }

      // Update audio data before script render
      if (this._audioManager) {
        this._audioManager.updateFrame(gl, time);
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
        this._scriptRenderFn(ctx);
      } catch (err) {
        console.error("[GLEngine] Script render error:", err);
        if (err.message !== this._lastErrorMessage) {
          this._lastErrorMessage = err.message;
          this.onError?.(err);
          window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
        }
      }
    }
  }

  /**
   * Render a single frame at the given time for offline recording.
   * Called by the recorder loop instead of the normal rAF loop.
   */
  renderOfflineFrame(time, dt) {
    this.onTime?.(time);
    this._renderFrame(time, dt);
    this._frameCount++;
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

    this._customUniforms = {};
    this._keyboardBindings = {};
    this._pressedKeys.clear();
  }

  /** Pre-populate ctx.uploads with blob URLs for all uploaded files, then run setup. */
  async _prepareUploadsAndRunSetup(ctx) {
    try {
      const blobUrls = await getAllUploadBlobUrls();
      for (const [filename, url] of blobUrls) {
        ctx.uploads[filename] = url;
      }
    } catch (e) {
      console.warn("[GLEngine] Failed to pre-populate uploads:", e);
    }

    // Run setup (async)
    if (this._scriptSetupFn) {
      try {
        await this._scriptSetupFn(ctx);
      } catch (err) {
        console.error("[GLEngine] Setup error:", err);
        this.onError?.(err);
        window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err }));
      }
    }
    this._setupReady = true;
  }

  /** Load an uploaded file from IndexedDB and return a blob URL. */
  async _getUploadBlobUrl(filename) {
    return getUploadBlobUrl(filename);
  }

  dispose() {
    this.stop();
    this._disposeScene();
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
