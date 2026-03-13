/**
 * RendererInterface — Backend-agnostic renderer abstraction.
 *
 * Every backend (WebGL2, WebGPU) implements this interface.
 * The engine and render graph operate through these methods only,
 * so user-authoring code stays backend-independent.
 *
 * Concrete backends: WebGLBackend, WebGPUBackend
 */

/** @enum {string} */
export const BackendType = {
  WEBGL2: "webgl2",
  WEBGPU: "webgpu",
};

/** @enum {string} */
export const TextureFormat = {
  RGBA8: "rgba8unorm",
  RGBA16F: "rgba16float",
  RGBA32F: "rgba32float",
  DEPTH24: "depth24plus",
  DEPTH32F: "depth32float",
};

/** @enum {string} */
export const BufferUsage = {
  VERTEX: "vertex",
  INDEX: "index",
  UNIFORM: "uniform",
  STORAGE: "storage",
  COPY_SRC: "copy-src",
  COPY_DST: "copy-dst",
};

/** @enum {string} */
export const ShaderStage = {
  VERTEX: "vertex",
  FRAGMENT: "fragment",
  COMPUTE: "compute",
};

/** @enum {string} */
export const FilterMode = {
  NEAREST: "nearest",
  LINEAR: "linear",
};

/** @enum {string} */
export const AddressMode = {
  CLAMP: "clamp-to-edge",
  REPEAT: "repeat",
  MIRROR: "mirror-repeat",
};

/** @enum {string} */
export const PrimitiveTopology = {
  TRIANGLES: "triangle-list",
  TRIANGLE_STRIP: "triangle-strip",
  LINES: "line-list",
  LINE_STRIP: "line-strip",
  POINTS: "point-list",
};

/** Map a GPUTextureFormat string to its bytes-per-pixel count. */
export function bytesPerPixel(format) {
  switch (format) {
    case "r8unorm": case "r8snorm": case "r8uint": case "r8sint":
      return 1;
    case "rg8unorm": case "rg8snorm": case "rg8uint": case "rg8sint":
      return 2;
    case "rgba8unorm": case "rgba8snorm": case "rgba8uint": case "rgba8sint":
    case "bgra8unorm":
    case "r32float": case "r32uint": case "r32sint":
    case "rg16float": case "rg16uint": case "rg16sint":
      return 4;
    case "rg32float": case "rg32uint": case "rg32sint":
    case "rgba16float": case "rgba16uint": case "rgba16sint":
      return 8;
    case "rgba32float": case "rgba32uint": case "rgba32sint":
      return 16;
    default:
      return 4;
  }
}

/**
 * Abstract renderer interface.
 * Methods throw if not overridden — forces implementation in subclass.
 */
export class RendererInterface {
  constructor() {
    /** @type {BackendType} */
    this.backendType = null;
    /** @type {HTMLCanvasElement} */
    this.canvas = null;
    /** @type {boolean} */
    this.ready = false;
    /** @type {Array<{type: string, message: string, timestamp: number}>} */
    this.validationErrors = [];
    /** @type {number} max errors kept in buffer */
    this.maxValidationErrors = 100;
  }

  // ─── Lifecycle ───────────────────────────────────────────

  /** Initialize the backend (may be async for WebGPU). Returns this. */
  async init(canvas, options = {}) { throw new Error("Not implemented: init"); }

  /** Tear down all GPU resources. */
  dispose() { throw new Error("Not implemented: dispose"); }

  /** Resize the drawing surface. */
  resize(width, height) { throw new Error("Not implemented: resize"); }

  // ─── Device / Context ────────────────────────────────────

  /** Return the raw native context (WebGL2RenderingContext | GPUDevice). */
  getNativeContext() { throw new Error("Not implemented: getNativeContext"); }

  /** Query device capabilities. */
  getCapabilities() { throw new Error("Not implemented: getCapabilities"); }

  // ─── Buffer ──────────────────────────────────────────────

