/**
 * GLEngine — WebGL2 rendering engine for PromptGL.
 *
 * Manages WebGL2 context, shader compilation, FBO management,
 * multi-pass rendering, and uniform updates.
 */

import { createProgram, DEFAULT_QUAD_VERTEX_SHADER, DEFAULT_3D_VERTEX_SHADER } from "./shaderUtils.js";
import { createQuadGeometry, createBoxGeometry, createSphereGeometry, createPlaneGeometry } from "./geometries.js";
import { buildRenderGraph } from "./renderGraph.js";

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
    this._programs = {};     // passName -> WebGLProgram
    this._vaos = {};         // passName -> VAO
    this._fbos = {};         // bufferName -> { fbo, texture, depthBuffer }
    this._pingPong = {};     // bufferName -> { read: fbo, write: fbo } for double-buffered
    this._renderOrder = [];  // topologically sorted pass names
    this._customUniforms = {};
    this._mouse = [0, 0, 0, 0]; // x, y, clickX, clickY (normalized)
    this._mouseSnapshot = [0, 0, 0, 0]; // snapshot at start of current frame
    this._mousePrev = [0, 0, 0, 0]; // previous frame's mouse state
    this._mouseDown = false;
    this._mouseDownSnapshot = false;
    this._mouseDownPrev = false;
    this._pressedKeys = new Set();
    this._keyboardBindings = {}; // uniform name → KeyboardEvent.code

    // Image textures
    this._imageTextures = {}; // url -> { texture, loaded }

    // Timeline
    this._duration = 0;      // 0 = infinite (no loop)
    this._loop = true;       // true = loop, false = stop at end
    this.onTime = null;      // callback(currentTime) — called every frame
    this.onTimelineEnd = null; // callback() — called when non-loop playback reaches end

    // Error state
    this.onError = null;     // callback(error)
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
   * Load a scene JSON and compile all shaders / create FBOs.
   * Compile-then-swap: old scene is only disposed after new one succeeds.
   */
  loadScene(sceneJSON) {
    const gl = this.gl;
    if (!gl) return;

    // Build new resources in temporary containers
    const newPrograms = {};
    const newVaos = {};
    const newFbos = {};
    const newPingPong = {};
    let newRenderOrder = [];
    const newUniforms = {};
    let newKeyboardBindings = {};

    try {
      const buffers = sceneJSON.buffers || {};
      const output = sceneJSON.output || {};

      // Build render order
      newRenderOrder = buildRenderGraph(buffers, output);

      // Compile programs for each buffer pass
      for (const [name, buf] of Object.entries(buffers)) {
        const vertSource = buf.vertex || this._defaultVertexForGeometry(buf.geometry || "quad");
        const fragSource = buf.fragment;
        if (!fragSource) continue;
        newPrograms[name] = createProgram(gl, vertSource, fragSource);
        newVaos[name] = this._createVAOFromProgram(newPrograms[name], buf.geometry || "quad");
        this._createFBOInto(newFbos, newPingPong, name, buf.double_buffer || false, buf.resolution_scale || 1.0, buf.texture_format);
      }

      // Compile output program
      if (output.fragment) {
        const vertSource = output.vertex || this._defaultVertexForGeometry(output.geometry || "quad");
        newPrograms["__output__"] = createProgram(gl, vertSource, output.fragment);
        newVaos["__output__"] = this._createVAOFromProgram(newPrograms["__output__"], output.geometry || "quad");
      }

      // Parse custom uniforms
      if (sceneJSON.uniforms) {
        for (const [name, def] of Object.entries(sceneJSON.uniforms)) {
          if (def && def.value !== undefined) {
            newUniforms[name] = def.value;
          }
        }
      }

      // Parse keyboard bindings
      const kb = sceneJSON.inputs?.keyboard;
      if (kb && typeof kb === "object") {
        newKeyboardBindings = { ...kb };
      }

    } catch (err) {
      // Cleanup partially created new resources
      for (const prog of Object.values(newPrograms)) gl.deleteProgram(prog);
      for (const vaoInfo of Object.values(newVaos)) gl.deleteVertexArray(vaoInfo.vao);
      for (const fboData of Object.values(newFbos)) {
        gl.deleteFramebuffer(fboData.fbo);
        gl.deleteTexture(fboData.texture);
        gl.deleteRenderbuffer(fboData.depthBuffer);
      }
      for (const pp of Object.values(newPingPong)) {
        for (const buf of [pp.read, pp.write]) {
          gl.deleteFramebuffer(buf.fbo);
          gl.deleteTexture(buf.texture);
          gl.deleteRenderbuffer(buf.depthBuffer);
        }
      }
      this.onError?.(err);
      throw err;
    }

    // Success — now dispose old scene and swap in new resources
    this._disposeScene();
    this._scene = sceneJSON;
    this._programs = newPrograms;
    this._vaos = newVaos;
    this._fbos = newFbos;
    this._pingPong = newPingPong;
    this._renderOrder = newRenderOrder;
    this._customUniforms = newUniforms;
    this._keyboardBindings = newKeyboardBindings;
    this._pressedKeys.clear();
    this._frameCount = 0;
  }

  _defaultVertexForGeometry(geometry) {
    return geometry === "quad" ? DEFAULT_QUAD_VERTEX_SHADER : DEFAULT_3D_VERTEX_SHADER;
  }

  _createVAOFromProgram(program, geometryType) {
    const gl = this.gl;
    const geom = (GEOMETRY_CREATORS[geometryType] || createQuadGeometry)();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    if (geom.dimension === 2) {
      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, geom.positions, gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(program, "a_position");
      if (posLoc >= 0) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      }
    } else {
      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, geom.positions, gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(program, "a_position");
      if (posLoc >= 0) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
      }

      if (geom.normals) {
        const nrmBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
        gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);
        const nrmLoc = gl.getAttribLocation(program, "a_normal");
        if (nrmLoc >= 0) {
          gl.enableVertexAttribArray(nrmLoc);
          gl.vertexAttribPointer(nrmLoc, 3, gl.FLOAT, false, 0, 0);
        }
      }

      if (geom.uvs) {
        const uvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, geom.uvs, gl.STATIC_DRAW);
        const uvLoc = gl.getAttribLocation(program, "a_uv");
        if (uvLoc >= 0) {
          gl.enableVertexAttribArray(uvLoc);
          gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
        }
      }

      if (geom.indices) {
        const idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.indices, gl.STATIC_DRAW);
      }
    }

    gl.bindVertexArray(null);

    return {
      vao,
      vertexCount: geom.vertexCount,
      hasIndices: !!geom.indices,
      dimension: geom.dimension,
    };
  }

  _createFBOInto(fbos, pingPongs, bufferName, doubleBuffer, resolutionScale, textureFormat) {
    const gl = this.gl;
    const w = Math.max(1, Math.floor(this.canvas.width * resolutionScale));
    const h = Math.max(1, Math.floor(this.canvas.height * resolutionScale));

    const fmt = this._resolveTextureFormat(textureFormat);

    const createSingleFBO = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, fmt.type, null);
      } catch {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, fmt.filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, fmt.filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        const statusNames = {
          [gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: "INCOMPLETE_ATTACHMENT",
          [gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: "INCOMPLETE_MISSING_ATTACHMENT",
          [gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: "INCOMPLETE_DIMENSIONS",
          [gl.FRAMEBUFFER_UNSUPPORTED]: "UNSUPPORTED",
          [gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE]: "INCOMPLETE_MULTISAMPLE",
        };
        console.error(`[GLEngine] FBO '${bufferName}' incomplete: ${statusNames[status] || status} (format: ${textureFormat || "rgba16f"})`);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return { fbo, texture, depthBuffer, width: w, height: h };
    };

    if (doubleBuffer) {
      pingPongs[bufferName] = {
        read: createSingleFBO(),
        write: createSingleFBO(),
      };
      fbos[bufferName] = pingPongs[bufferName].write;
    } else {
      fbos[bufferName] = createSingleFBO();
    }
  }

  _resolveTextureFormat(format) {
    const gl = this.gl;
    switch (format) {
      case "rgba8":
        return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };
      case "rgba32f":
        return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: this._extFloatLinear ? gl.LINEAR : gl.NEAREST };
      case "r32f":
        return { internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT, filter: gl.NEAREST };
      case "rg16f":
        return { internalFormat: gl.RG16F, format: gl.RG, type: gl.FLOAT, filter: gl.NEAREST };
      case "rg32f":
        return { internalFormat: gl.RG32F, format: gl.RG, type: gl.FLOAT, filter: gl.NEAREST };
      case "rgba16f":
      default:
        return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.FLOAT, filter: gl.LINEAR };
    }
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
      this.onError?.(err);
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

  _applyClear(passConfig, defaultClearColor) {
    const gl = this.gl;
    const clearCfg = passConfig.clear;

    let clearBits = 0;

    // Color clear
    const clearColor = (clearCfg && clearCfg.color === false) ? false : true;
    if (clearColor) {
      const cv = clearCfg?.color_value || defaultClearColor;
      gl.clearColor(...cv);
      clearBits |= gl.COLOR_BUFFER_BIT;
    }

    // Depth clear
    const clearDepth = (clearCfg && clearCfg.depth === false) ? false : true;
    if (clearDepth) {
      clearBits |= gl.DEPTH_BUFFER_BIT;
    }

    if (clearBits) {
      gl.clear(clearBits);
    }
  }

  _renderFrame(time, dt) {
    const gl = this.gl;
    if (!gl || !this._scene) return;

    const scene = this._scene;
    const clearColor = scene.clearColor || [0.08, 0.08, 0.12, 1.0];

    // Snapshot previous mouse state at start of frame
    this._mousePrev = [...this._mouseSnapshot];
    this._mouseDownPrev = this._mouseDownSnapshot;
    this._mouseSnapshot = [...this._mouse];
    this._mouseDownSnapshot = this._mouseDown;

    for (const passName of this._renderOrder) {
      if (passName === "__output__") {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this._applyClear(scene.output || {}, clearColor);
        this._renderPass("__output__", scene.output || {}, time, dt, this.canvas.width, this.canvas.height);
      } else {
        const buf = scene.buffers?.[passName];
        if (!buf) continue;
        const doubleBuffered = buf.double_buffer && this._pingPong[passName];

        let targetFBO;
        if (doubleBuffered) {
          targetFBO = this._pingPong[passName].write;
        } else {
          targetFBO = this._fbos[passName];
        }
        if (!targetFBO) continue;

        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.fbo);
        gl.viewport(0, 0, targetFBO.width, targetFBO.height);
        this._applyClear(buf, clearColor);
        this._renderPass(passName, buf, time, dt, targetFBO.width, targetFBO.height);

        // Swap ping-pong
        if (doubleBuffered) {
          const pp = this._pingPong[passName];
          const tmp = pp.read;
          pp.read = pp.write;
          pp.write = tmp;
          this._fbos[passName] = pp.read;
        }
      }
    }
  }

  _resolveDrawMode(mode) {
    const gl = this.gl;
    switch (mode) {
      case "lines":          return gl.LINES;
      case "line_strip":     return gl.LINE_STRIP;
      case "line_loop":      return gl.LINE_LOOP;
      case "points":         return gl.POINTS;
      case "triangle_strip": return gl.TRIANGLE_STRIP;
      case "triangle_fan":   return gl.TRIANGLE_FAN;
      case "triangles":
      default:               return gl.TRIANGLES;
    }
  }

  _resolveBlendFactor(f) {
    const gl = this.gl;
    switch (f) {
      case "zero":                return gl.ZERO;
      case "one":                 return gl.ONE;
      case "src_color":           return gl.SRC_COLOR;
      case "one_minus_src_color": return gl.ONE_MINUS_SRC_COLOR;
      case "dst_color":           return gl.DST_COLOR;
      case "one_minus_dst_color": return gl.ONE_MINUS_DST_COLOR;
      case "src_alpha":           return gl.SRC_ALPHA;
      case "one_minus_src_alpha": return gl.ONE_MINUS_SRC_ALPHA;
      case "dst_alpha":           return gl.DST_ALPHA;
      case "one_minus_dst_alpha": return gl.ONE_MINUS_DST_ALPHA;
      default:                    return gl.ONE;
    }
  }

  _resolveBlendEquation(eq) {
    const gl = this.gl;
    switch (eq) {
      case "add":              return gl.FUNC_ADD;
      case "subtract":         return gl.FUNC_SUBTRACT;
      case "reverse_subtract": return gl.FUNC_REVERSE_SUBTRACT;
      case "min":              return gl.MIN;
      case "max":              return gl.MAX;
      default:                 return gl.FUNC_ADD;
    }
  }

  _resolveDepthFunc(fn) {
    const gl = this.gl;
    switch (fn) {
      case "never":    return gl.NEVER;
      case "less":     return gl.LESS;
      case "equal":    return gl.EQUAL;
      case "lequal":   return gl.LEQUAL;
      case "greater":  return gl.GREATER;
      case "notequal": return gl.NOTEQUAL;
      case "gequal":   return gl.GEQUAL;
      case "always":   return gl.ALWAYS;
      default:         return gl.LESS;
    }
  }

  _resolveCullFace(face) {
    const gl = this.gl;
    switch (face) {
      case "front":          return gl.FRONT;
      case "front_and_back": return gl.FRONT_AND_BACK;
      case "back":
      default:               return gl.BACK;
    }
  }

  _applyRenderState(passConfig, vaoInfo) {
    const gl = this.gl;

    // Depth
    const depthCfg = passConfig.depth;
    if (depthCfg) {
      if (depthCfg.test !== false) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(this._resolveDepthFunc(depthCfg.func));
      } else {
        gl.disable(gl.DEPTH_TEST);
      }
      gl.depthMask(depthCfg.write !== false);
    } else {
      // Auto-detect: 3D → depth on, 2D → depth off
      if (vaoInfo.dimension === 3) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }
    }

    // Blend
    const blendCfg = passConfig.blend;
    if (blendCfg && blendCfg.enable !== false) {
      gl.enable(gl.BLEND);
      gl.blendFunc(
        this._resolveBlendFactor(blendCfg.src || "one"),
        this._resolveBlendFactor(blendCfg.dst || "one"),
      );
      gl.blendEquation(this._resolveBlendEquation(blendCfg.equation));
    } else {
      gl.disable(gl.BLEND);
    }

    // Cull
    const cullCfg = passConfig.cull;
    if (cullCfg && cullCfg.enable !== false) {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(this._resolveCullFace(cullCfg.face));
    } else {
      gl.disable(gl.CULL_FACE);
    }
  }

  _resetRenderState() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
  }

  _loadImageTexture(url) {
    if (this._imageTextures[url]) return this._imageTextures[url];

    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // 1x1 magenta placeholder until image loads
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 0, 255, 255]));

    const entry = { texture, loaded: false };
    this._imageTextures[url] = entry;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      entry.loaded = true;
    };
    img.onerror = () => {
      console.warn(`[GLEngine] Failed to load image texture: ${url}`);
    };
    img.src = url;

    return entry;
  }

  _renderPass(passName, passConfig, time, dt, resWidth, resHeight) {
    const gl = this.gl;
    const program = this._programs[passName];
    const vaoInfo = this._vaos[passName];
    if (!program || !vaoInfo) return;

    gl.useProgram(program);

    // Bind built-in uniforms — u_resolution matches actual render target size
    this._setUniform(program, "u_time", time);
    this._setUniform(program, "u_resolution", [resWidth, resHeight]);
    this._setUniform(program, "u_mouse", this._mouse);
    this._setUniform(program, "u_mouse_prev", this._mousePrev);
    this._setUniform(program, "u_frame", this._frameCount);
    this._setUniform(program, "u_dt", dt);
    this._setUniform(program, "u_mouse_down", this._mouseDown ? 1.0 : 0.0);
    this._setUniform(program, "u_mouse_down_prev", this._mouseDownPrev ? 1.0 : 0.0);

    // Bind keyboard uniforms
    for (const [name, code] of Object.entries(this._keyboardBindings)) {
      this._setUniform(program, name, this._pressedKeys.has(code) ? 1.0 : 0.0);
    }

    // Bind camera uniforms for 3D
    if (this._scene.camera && vaoInfo.dimension === 3) {
      this._bindCameraUniforms(program, time);
    }

    // Bind custom uniforms
    for (const [name, value] of Object.entries(this._customUniforms)) {
      this._setUniform(program, name, value);
    }

    // Bind input textures (buffers and images)
    let texUnit = 0;
    const inputs = passConfig.inputs || {};
    for (const [channelName, input] of Object.entries(inputs)) {
      if (input.type === "buffer") {
        // For self-referencing double-buffered passes, use the read (previous) buffer
        let fboData;
        if (input.name === passName && this._pingPong[input.name]) {
          fboData = this._pingPong[input.name].read;
        } else {
          fboData = this._fbos[input.name];
        }

        if (fboData) {
          gl.activeTexture(gl.TEXTURE0 + texUnit);
          gl.bindTexture(gl.TEXTURE_2D, fboData.texture);
          const loc = gl.getUniformLocation(program, channelName);
          if (loc) gl.uniform1i(loc, texUnit);
          texUnit++;
        } else {
          console.warn(`[GLEngine] Pass '${passName}': input '${channelName}' references buffer '${input.name}' but no FBO found`);
        }
      } else if (input.type === "image") {
        const entry = this._loadImageTexture(input.url);
        gl.activeTexture(gl.TEXTURE0 + texUnit);
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        const loc = gl.getUniformLocation(program, channelName);
        if (loc) gl.uniform1i(loc, texUnit);
        texUnit++;
      }
    }

    // Apply per-pass render state (depth, blend, cull)
    this._applyRenderState(passConfig, vaoInfo);

    // Instancing support
    const instanceCount = passConfig.instance_count || 1;
    if (instanceCount > 1) {
      this._setUniform(program, "u_instance_count", instanceCount);
    }

    // Draw
    const drawMode = this._resolveDrawMode(passConfig.draw_mode);
    gl.bindVertexArray(vaoInfo.vao);
    if (vaoInfo.hasIndices) {
      if (instanceCount > 1) {
        gl.drawElementsInstanced(drawMode, vaoInfo.vertexCount, gl.UNSIGNED_SHORT, 0, instanceCount);
      } else {
        gl.drawElements(drawMode, vaoInfo.vertexCount, gl.UNSIGNED_SHORT, 0);
      }
    } else {
      if (instanceCount > 1) {
        gl.drawArraysInstanced(drawMode, 0, vaoInfo.vertexCount, instanceCount);
      } else {
        gl.drawArrays(drawMode, 0, vaoInfo.vertexCount);
      }
    }
    gl.bindVertexArray(null);

    // Reset GL state to prevent leaks between passes
    this._resetRenderState();
  }

  _bindCameraUniforms(program, time) {
    const cam = this._scene.camera || {};
    const cu = this._customUniforms;
    const defPos = cam.position || [2, 1.5, 2];
    const defTarget = cam.target || [0, 0, 0];

    // Allow UI sliders to override camera parameters
    const pos = [
      cu.u_cam_pos_x !== undefined ? cu.u_cam_pos_x : defPos[0],
      cu.u_cam_pos_y !== undefined ? cu.u_cam_pos_y : defPos[1],
      cu.u_cam_pos_z !== undefined ? cu.u_cam_pos_z : defPos[2],
    ];
    const target = [
      cu.u_cam_target_x !== undefined ? cu.u_cam_target_x : defTarget[0],
      cu.u_cam_target_y !== undefined ? cu.u_cam_target_y : defTarget[1],
      cu.u_cam_target_z !== undefined ? cu.u_cam_target_z : defTarget[2],
    ];
    const fov = cu.u_cam_fov !== undefined ? cu.u_cam_fov : (cam.fov || 60);
    const aspect = this.canvas.width / this.canvas.height;

    const proj = perspective(fov, aspect, 0.1, 100.0);
    const view = lookAt(pos, target);

    let model = mat4Identity();
    const anim = this._scene.animation;
    if (anim?.model_rotation) {
      const axis = anim.model_rotation.axis || [0, 1, 0];
      const speed = anim.model_rotation.speed || 0.5;
      model = rotateAxis(axis, time * speed);
    }

    const mvp = mat4Multiply(proj, mat4Multiply(view, model));

    this._setUniformMatrix4(program, "u_mvp", mvp);
    this._setUniformMatrix4(program, "u_model", model);
    this._setUniform(program, "u_camera_pos", pos);
  }

  _setUniform(program, name, value) {
    const gl = this.gl;
    const loc = gl.getUniformLocation(program, name);
    if (!loc) return;

    if (typeof value === "number") {
      if (Number.isInteger(value) && name === "u_instance_count") {
        gl.uniform1i(loc, value);
      } else {
        gl.uniform1f(loc, value);
      }
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 2: gl.uniform2fv(loc, value); break;
        case 3: gl.uniform3fv(loc, value); break;
        case 4: gl.uniform4fv(loc, value); break;
      }
    }
  }

  _setUniformMatrix4(program, name, matrix) {
    const gl = this.gl;
    const loc = gl.getUniformLocation(program, name);
    if (loc) {
      gl.uniformMatrix4fv(loc, false, matrix);
    }
  }

  updateUniform(name, value) {
    this._customUniforms[name] = value;
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

  getBufferImageData(bufferName) {
    const gl = this.gl;
    const fboData = this._fbos[bufferName];
    if (!fboData) return null;

    const w = fboData.width;
    const h = fboData.height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fboData.fbo);

    // Detect whether this FBO uses a float texture by querying the
    // implementation-chosen readPixels type for this framebuffer.
    let implType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    const isFloat = implType === gl.FLOAT || implType === gl.HALF_FLOAT;

    let rgba8;
    if (isFloat) {
      // Read as float, then convert to 0-255
      const floats = new Float32Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, floats);
      rgba8 = new Uint8Array(w * h * 4);
      for (let i = 0, len = floats.length; i < len; i++) {
        rgba8[i] = Math.max(0, Math.min(255, (floats[i] * 255 + 0.5) | 0));
      }
    } else {
      rgba8 = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba8);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Flip Y
    const flipped = new Uint8Array(w * h * 4);
    for (let row = 0; row < h; row++) {
      const srcOffset = row * w * 4;
      const dstOffset = (h - 1 - row) * w * 4;
      flipped.set(rgba8.subarray(srcOffset, srcOffset + w * 4), dstOffset);
    }

    return new ImageData(new Uint8ClampedArray(flipped.buffer), w, h);
  }

  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    this.canvas.width = width;
    this.canvas.height = height;

    // Recreate FBOs at new resolution
    if (this._scene) {
      const buffers = this._scene.buffers || {};
      for (const [name, buf] of Object.entries(buffers)) {
        this._destroyFBO(name);
        this._createFBOInto(this._fbos, this._pingPong, name, buf.double_buffer || false, buf.resolution_scale || 1.0, buf.texture_format);
      }
    }
  }

  _destroyFBO(bufferName) {
    const gl = this.gl;
    const fbo = this._fbos[bufferName];
    if (fbo) {
      gl.deleteFramebuffer(fbo.fbo);
      gl.deleteTexture(fbo.texture);
      gl.deleteRenderbuffer(fbo.depthBuffer);
      delete this._fbos[bufferName];
    }
    const pp = this._pingPong[bufferName];
    if (pp) {
      for (const buf of [pp.read, pp.write]) {
        gl.deleteFramebuffer(buf.fbo);
        gl.deleteTexture(buf.texture);
        gl.deleteRenderbuffer(buf.depthBuffer);
      }
      delete this._pingPong[bufferName];
    }
  }

  _disposeScene() {
    const gl = this.gl;
    if (!gl) return;

    for (const prog of Object.values(this._programs)) gl.deleteProgram(prog);
    for (const vaoInfo of Object.values(this._vaos)) gl.deleteVertexArray(vaoInfo.vao);
    for (const name of Object.keys(this._fbos)) this._destroyFBO(name);
    for (const entry of Object.values(this._imageTextures)) gl.deleteTexture(entry.texture);

    this._programs = {};
    this._vaos = {};
    this._fbos = {};
    this._pingPong = {};
    this._renderOrder = [];
    this._customUniforms = {};
    this._imageTextures = {};
    this._keyboardBindings = {};
    this._pressedKeys.clear();
  }

  dispose() {
    this.stop();
    this._disposeScene();
    this._scene = null;
  }

  getBufferNames() {
    if (!this._scene?.buffers) return [];
    return Object.keys(this._scene.buffers);
  }
}


