/**
 * gpu/ — Renderer abstraction layer for WebGL2 / WebGPU.
 *
 * Public API re-exports.
 */

// Core interface & enums
export {
  RendererInterface,
  BackendType,
  TextureFormat,
  BufferUsage,
  ShaderStage,
  FilterMode,
  AddressMode,
  PrimitiveTopology,
} from "./RendererInterface.js";

// Backends
export { WebGLBackend } from "./WebGLBackend.js";
export { WebGPUBackend } from "./WebGPUBackend.js";

// Backend selection
export {
  selectBackend,
  detectCapabilities,
  getCapabilities,
  getBackendDisplayName,
} from "./backendSelector.js";

// Shader system
export {
  shaderSource,
  selectShader,
  QUAD_VERTEX,
  VERTEX_3D,
  SOLID_COLOR_FRAGMENT,
  UV_GRADIENT_FRAGMENT,
  TEXTURE_SAMPLE_FRAGMENT,
  wrapFragmentGLSL,
  wrapFragmentWGSL,
  dualFragment,
} from "./shaderTarget.js";

// Render graph
export { RenderGraph, createSimpleGraph } from "./renderGraph.js";
