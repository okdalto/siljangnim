/**
 * WebGLBackend — WebGL2 implementation of RendererInterface.
 *
 * Wraps the existing WebGL2 rendering context behind the abstract API.
 * Also exposes .gl for legacy script-mode direct access.
 */

import {
  RendererInterface,
  BackendType,
  TextureFormat,
  BufferUsage,
  FilterMode,
  AddressMode,
  PrimitiveTopology,
} from "./RendererInterface.js";

// ─── Format mappings ───────────────────────────────────────

function glTextureFormat(gl, fmt) {
  switch (fmt) {
    case TextureFormat.RGBA8:   return { internalFormat: gl.RGBA8,   format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    case TextureFormat.RGBA16F: return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
    case TextureFormat.RGBA32F: return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT };
    case TextureFormat.DEPTH24: return { internalFormat: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT };
    case TextureFormat.DEPTH32F: return { internalFormat: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT };
    default: return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  }
}

function glFilter(gl, mode) {
  return mode === FilterMode.NEAREST ? gl.NEAREST : gl.LINEAR;
}

function glAddressMode(gl, mode) {
  switch (mode) {
    case AddressMode.REPEAT: return gl.REPEAT;
    case AddressMode.MIRROR: return gl.MIRRORED_REPEAT;
    default: return gl.CLAMP_TO_EDGE;
  }
}

function glTopology(gl, topo) {
  switch (topo) {
    case PrimitiveTopology.TRIANGLE_STRIP: return gl.TRIANGLE_STRIP;
    case PrimitiveTopology.LINES: return gl.LINES;
    case PrimitiveTopology.LINE_STRIP: return gl.LINE_STRIP;
    case PrimitiveTopology.POINTS: return gl.POINTS;
    default: return gl.TRIANGLES;
  }
}

function glBufferUsage(gl, usage) {
  if (Array.isArray(usage)) {
    // Heuristic: if includes STORAGE → DYNAMIC_DRAW, else STATIC_DRAW
    return usage.includes(BufferUsage.STORAGE) ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
  }
  return usage === BufferUsage.UNIFORM || usage === BufferUsage.STORAGE
    ? gl.DYNAMIC_DRAW
    : gl.STATIC_DRAW;
}

// ─── Handle wrappers ──────────────────────────────────────

let _nextId = 1;
function nextId() { return _nextId++; }

// ─── WebGLBackend ─────────────────────────────────────────

export class WebGLBackend extends RendererInterface {
  constructor() {
    super();
    this.backendType = BackendType.WEBGL2;
    /** @type {WebGL2RenderingContext} */
    this.gl = null;
    this._extensions = {};
    // Track current GL state for pass emulation
    this._currentProgram = null;
    this._currentVAO = null;
  }

  async init(canvas, options = {}) {
    this.canvas = canvas;
    const { alpha = false, antialias = true, preserveDrawingBuffer = true } = options;

    this.gl = canvas.getContext("webgl2", { alpha, antialias, preserveDrawingBuffer });
    if (!this.gl) throw new Error("WebGL2 not supported");

    // Enable commonly needed extensions
    this._extensions.colorBufferFloat = this.gl.getExtension("EXT_color_buffer_float");
    this._extensions.floatLinear = this.gl.getExtension("OES_texture_float_linear");

    this.ready = true;
    return this;
  }

  dispose() {
    const ext = this.gl?.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
    this.gl = null;
    this.ready = false;
  }

  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  getNativeContext() { return this.gl; }

  getCapabilities() {
    const gl = this.gl;
    return {
      backend: BackendType.WEBGL2,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxColorAttachments: gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
      floatTextures: !!this._extensions.colorBufferFloat,
      floatLinearFilter: !!this._extensions.floatLinear,
      compute: false,
      storageBuffers: false,
    };
  }

  // ─── Buffer ────────────────────────────────────────────

