/**
 * WebGPUBackend — Minimal WebGPU implementation of RendererInterface.
 *
 * Supports: one-pass rendering, texture sampling, uniform control, compute dispatch.
 * Falls back gracefully if WebGPU is unavailable (detection happens in backendSelector).
 */

import {
  RendererInterface,
  BackendType,
  TextureFormat,
  FilterMode,
  AddressMode,
  PrimitiveTopology,
} from "./RendererInterface.js";

// ─── Format mappings ───────────────────────────────────────

function gpuTextureFormat(fmt) {
  switch (fmt) {
    case TextureFormat.RGBA8:    return "rgba8unorm";
    case TextureFormat.RGBA16F:  return "rgba16float";
    case TextureFormat.RGBA32F:  return "rgba32float";
    case TextureFormat.DEPTH24:  return "depth24plus";
    case TextureFormat.DEPTH32F: return "depth32float-stencil8";
    default: return "rgba8unorm";
  }
}

function gpuFilterMode(mode) {
  return mode === FilterMode.NEAREST ? "nearest" : "linear";
}

function gpuAddressMode(mode) {
  switch (mode) {
    case AddressMode.REPEAT: return "repeat";
    case AddressMode.MIRROR: return "mirror-repeat";
    default: return "clamp-to-edge";
  }
}

function gpuTopology(topo) {
  switch (topo) {
    case PrimitiveTopology.TRIANGLE_STRIP: return "triangle-strip";
    case PrimitiveTopology.LINES:          return "line-list";
    case PrimitiveTopology.LINE_STRIP:     return "line-strip";
    case PrimitiveTopology.POINTS:         return "point-list";
    default: return "triangle-list";
  }
}

function gpuBufferUsage(usages) {
  const arr = Array.isArray(usages) ? usages : [usages];
  let bits = GPUBufferUsage.COPY_DST; // always allow writes
  for (const u of arr) {
    switch (u) {
      case "vertex":   bits |= GPUBufferUsage.VERTEX; break;
      case "index":    bits |= GPUBufferUsage.INDEX; break;
      case "uniform":  bits |= GPUBufferUsage.UNIFORM; break;
      case "storage":  bits |= GPUBufferUsage.STORAGE; break;
      case "copy-src": bits |= GPUBufferUsage.COPY_SRC; break;
      case "copy-dst": break; // already set
    }
  }
  return bits;
}

let _nextId = 1;
function nextId() { return _nextId++; }

// ─── WebGPUBackend ────────────────────────────────────────

export class WebGPUBackend extends RendererInterface {
  constructor() {
    super();
    this.backendType = BackendType.WEBGPU;
    /** @type {GPUDevice} */
    this.device = null;
    /** @type {GPUCanvasContext} */
    this.context = null;
    /** @type {GPUAdapter} */
    this._adapter = null;
    this._presentationFormat = null;
    this._depthTexture = null;
  }