// ---------------------------------------------------------------------------
// Math helpers (column-major for WebGL)
// ---------------------------------------------------------------------------

function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function perspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan((fov * Math.PI / 180) / 2.0);
  const nf = near - far;
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / nf, -1,
    0, 0, (2 * far * near) / nf, 0,
  ]);
}

function lookAt(eye, target) {
  const up = [0, 1, 0];
  const fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fLen = Math.sqrt(fx*fx + fy*fy + fz*fz);
  const f = [fx/fLen, fy/fLen, fz/fLen];

  const sx = f[1]*up[2] - f[2]*up[1], sy = f[2]*up[0] - f[0]*up[2], sz = f[0]*up[1] - f[1]*up[0];
  const sLen = Math.sqrt(sx*sx + sy*sy + sz*sz);
  const s = [sx/sLen, sy/sLen, sz/sLen];

  const u = [s[1]*f[2] - s[2]*f[1], s[2]*f[0] - s[0]*f[2], s[0]*f[1] - s[1]*f[0]];

  return new Float32Array([
    s[0], u[0], -f[0], 0,
    s[1], u[1], -f[1], 0,
    s[2], u[2], -f[2], 0,
    -(s[0]*eye[0] + s[1]*eye[1] + s[2]*eye[2]),
    -(u[0]*eye[0] + u[1]*eye[1] + u[2]*eye[2]),
    (f[0]*eye[0] + f[1]*eye[1] + f[2]*eye[2]),
    1,
  ]);
}

function rotateAxis(axis, angle) {
  const [x, y, z] = axis;
  const len = Math.sqrt(x*x + y*y + z*z);
  const nx = x/len, ny = y/len, nz = z/len;
  const c = Math.cos(angle), s = Math.sin(angle);
  const t = 1 - c;
  return new Float32Array([
    t*nx*nx + c,      t*nx*ny + s*nz,  t*nx*nz - s*ny, 0,
    t*nx*ny - s*nz,   t*ny*ny + c,     t*ny*nz + s*nx, 0,
    t*nx*nz + s*ny,   t*ny*nz - s*nx,  t*nz*nz + c,    0,
    0, 0, 0, 1,
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[0 * 4 + i] * b[j * 4 + 0] +
        a[1 * 4 + i] * b[j * 4 + 1] +
        a[2 * 4 + i] * b[j * 4 + 2] +
        a[3 * 4 + i] * b[j * 4 + 3];
    }
  }
  return out;
}