  createBuffer(desc) {
    const gl = this.gl;
    const { usage, size, data, label } = desc;
    const buffer = gl.createBuffer();
    const target = (Array.isArray(usage) ? usage[0] : usage) === BufferUsage.INDEX
      ? gl.ELEMENT_ARRAY_BUFFER
      : gl.ARRAY_BUFFER;
    const glUsage = glBufferUsage(gl, usage);

    gl.bindBuffer(target, buffer);
    if (data) {
      gl.bufferData(target, data, glUsage);
    } else {
      gl.bufferData(target, size, glUsage);
    }
    gl.bindBuffer(target, null);

    return { _id: nextId(), _native: buffer, _target: target, _usage: glUsage, _size: size || data.byteLength, label };
  }

  writeBuffer(handle, data, offset = 0) {
    const gl = this.gl;
    gl.bindBuffer(handle._target, handle._native);
    gl.bufferSubData(handle._target, offset, data);
    gl.bindBuffer(handle._target, null);
  }

  destroyBuffer(handle) {
    this.gl.deleteBuffer(handle._native);
    handle._native = null;
  }

  // ─── Texture ───────────────────────────────────────────

  createTexture(desc) {
    const gl = this.gl;
    const { width, height, format = TextureFormat.RGBA8, label } = desc;
    const fmt = glTextureFormat(gl, format);
    const texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, width, height, 0, fmt.format, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { _id: nextId(), _native: texture, width, height, format, label };
  }

  writeTexture(handle, source, options = {}) {
    const gl = this.gl;
    const { flipY = true } = options;
    gl.bindTexture(gl.TEXTURE_2D, handle._native);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);