  /**
   * Create a GPU buffer.
   * @param {{ usage: BufferUsage|BufferUsage[], size: number, data?: ArrayBufferView, label?: string }} desc
   * @returns {GPUBufferHandle}
   */
  createBuffer(desc) { throw new Error("Not implemented: createBuffer"); }

  /** Write data into an existing buffer. */
  writeBuffer(handle, data, offset = 0) { throw new Error("Not implemented: writeBuffer"); }

  /** Destroy a buffer. */
  destroyBuffer(handle) { throw new Error("Not implemented: destroyBuffer"); }

  // ─── Texture ─────────────────────────────────────────────

  /**
   * Create a texture.
   * @param {{ width: number, height: number, format?: TextureFormat, usage?: string[], label?: string }} desc
   * @returns {GPUTextureHandle}
   */
  createTexture(desc) { throw new Error("Not implemented: createTexture"); }

  /** Upload pixel data or image source to a texture. */
  writeTexture(handle, source, options = {}) { throw new Error("Not implemented: writeTexture"); }

  /** Destroy a texture. */
  destroyTexture(handle) { throw new Error("Not implemented: destroyTexture"); }

  // ─── Sampler ─────────────────────────────────────────────

  /**
   * Create a sampler.
   * @param {{ minFilter?: FilterMode, magFilter?: FilterMode, addressModeU?: AddressMode, addressModeV?: AddressMode, label?: string }} desc
   * @returns {GPUSamplerHandle}
   */
  createSampler(desc = {}) { throw new Error("Not implemented: createSampler"); }

  destroySampler(handle) { throw new Error("Not implemented: destroySampler"); }

  // ─── Shader Module ───────────────────────────────────────

  /**
   * Create a shader module from source.
   * @param {{ code: string, stage?: ShaderStage, label?: string }} desc
   * @returns {GPUShaderModuleHandle}
   */
  createShaderModule(desc) { throw new Error("Not implemented: createShaderModule"); }

  destroyShaderModule(handle) { throw new Error("Not implemented: destroyShaderModule"); }

  // ─── Pipeline ────────────────────────────────────────────

  /**
   * Create a render pipeline.
   * @param {{ vertex: { module, entryPoint?, buffers? }, fragment: { module, entryPoint?, targets? }, primitive?: { topology? }, depthStencil?: object, layout?: GPUPipelineLayoutHandle, label?: string }} desc
   * @returns {GPURenderPipelineHandle}
   */
  createRenderPipeline(desc) { throw new Error("Not implemented: createRenderPipeline"); }

  /**
   * Create a compute pipeline (WebGPU only — throws on WebGL).
   * @param {{ module, entryPoint?, constants?: object, layout?: GPUPipelineLayoutHandle, label?: string }} desc
   * @returns {GPUComputePipelineHandle}
   */
  createComputePipeline(desc) { throw new Error("Not implemented: createComputePipeline"); }

  destroyPipeline(handle) { throw new Error("Not implemented: destroyPipeline"); }

  // ─── Bind Group Layout / Pipeline Layout ─────────────────

  /**
   * Create a bind group layout (explicit layout definition).
   * @param {{ entries: Array<object>, label?: string }} desc
   * @returns {GPUBindGroupLayoutHandle}
   */
  createBindGroupLayout(desc) { throw new Error("Not implemented: createBindGroupLayout"); }

  /**
   * Create a pipeline layout from bind group layouts.
   * @param {{ bindGroupLayouts: Array<GPUBindGroupLayoutHandle>, label?: string }} desc
   * @returns {GPUPipelineLayoutHandle}
   */
  createPipelineLayout(desc) { throw new Error("Not implemented: createPipelineLayout"); }

  // ─── Bind Group / Resources ──────────────────────────────

  /**
   * Create a bind group (uniform/texture/sampler/storage binding set).
   * @param {{ layout?: object, pipeline?: object, groupIndex?: number, entries: Array<{ binding: number, resource: object }>, label?: string }} desc
   * @returns {GPUBindGroupHandle}
   */
  createBindGroup(desc) { throw new Error("Not implemented: createBindGroup"); }

  destroyBindGroup(handle) { throw new Error("Not implemented: destroyBindGroup"); }

