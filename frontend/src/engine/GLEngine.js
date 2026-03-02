/**
 * GLEngine — WebGL2 rendering engine (script-only mode).
 *
 * The agent writes raw WebGL2 JS code in script.setup / script.render / script.cleanup.
 * Shader compilation helpers and geometry creators are exposed via ctx.utils.
 */

import { createProgram, compileShader, DEFAULT_QUAD_VERTEX_SHADER, DEFAULT_3D_VERTEX_SHADER } from "./shaderUtils.js";
import { createQuadGeometry, createBoxGeometry, createSphereGeometry, createPlaneGeometry } from "./geometries.js";
import AudioManager from "./AudioManager.js";
import { sampleCurve } from "../utils/curves.js";

const GEOMETRY_CREATORS = {
  quad: createQuadGeometry,
  box: createBoxGeometry,
  sphere: createSphereGeometry,
  plane: createPlaneGeometry,
};

export default class GLEngine {
  constructor(canvas) {
    this.canvas = canvas;
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

    // Script mode
    this._scriptCtx = null;
    this._scriptSetupFn = null;
    this._scriptRenderFn = null;
    this._scriptCleanupFn = null;

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
   * Load a scene JSON and set up script execution.
   */
  loadScene(sceneJSON) {
    const gl = this.gl;
    if (!gl) return;

    this._disposeScene();
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
        loadImage: (url) => {
          const g = this.gl;
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
              resolve({ texture, width: img.width, height: img.height });
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
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
      },
    };
    // Audio API (methods delegate to AudioManager, properties updated per frame)
    this._audioManager.reset();
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

    this._scriptCtx = ctx;

    try {
      if (setupBody) {
        this._scriptSetupFn = new Function("ctx", setupBody);
      }
      if (renderBody) {
        this._scriptRenderFn = new Function("ctx", renderBody);
      }
      if (cleanupBody) {
        this._scriptCleanupFn = new Function("ctx", cleanupBody);
      }

      // Run setup immediately
      if (this._scriptSetupFn) {
        this._scriptSetupFn(ctx);
      }
    } catch (err) {
      console.error("[GLEngine] Script error:", err);
      this.onError?.(err);
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

    if (this._paused) return;

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

    // Snapshot previous mouse state at start of frame
    this._mousePrev = [...this._mouseSnapshot];
    this._mouseDownPrev = this._mouseDownSnapshot;
    this._mouseSnapshot = [...this._mouse];
    this._mouseDownSnapshot = this._mouseDown;

    if (this._scriptRenderFn && this._scriptCtx) {
      const ctx = this._scriptCtx;
      ctx.time = time;
      ctx.dt = dt;
      ctx.mouse = [...this._mouseSnapshot];
      ctx.mousePrev = [...this._mousePrev];
      ctx.mouseDown = this._mouseDownSnapshot;
      ctx.resolution = [this.canvas.width, this.canvas.height];
      ctx.frame = this._frameCount;
      ctx.uniforms = { ...this._customUniforms };
      if (this._keyframeManager) {
        Object.assign(ctx.uniforms, this._keyframeManager.evaluateAll(time));
      }
      ctx.keys = this._pressedKeys;

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

  updateUniform(name, value) {
    this._customUniforms[name] = value;
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
    this._scriptCtx = null;
    this._scriptSetupFn = null;
    this._scriptRenderFn = null;
    this._scriptCleanupFn = null;

    this._audioManager?.reset();

    this._customUniforms = {};
    this._keyboardBindings = {};
    this._pressedKeys.clear();
  }

  dispose() {
    this.stop();
    this._disposeScene();
    this._audioManager?.dispose();
    this._scene = null;
  }
}