    if (source instanceof Uint8Array || source instanceof Float32Array) {
      const fmt = glTextureFormat(gl, handle.format);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, handle.width, handle.height, 0, fmt.format, fmt.type, source);
    } else {
      // ImageBitmap, HTMLImageElement, HTMLVideoElement, HTMLCanvasElement
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  destroyTexture(handle) {
    this.gl.deleteTexture(handle._native);
    handle._native = null;
  }

  // ─── Sampler ───────────────────────────────────────────

  createSampler(desc = {}) {
    const gl = this.gl;
    const {
      minFilter = FilterMode.LINEAR,
      magFilter = FilterMode.LINEAR,
      addressModeU = AddressMode.CLAMP,
      addressModeV = AddressMode.CLAMP,
      label,
    } = desc;

    // WebGL2 has sampler objects
    const sampler = gl.createSampler();
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, glFilter(gl, minFilter));
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, glFilter(gl, magFilter));
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, glAddressMode(gl, addressModeU));
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, glAddressMode(gl, addressModeV));

    return { _id: nextId(), _native: sampler, label };
  }

  destroySampler(handle) {
    this.gl.deleteSampler(handle._native);
    handle._native = null;
  }

  // ─── Shader Module ─────────────────────────────────────

  createShaderModule(desc) {
    // For WebGL, we store the source and compile later during pipeline creation.
    // stage is required for WebGL (vertex or fragment).
    const { code, stage, label } = desc;
    return { _id: nextId(), code, stage, label, _backend: BackendType.WEBGL2 };
  }

  destroyShaderModule(handle) {
    handle.code = null;
  }

  // ─── Pipeline ──────────────────────────────────────────

  createRenderPipeline(desc) {
    const gl = this.gl;
    const { vertex, fragment, primitive = {}, depthStencil, label } = desc;

    // Compile and link
    const vs = this._compileShader(gl.VERTEX_SHADER, vertex.module.code);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fragment.module.code);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      this.pushValidationError("pipeline", `Program link error: ${log}`);
      throw new Error(`Program link error:\n${log}`);
    }

    // Build VAO from vertex buffer layout
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    if (vertex.buffers) {
      let locationOffset = 0;
      for (const bufDesc of vertex.buffers) {
        const stride = bufDesc.arrayStride || 0;
        for (const attr of (bufDesc.attributes || [])) {
          const loc = attr.shaderLocation ?? locationOffset;
          gl.enableVertexAttribArray(loc);
          // We defer the actual buffer binding to draw time
          locationOffset = Math.max(locationOffset, loc + 1);
        }
      }
    }
    gl.bindVertexArray(null);

    return {
      _id: nextId(),
      _program: program,
      _vao: vao,
      _topology: glTopology(gl, primitive.topology),
      _vertexBuffers: vertex.buffers || [],
      _depthStencil: depthStencil,
      _uniformLocations: {},
      label,
    };
  }

  createComputePipeline(_desc) {
    this.pushValidationError("compute", "Compute shaders are not supported in WebGL2 backend");
    throw new Error("Compute shaders not supported in WebGL2");
  }

  destroyPipeline(handle) {
    const gl = this.gl;
    if (handle._program) gl.deleteProgram(handle._program);
    if (handle._vao) gl.deleteVertexArray(handle._vao);
    handle._program = null;
    handle._vao = null;
  }

  // ─── Bind Group ────────────────────────────────────────

  createBindGroup(desc) {
    // In WebGL, bind groups are emulated: we store the entries
    // and apply them before draw calls using uniform/texture binding.
    return { _id: nextId(), entries: desc.entries, label: desc.label };
  }

  destroyBindGroup(handle) {
    handle.entries = null;
  }

  // ─── Render Target ─────────────────────────────────────

  createRenderTarget(desc) {
    const gl = this.gl;
    const { width, height, format = TextureFormat.RGBA8, depth = false, label } = desc;
    const fmt = glTextureFormat(gl, format);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, width, height, 0, fmt.format, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let depthRb = null;
    if (depth) {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const texHandle = { _id: nextId(), _native: texture, width, height, format, label: label ? `${label}.color` : undefined };
    return { _id: nextId(), _fbo: fbo, _depthRb: depthRb, texture: texHandle, width, height, label };
  }

  destroyRenderTarget(handle) {
    const gl = this.gl;
    gl.deleteFramebuffer(handle._fbo);
    if (handle._depthRb) gl.deleteRenderbuffer(handle._depthRb);
    if (handle.texture?._native) gl.deleteTexture(handle.texture._native);
    handle._fbo = null;
  }

  // ─── Command Encoder / Passes ──────────────────────────

  beginFrame() {
    // WebGL is immediate-mode — no explicit command encoder needed.
    return { _backend: BackendType.WEBGL2, _passes: [] };
  }

  endFrame(_encoder) {
    // Nothing to submit in WebGL — commands are already executed.
  }

  beginRenderPass(encoder, desc) {
    const gl = this.gl;
    const { colorAttachments = [], depthAttachment, label } = desc;

    // Bind FBO (null = default framebuffer = screen)
    const target = colorAttachments[0]?.target || null;
    if (target && target._fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target._fbo);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    // Clear
    let clearBits = 0;
    if (colorAttachments[0]?.clearColor) {
      const c = colorAttachments[0].clearColor;
      gl.clearColor(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1);
      clearBits |= gl.COLOR_BUFFER_BIT;
    }
    if (depthAttachment?.clearDepth !== undefined) {
      gl.clearDepth(depthAttachment.clearDepth);
      gl.enable(gl.DEPTH_TEST);
      clearBits |= gl.DEPTH_BUFFER_BIT;
    }
    if (clearBits) gl.clear(clearBits);

    return { _backend: BackendType.WEBGL2, _target: target, label };
  }

  endRenderPass(_pass) {
    // Unbind VAO to avoid side effects
    this.gl.bindVertexArray(null);
    this._currentProgram = null;
  }

  beginComputePass(_encoder, _desc) {
    this.pushValidationError("compute", "Compute passes not supported in WebGL2");
    throw new Error("Compute passes not supported in WebGL2");
  }

  endComputePass(_pass) {}

  // ─── Draw Commands ─────────────────────────────────────

  setPipeline(pass, pipeline) {
    const gl = this.gl;
    gl.useProgram(pipeline._program);
    gl.bindVertexArray(pipeline._vao);
    this._currentProgram = pipeline;

    if (pipeline._depthStencil) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
    }

    pass._pipeline = pipeline;
  }

  setBindGroup(pass, index, bindGroup) {
    const gl = this.gl;
    const pipeline = pass._pipeline;
    if (!pipeline || !bindGroup?.entries) return;

    let textureUnit = index * 8; // offset texture units per bind group

    for (const entry of bindGroup.entries) {
      const { binding, resource } = entry;

      if (resource.type === "uniform-buffer") {
        // UBO binding
        gl.bindBufferBase(gl.UNIFORM_BUFFER, binding, resource.buffer._native);
      } else if (resource.type === "texture") {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, resource.texture._native);
        // Set uniform sampler to this texture unit
        if (resource.uniformName) {
          const loc = this._getUniformLocation(pipeline, resource.uniformName);
          if (loc !== null) gl.uniform1i(loc, textureUnit);
        }
        textureUnit++;
      } else if (resource.type === "sampler") {
        gl.bindSampler(textureUnit - 1, resource.sampler._native);
      } else if (resource.type === "uniforms") {
        // Direct uniform setting (WebGL convenience — not in WebGPU)
        for (const [name, value] of Object.entries(resource.values)) {
          const loc = this._getUniformLocation(pipeline, name);
          if (loc === null) continue;
          if (typeof value === "number") {
            gl.uniform1f(loc, value);
          } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            switch (value.length) {
              case 2: gl.uniform2fv(loc, value); break;
              case 3: gl.uniform3fv(loc, value); break;
              case 4: gl.uniform4fv(loc, value); break;
              case 9: gl.uniformMatrix3fv(loc, false, value); break;
              case 16: gl.uniformMatrix4fv(loc, false, value); break;
              default: gl.uniform1fv(loc, value);
            }
          }
        }
      }
    }
  }

  setVertexBuffer(pass, slot, buffer) {
    const gl = this.gl;
    const pipeline = pass._pipeline;
    if (!pipeline) return;

    const bufDesc = pipeline._vertexBuffers[slot];
    if (!bufDesc) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer._native);

    for (const attr of (bufDesc.attributes || [])) {
      const loc = attr.shaderLocation;
      const numComponents = attr.format?.includes("x4") ? 4 : attr.format?.includes("x3") ? 3 : attr.format?.includes("x2") ? 2 : attr.components || 2;
      const stride = bufDesc.arrayStride || 0;
      const offset = attr.offset || 0;
      gl.vertexAttribPointer(loc, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(loc);
    }
  }

  setIndexBuffer(pass, buffer, _format) {
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffer._native);
    pass._indexBuffer = buffer;
  }

  draw(pass, vertexCount, instanceCount = 1, firstVertex = 0, _firstInstance = 0) {
    const topology = pass._pipeline?._topology ?? this.gl.TRIANGLES;
    if (instanceCount > 1) {
      this.gl.drawArraysInstanced(topology, firstVertex, vertexCount, instanceCount);
    } else {
      this.gl.drawArrays(topology, firstVertex, vertexCount);
    }
  }

  drawIndexed(pass, indexCount, instanceCount = 1, firstIndex = 0, _baseVertex = 0, _firstInstance = 0) {
    const topology = pass._pipeline?._topology ?? this.gl.TRIANGLES;
    const byteOffset = firstIndex * 2; // Uint16
    if (instanceCount > 1) {
      this.gl.drawElementsInstanced(topology, indexCount, this.gl.UNSIGNED_SHORT, byteOffset, instanceCount);
    } else {
      this.gl.drawElements(topology, indexCount, this.gl.UNSIGNED_SHORT, byteOffset);
    }
  }

  // ─── Compute (noop / error) ────────────────────────────

  setComputePipeline(_pass, _pipeline) {
    this.pushValidationError("compute", "Compute not supported in WebGL2");
  }

  dispatch(_pass, _x, _y, _z) {
    this.pushValidationError("compute", "Compute not supported in WebGL2");
  }

  // ─── Readback ──────────────────────────────────────────

  readPixels(target, x, y, width, height) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target._fbo);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return pixels;
  }

  // ─── Internal ──────────────────────────────────────────

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      this.pushValidationError("shader", `Shader compile error: ${log}`);
      throw new Error(`Shader compile error:\n${log}`);
    }
    return shader;
  }

  _getUniformLocation(pipeline, name) {
    if (!pipeline._uniformLocations[name]) {
      pipeline._uniformLocations[name] = this.gl.getUniformLocation(pipeline._program, name);
    }
    return pipeline._uniformLocations[name];
  }
}