  // ─── Render Target (Framebuffer) ─────────────────────────

  /**
   * Create an offscreen render target.
   * @param {{ width: number, height: number, format?: TextureFormat, depth?: boolean, label?: string }} desc
   * @returns {RenderTargetHandle}
   */
  createRenderTarget(desc) { throw new Error("Not implemented: createRenderTarget"); }

  destroyRenderTarget(handle) { throw new Error("Not implemented: destroyRenderTarget"); }

  // ─── Command Encoder / Passes ────────────────────────────

  /**
   * Begin a frame — returns a command encoder context.
   * @returns {CommandEncoderHandle}
   */
  beginFrame() { throw new Error("Not implemented: beginFrame"); }

  /**
   * End the frame, submit commands.
   * @param {CommandEncoderHandle} encoder
   */
  endFrame(encoder) { throw new Error("Not implemented: endFrame"); }

  /**
   * Begin a render pass.
   * @param {CommandEncoderHandle} encoder
   * @param {{ colorAttachments: Array<{ target?, clearColor? }>, depthAttachment?: object, label?: string }} desc
   * @returns {RenderPassHandle}
   */
  beginRenderPass(encoder, desc) { throw new Error("Not implemented: beginRenderPass"); }

  /**
   * End a render pass.
   * @param {RenderPassHandle} pass
   */
  endRenderPass(pass) { throw new Error("Not implemented: endRenderPass"); }

  /**
   * Begin a compute pass (WebGPU only).
   * @param {CommandEncoderHandle} encoder
   * @param {{ label?: string }} desc
   * @returns {ComputePassHandle}
   */
  beginComputePass(encoder, desc = {}) { throw new Error("Not implemented: beginComputePass"); }

  endComputePass(pass) { throw new Error("Not implemented: endComputePass"); }

  // ─── Draw Commands (inside render pass) ──────────────────

  setPipeline(pass, pipeline) { throw new Error("Not implemented: setPipeline"); }
  setBindGroup(pass, index, bindGroup) { throw new Error("Not implemented: setBindGroup"); }
  setVertexBuffer(pass, slot, buffer) { throw new Error("Not implemented: setVertexBuffer"); }
  setIndexBuffer(pass, buffer, format) { throw new Error("Not implemented: setIndexBuffer"); }
  draw(pass, vertexCount, instanceCount, firstVertex, firstInstance) { throw new Error("Not implemented: draw"); }
  drawIndexed(pass, indexCount, instanceCount, firstIndex, baseVertex, firstInstance) { throw new Error("Not implemented: drawIndexed"); }

  // ─── Compute Commands (inside compute pass) ──────────────

  setComputePipeline(pass, pipeline) { throw new Error("Not implemented: setComputePipeline"); }
  dispatch(pass, x, y, z) { throw new Error("Not implemented: dispatch"); }

  // ─── Readback ────────────────────────────────────────────

  /** Read pixels from a render target → Uint8Array. */
  readPixels(target, x, y, width, height) { throw new Error("Not implemented: readPixels"); }

  /** Read a storage/vertex buffer back to CPU → TypedArray (async). */
  readStorageBuffer(bufferHandle, TypedArrayClass, byteOffset, byteLength) { throw new Error("Not implemented: readStorageBuffer"); }

  // ─── Validation Error Tracking ───────────────────────────

  /** Push a validation error for Debug Panel consumption. */
  pushValidationError(type, message) {
    const entry = { type, message, timestamp: performance.now() };
    this.validationErrors.push(entry);
    if (this.validationErrors.length > this.maxValidationErrors) {
      this.validationErrors.shift();
    }
    // Log to console so agent error collector picks it up
    console.error(`[WebGPU ${type}] ${message}`);
    // Dispatch custom event for Debug Panel
    window.dispatchEvent(new CustomEvent("gpu-validation-error", { detail: entry }));
  }

  /** Get and clear all pending validation errors. */
  consumeValidationErrors() {
    const errors = this.validationErrors.slice();
    this.validationErrors.length = 0;
    return errors;
  }
}