  async init(canvas, options = {}) {
    this.canvas = canvas;

    if (!navigator.gpu) {
      throw new Error("WebGPU not supported in this browser");
    }

    this._adapter = await navigator.gpu.requestAdapter({
      powerPreference: options.powerPreference || "high-performance",
    });
    if (!this._adapter) {
      throw new Error("No WebGPU adapter found");
    }

    // Request device with error handling
    this.device = await this._adapter.requestDevice({
      requiredFeatures: this._getSupportedFeatures(),
    });

    // Listen for uncaptured errors → push to validation error buffer
    this.device.addEventListener("uncapturederror", (event) => {
      this.pushValidationError(
        event.error instanceof GPUValidationError ? "validation" : "device",
        event.error.message
      );
    });

    // Handle device loss
    this.device.lost.then((info) => {
      this.pushValidationError("device-lost", `Device lost (${info.reason}): ${info.message}`);
      this.ready = false;
    });

    // Configure canvas context
    this.context = canvas.getContext("webgpu");
    this._presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this._presentationFormat,
      alphaMode: options.alpha ? "premultiplied" : "opaque",
    });

    this.ready = true;
    return this;
  }

  dispose() {
    if (this._depthTexture) {
      this._depthTexture.destroy();
      this._depthTexture = null;
    }
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this._adapter = null;
    this.ready = false;
  }

  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    this.canvas.width = width;
    this.canvas.height = height;

    // Recreate depth texture on resize
    if (this._depthTexture) {
      this._depthTexture.destroy();
    }
    this._depthTexture = this.device.createTexture({
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  getNativeContext() { return this.device; }

  getCapabilities() {
    const limits = this.device.limits;
    return {
      backend: BackendType.WEBGPU,
      maxTextureSize: limits.maxTextureDimension2D,
      maxColorAttachments: limits.maxColorAttachments,
      floatTextures: true,
      floatLinearFilter: true,
      compute: true,
      storageBuffers: true,
      maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: limits.maxComputeWorkgroupSizeY,
      maxStorageBufferSize: limits.maxStorageBufferBindingSize,
    };
  }

  // ─── Buffer ────────────────────────────────────────────

  createBuffer(desc) {
    const { usage, size, data, label } = desc;
    const byteSize = data ? data.byteLength : size;
    // Ensure size is aligned to 4 bytes
    const alignedSize = Math.ceil(byteSize / 4) * 4;

    const buffer = this.device.createBuffer({
      size: alignedSize,
      usage: gpuBufferUsage(usage),
      label,
      mappedAtCreation: !!data,
    });

    if (data) {
      const mapped = new Uint8Array(buffer.getMappedRange());
      mapped.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      buffer.unmap();
    }

    return { _id: nextId(), _native: buffer, _size: alignedSize, label };
  }

  writeBuffer(handle, data, offset = 0) {
    this.device.queue.writeBuffer(handle._native, offset, data);
  }

  destroyBuffer(handle) {
    handle._native.destroy();
    handle._native = null;
  }

  // ─── Texture ───────────────────────────────────────────

  createTexture(desc) {
    const { width, height, format = TextureFormat.RGBA8, usage = [], label } = desc;
    let usageBits = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
    if (usage.includes("render-attachment")) usageBits |= GPUTextureUsage.RENDER_ATTACHMENT;
    if (usage.includes("storage")) usageBits |= GPUTextureUsage.STORAGE_BINDING;

    const texture = this.device.createTexture({
      size: [width, height],
      format: gpuTextureFormat(format),
      usage: usageBits,
      label,
    });

    return { _id: nextId(), _native: texture, width, height, format, label };
  }

  writeTexture(handle, source, options = {}) {
    if (source instanceof Uint8Array || source instanceof Float32Array) {
      const bytesPerPixel = source instanceof Float32Array ? 16 : 4;
      this.device.queue.writeTexture(
        { texture: handle._native },
        source,
        { bytesPerRow: handle.width * bytesPerPixel, rowsPerImage: handle.height },
        [handle.width, handle.height],
      );
    } else {
      // ImageBitmap — use copyExternalImageToTexture
      // Convert to ImageBitmap first if needed
      if (source instanceof ImageBitmap) {
        this.device.queue.copyExternalImageToTexture(
          { source, flipY: options.flipY ?? false },
          { texture: handle._native },
          [handle.width, handle.height],
        );
      } else {
        // For HTMLImageElement, HTMLVideoElement, etc. → createImageBitmap first
        createImageBitmap(source).then((bitmap) => {
          this.device.queue.copyExternalImageToTexture(
            { source: bitmap, flipY: options.flipY ?? false },
            { texture: handle._native },
            [handle.width, handle.height],
          );
        });
      }
    }
  }

  destroyTexture(handle) {
    handle._native.destroy();
    handle._native = null;
  }

  // ─── Sampler ───────────────────────────────────────────

  createSampler(desc = {}) {
    const {
      minFilter = FilterMode.LINEAR,
      magFilter = FilterMode.LINEAR,
      addressModeU = AddressMode.CLAMP,
      addressModeV = AddressMode.CLAMP,
      label,
    } = desc;

    const sampler = this.device.createSampler({
      minFilter: gpuFilterMode(minFilter),
      magFilter: gpuFilterMode(magFilter),
      addressModeU: gpuAddressMode(addressModeU),
      addressModeV: gpuAddressMode(addressModeV),
      label,
    });

    return { _id: nextId(), _native: sampler, label };
  }

  destroySampler(handle) {
    // GPUSampler doesn't have a destroy method — just drop the reference
    handle._native = null;
  }

  // ─── Shader Module ─────────────────────────────────────

  createShaderModule(desc) {
    const { code, label } = desc;
    const module = this.device.createShaderModule({ code, label });

    // Check compilation info for errors — store promise for pipeline error enrichment
    const compilationPromise = module.getCompilationInfo().then((info) => {
      const errors = [];
      for (const msg of info.messages) {
        if (msg.type === "error") {
          const errMsg = `[${label || "shader"}] L${msg.lineNum}:${msg.linePos || 0}: ${msg.message}`;
          errors.push(errMsg);
          this.pushValidationError("shader", errMsg);
        }
      }
      return errors;
    });

    return { _id: nextId(), _native: module, code, label, _backend: BackendType.WEBGPU, _compilationPromise: compilationPromise };
  }

  destroyShaderModule(handle) {
    handle._native = null;
    handle.code = null;
  }

  // ─── Pipeline ──────────────────────────────────────────

  createRenderPipeline(desc) {
    const { vertex, fragment, primitive = {}, depthStencil, label } = desc;

    const vertexDesc = {
      module: vertex.module._native,
      entryPoint: vertex.entryPoint || "vs_main",
      buffers: (vertex.buffers || []).map((b) => ({
        arrayStride: b.arrayStride,
        stepMode: b.stepMode || "vertex",
        attributes: (b.attributes || []).map((a) => ({
          shaderLocation: a.shaderLocation,
          offset: a.offset || 0,
          format: a.format || "float32x2",
        })),
      })),
    };
    if (vertex.constants) vertexDesc.constants = vertex.constants;

    const fragmentDesc = {
      module: fragment.module._native,
      entryPoint: fragment.entryPoint || "fs_main",
      targets: (fragment.targets || [{ format: this._presentationFormat }]).map((t) => {
        const target = { format: t.format || this._presentationFormat };
        if (t.blend) target.blend = t.blend;
        if (t.writeMask !== undefined) target.writeMask = t.writeMask;
        return target;
      }),
    };
    if (fragment.constants) fragmentDesc.constants = fragment.constants;

    let gpuLayout = "auto";
    if (desc.layout && desc.layout !== "explicit") {
      gpuLayout = desc.layout._native || desc.layout;
    } else if (desc.layout === "explicit") {
      gpuLayout = undefined;
    }

    const pipelineDesc = {
      label,
      layout: gpuLayout,
      vertex: vertexDesc,
      fragment: fragmentDesc,
      primitive: {
        topology: gpuTopology(primitive.topology),
        ...(primitive.cullMode && { cullMode: primitive.cullMode }),
        ...(primitive.frontFace && { frontFace: primitive.frontFace }),
      },
    };

    if (depthStencil) {
      pipelineDesc.depthStencil = {
        format: "depth24plus",
        depthWriteEnabled: depthStencil.depthWriteEnabled ?? true,
        depthCompare: depthStencil.depthCompare || "less-equal",
      };
    }

    try {
      const pipeline = this.device.createRenderPipeline(pipelineDesc);
      return { _id: nextId(), _native: pipeline, label };
    } catch (err) {
      // Enrich error with shader compilation info if available
      const modules = [vertex.module, fragment.module];
      for (const mod of modules) {
        if (mod?._compilationPromise) {
          mod._compilationPromise.then((errors) => {
            if (errors.length > 0) {
              this.pushValidationError("pipeline", `createRenderPipeline "${label || ""}" — shader errors:\n${errors.join("\n")}`);
            }
          });
        }
      }
      throw new Error(`createRenderPipeline "${label || ""}" failed: ${err.message}`);
    }
  }

  createComputePipeline(desc) {
    const { module, entryPoint = "main", constants, label } = desc;
    const computeDesc = {
      module: module._native,
      entryPoint,
    };
    if (constants) computeDesc.constants = constants;

    // Determine pipeline layout:
    // - desc.layout is a handle from createPipelineLayout → use its _native
    // - desc.layout === "explicit" → undefined (legacy, unused)
    // - otherwise → "auto"
    let gpuLayout = "auto";
    if (desc.layout && desc.layout !== "explicit") {
      gpuLayout = desc.layout._native || desc.layout;
    } else if (desc.layout === "explicit") {
      gpuLayout = undefined;
    }

    try {
      const pipeline = this.device.createComputePipeline({
        label,
        layout: gpuLayout,
        compute: computeDesc,
      });
      return { _id: nextId(), _native: pipeline, label };
    } catch (err) {
      // Enrich error with shader compilation info if available
      if (module._compilationPromise) {
        module._compilationPromise.then((errors) => {
          if (errors.length > 0) {
            this.pushValidationError("pipeline", `createComputePipeline "${label || ""}" failed — shader errors:\n${errors.join("\n")}`);
          }
        });
      }
      throw new Error(`createComputePipeline "${label || ""}" failed: ${err.message}`);
    }
  }

  destroyPipeline(handle) {
    // GPURenderPipeline / GPUComputePipeline don't have destroy — drop ref
    handle._native = null;
  }

  // ─── Bind Group Layout / Pipeline Layout ────────────────

  createBindGroupLayout(desc) {
    const { entries, label } = desc;
    const nativeLayout = this.device.createBindGroupLayout({ entries, label });
    return { _id: nextId(), _native: nativeLayout, label };
  }

  createPipelineLayout(desc) {
    const { bindGroupLayouts, label } = desc;
    const nativeLayout = this.device.createPipelineLayout({
      bindGroupLayouts: bindGroupLayouts.map((l) => l._native || l),
      label,
    });
    return { _id: nextId(), _native: nativeLayout, label };
  }

  // ─── Bind Group ────────────────────────────────────────

  createBindGroup(desc) {
    const { layout, pipeline, groupIndex = 0, entries, label } = desc;

    // Determine layout: explicit layout, or auto-derive from pipeline
    let bindGroupLayout;
    if (layout) {
      bindGroupLayout = layout._native || layout;
    } else if (pipeline) {
      bindGroupLayout = pipeline._native.getBindGroupLayout(groupIndex);
    } else {
      throw new Error("createBindGroup requires either 'layout' or 'pipeline' to derive bind group layout");
    }

    const gpuEntries = entries.map((e) => {
      const entry = { binding: e.binding };
      const r = e.resource;

      if (r.type === "uniform-buffer" || r.type === "storage-buffer" || r.type === "read-only-storage-buffer") {
        entry.resource = {
          buffer: r.buffer._native || r.buffer,
          offset: r.offset || 0,
          size: r.size || r.buffer._size,
        };
      } else if (r.type === "texture") {
        entry.resource = r.texture._native.createView();
      } else if (r.type === "sampler") {
        entry.resource = r.sampler._native;
      } else if (r.type === "storage-texture") {
        entry.resource = r.texture._native.createView();
      }

      return entry;
    });

    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: gpuEntries,
      label,
    });

    return { _id: nextId(), _native: bindGroup, label };
  }

  destroyBindGroup(handle) {
    handle._native = null;
  }

  // ─── Render Target ─────────────────────────────────────

  createRenderTarget(desc) {
    const { width, height, format = TextureFormat.RGBA8, depth = false, label } = desc;

    const texHandle = this.createTexture({
      width, height, format,
      usage: ["render-attachment"],
      label: label ? `${label}.color` : undefined,
    });

    let depthTex = null;
    if (depth) {
      depthTex = this.device.createTexture({
        size: [width, height],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        label: label ? `${label}.depth` : undefined,
      });
    }

    return { _id: nextId(), texture: texHandle, _depthTex: depthTex, width, height, label };
  }

  destroyRenderTarget(handle) {
    if (handle.texture?._native) handle.texture._native.destroy();
    if (handle._depthTex) handle._depthTex.destroy();
    handle.texture = null;
    handle._depthTex = null;
  }

  // ─── Command Encoder / Passes ──────────────────────────

  beginFrame() {
    const encoder = this.device.createCommandEncoder();
    return { _native: encoder, _backend: BackendType.WEBGPU };
  }

  endFrame(encoder) {
    this.device.queue.submit([encoder._native.finish()]);
  }

  beginRenderPass(encoder, desc) {
    const { colorAttachments = [], depthAttachment, label } = desc;

    const gpuColorAttachments = colorAttachments.map((ca) => {
      let view;
      if (ca.target && ca.target.texture?._native) {
        view = ca.target.texture._native.createView();
      } else {
        // Default framebuffer — current swap chain texture
        view = this.context.getCurrentTexture().createView();
      }
      const c = ca.clearColor || [0, 0, 0, 1];
      return {
        view,
        clearValue: { r: c[0], g: c[1], b: c[2], a: c[3] ?? 1 },
        loadOp: ca.clearColor ? "clear" : "load",
        storeOp: "store",
      };
    });

    // If no color attachments specified, default to screen
    if (gpuColorAttachments.length === 0) {
      gpuColorAttachments.push({
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      });
    }

    const passDesc = { colorAttachments: gpuColorAttachments, label };

    if (depthAttachment || colorAttachments[0]?.target?._depthTex) {
      const depthTex = colorAttachments[0]?.target?._depthTex || this._depthTexture;
      if (depthTex) {
        passDesc.depthStencilAttachment = {
          view: depthTex.createView(),
          depthClearValue: depthAttachment?.clearDepth ?? 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        };
      }
    }

    const pass = encoder._native.beginRenderPass(passDesc);
    return { _native: pass, _backend: BackendType.WEBGPU, label };
  }

  endRenderPass(pass) {
    pass._native.end();
  }

  beginComputePass(encoder, desc = {}) {
    const pass = encoder._native.beginComputePass({ label: desc.label });
    return { _native: pass, _backend: BackendType.WEBGPU, label: desc.label };
  }

  endComputePass(pass) {
    pass._native.end();
  }

  // ─── Draw Commands ─────────────────────────────────────

  setPipeline(pass, pipeline) {
    pass._native.setPipeline(pipeline._native);
    pass._pipeline = pipeline;
  }

  setBindGroup(pass, index, bindGroup) {
    pass._native.setBindGroup(index, bindGroup._native);
  }

  setVertexBuffer(pass, slot, buffer) {
    pass._native.setVertexBuffer(slot, buffer._native);
  }

  setIndexBuffer(pass, buffer, format = "uint16") {
    pass._native.setIndexBuffer(buffer._native, format);
  }

  draw(pass, vertexCount, instanceCount = 1, firstVertex = 0, firstInstance = 0) {
    pass._native.draw(vertexCount, instanceCount, firstVertex, firstInstance);
  }

  drawIndexed(pass, indexCount, instanceCount = 1, firstIndex = 0, baseVertex = 0, firstInstance = 0) {
    pass._native.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
  }

  // ─── Compute Commands ──────────────────────────────────

  setComputePipeline(pass, pipeline) {
    pass._native.setPipeline(pipeline._native);
  }

  dispatch(pass, x, y = 1, z = 1) {
    pass._native.dispatchWorkgroups(x, y, z);
  }

  // ─── Readback ──────────────────────────────────────────

  async readPixels(target, x, y, width, height) {
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256; // Must be 256-byte aligned
    const bufferSize = bytesPerRow * height;

    const readBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = this.device.createCommandEncoder();
    const srcTexture = target ? target.texture._native : this.context.getCurrentTexture();

    encoder.copyTextureToBuffer(
      { texture: srcTexture, origin: [x, y, 0] },
      { buffer: readBuffer, bytesPerRow, rowsPerImage: height },
      [width, height],
    );

    this.device.queue.submit([encoder.finish()]);
    await readBuffer.mapAsync(GPUMapMode.READ);

    const mapped = new Uint8Array(readBuffer.getMappedRange());
    // Copy out with row alignment correction
    const pixels = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      pixels.set(
        mapped.subarray(row * bytesPerRow, row * bytesPerRow + width * 4),
        row * width * 4,
      );
    }

    readBuffer.unmap();
    readBuffer.destroy();
    return pixels;
  }

  /**
   * Read a GPU storage/vertex buffer back to CPU.
   * The source buffer MUST have been created with usage including "copy-src".
   * @param {object} bufferHandle — handle from createBuffer()
   * @param {Function} [TypedArrayClass=Float32Array] — constructor for the result
   * @param {number} [byteOffset=0] — byte offset into the source buffer
   * @param {number} [byteLength] — bytes to read (default: entire buffer)
   * @returns {Promise<TypedArray>} — a copy of the buffer data
   */
  async readStorageBuffer(bufferHandle, TypedArrayClass = Float32Array, byteOffset = 0, byteLength) {
    const srcBuffer = bufferHandle._native || bufferHandle;
    const size = byteLength ?? (srcBuffer.size - byteOffset);

    const readBuffer = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(srcBuffer, byteOffset, readBuffer, 0, size);
    this.device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new TypedArrayClass(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    readBuffer.destroy();
    return mapped;
  }

  // ─── Internal ──────────────────────────────────────────

  _getSupportedFeatures() {
    const wanted = ["float32-filterable"];
    return wanted.filter((f) => this._adapter.features.has(f));
  }
}
