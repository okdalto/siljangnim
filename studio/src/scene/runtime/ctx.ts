// The `ctx` object scene scripts receive. This interface is the contract
// with every saved scene and with the agent prompt (agent/prompt.ts) —
// change both together.
import * as geometries from "../gl/geometries.js";
import * as glslSnippets from "../gl/glslSnippets.js";
import * as mat4 from "../gl/mat4.js";
import * as noise from "../gl/noise.js";
import { createOrbitCamera } from "../gl/orbitCamera.js";
import { createPingPong } from "../gl/pingPong.js";
import * as quat from "../gl/quat.js";
import { uploadDataTexture } from "../gl/textureUtils.js";
import { createVerletSystem } from "../gl/verletPhysics.js";
import {
  bindTexture,
  createFullscreenQuad,
  createMesh,
  createVideoTexture,
  loadTexture,
  setUniforms,
  type Drawable,
  type GeometryData,
  type LoadedTexture,
  type TextureOptions,
  type VideoTexture,
  type VideoTextureOptions,
} from "../gl/helpers";
import { FULLSCREEN_VERTEX_SHADER, MESH_VERTEX_SHADER, createProgram } from "../gl/shader";
import type { MonitorValue } from "../protocol";
import type { UniformValue } from "../schema";

/** ES module CDNs scene scripts may import from (mirrored in the scene CSP). */
export const ALLOWED_IMPORT_ORIGINS = ["https://esm.sh", "https://cdn.jsdelivr.net", "https://unpkg.com"];

export interface SceneUtils {
  FULLSCREEN_VERTEX_SHADER: string;
  MESH_VERTEX_SHADER: string;
  createProgram(vertexSource: string, fragmentSource: string): WebGLProgram;
  /** useProgram + standard uniforms + optional extra uniforms + fullscreen triangle. */
  drawFullscreen(program: WebGLProgram, uniforms?: Record<string, number | boolean | ArrayLike<number>>): void;
  /** Sets u_time, u_resolution, u_mouse, u_frame, u_dt and every scene uniform. Program must be in use. */
  setStandardUniforms(program: WebGLProgram): void;
  setUniforms(program: WebGLProgram, values: Record<string, number | boolean | ArrayLike<number>>): void;
  bindTexture(program: WebGLProgram, name: string, texture: WebGLTexture | null, unit?: number): void;
  /** Load an image texture by asset name (see ctx.assets) or URL. */
  loadTexture(nameOrUrl: string, options?: TextureOptions): Promise<LoadedTexture>;
  /** Video texture by asset name or URL; call .update() every frame before drawing. */
  createVideoTexture(nameOrUrl: string, options?: VideoTextureOptions): Promise<VideoTexture>;
  createMesh(geometry: GeometryData): Drawable;
  geometry: {
    quad(): GeometryData;
    box(): GeometryData;
    sphere(segments?: number): GeometryData;
    plane(width?: number, height?: number, widthSegments?: number, heightSegments?: number): GeometryData;
  };
  createPingPong: (width: number, height: number, options?: Record<string, unknown>) => unknown;
  uploadDataTexture: typeof uploadDataTexture;
  mat4: typeof mat4;
  quat: typeof quat;
  createOrbitCamera: typeof createOrbitCamera;
  createVerletSystem: typeof createVerletSystem;
  glsl: Record<string, string>;
  /** Dynamic import of an ES module from an allowed CDN, e.g. "https://esm.sh/d3-delaunay@6". */
  import(url: string): Promise<unknown>;
}

export interface SceneCtx {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  /** Script-owned storage shared by setup, render and cleanup. */
  state: Record<string, unknown>;
  time: number;
  dt: number;
  frame: number;
  /** Drawing-buffer size in pixels. */
  resolution: [number, number];
  /** [x, y, clickX, clickY], normalized 0..1, origin top-left. */
  mouse: [number, number, number, number];
  /** ctx.mouse as it was on the previous frame. */
  mousePrev: [number, number, number, number];
  mouseDown: boolean;
  /** KeyboardEvent.code values currently held. */
  keys: Set<string>;
  uniforms: Record<string, UniformValue>;
  /** Asset name → object URL. */
  assets: Record<string, string>;
  /** Show a value in the app's monitor panel (FPS, particle count…). Cheap; call it every frame if you like. */
  publish(name: string, value: MonitorValue): void;
  utils: SceneUtils;
}

/** Dynamic import of an ES module, from the allowed CDNs only. */
export function importModule(url: string): Promise<unknown> {
  const origin = new URL(url).origin;
  if (!ALLOWED_IMPORT_ORIGINS.includes(origin)) {
    return Promise.reject(new Error(`ctx.utils.import: ${origin} is not allowed; use ${ALLOWED_IMPORT_ORIGINS.join(", ")}`));
  }
  return import(/* @vite-ignore */ url);
}

export function createCtx(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  uniforms: Record<string, UniformValue>,
  assets: Record<string, string>,
  publish: SceneCtx["publish"] = () => undefined,
): { ctx: SceneCtx; dispose(): void } {
  const quad = createFullscreenQuad(gl);
  const videos: VideoTexture[] = [];
  const glsl: Record<string, string> = {};
  for (const [name, source] of Object.entries({ ...noise, ...glslSnippets })) {
    if (typeof source === "string") glsl[name] = source;
  }

  const ctx: SceneCtx = {
    gl,
    canvas,
    state: {},
    time: 0,
    dt: 0,
    frame: 0,
    resolution: [canvas.width, canvas.height],
    mouse: [0.5, 0.5, 0.5, 0.5],
    mousePrev: [0.5, 0.5, 0.5, 0.5],
    mouseDown: false,
    keys: new Set(),
    uniforms,
    assets,
    publish,
    utils: undefined as unknown as SceneUtils,
  };

  const standard = (program: WebGLProgram) => {
    const [w, h] = ctx.resolution;
    // u_mouse follows the Shadertoy convention: pixels, origin bottom-left.
    const [mx, my, cx, cy] = ctx.mouse;
    setUniforms(gl, program, {
      u_time: ctx.time,
      u_dt: ctx.dt,
      u_frame: ctx.frame,
      u_resolution: [w, h],
      u_mouse: [mx * w, (1 - my) * h, ctx.mouseDown ? cx * w : -cx * w, ctx.mouseDown ? (1 - cy) * h : -(1 - cy) * h],
      ...(ctx.uniforms as Record<string, number | boolean | number[]>),
    });
  };

  ctx.utils = {
    FULLSCREEN_VERTEX_SHADER,
    MESH_VERTEX_SHADER,
    createProgram: (vs, fs) => createProgram(gl, vs, fs),
    drawFullscreen(program, extra) {
      gl.useProgram(program);
      standard(program);
      if (extra) setUniforms(gl, program, extra);
      quad.draw();
    },
    setStandardUniforms: standard,
    setUniforms: (program, values) => setUniforms(gl, program, values),
    bindTexture: (program, name, texture, unit) => bindTexture(gl, program, name, texture, unit),
    loadTexture: (nameOrUrl, options) => loadTexture(gl, ctx.assets[nameOrUrl] ?? nameOrUrl, options),
    async createVideoTexture(nameOrUrl, options) {
      const video = await createVideoTexture(gl, ctx.assets[nameOrUrl] ?? nameOrUrl, options);
      videos.push(video);
      return video;
    },
    createMesh: (geometry) => createMesh(gl, geometry),
    geometry: {
      quad: geometries.createQuadGeometry,
      box: geometries.createBoxGeometry,
      sphere: geometries.createSphereGeometry,
      plane: geometries.createPlaneGeometry,
    },
    createPingPong: (width, height, options) => createPingPong(gl, width, height, options),
    uploadDataTexture,
    mat4,
    quat,
    createOrbitCamera,
    createVerletSystem,
    glsl,
    import: importModule,
  };

  return {
    ctx,
    dispose: () => {
      quad.dispose();
      // Videos keep decoding (and playing sound) until stopped.
      for (const video of videos.splice(0)) video.dispose();
    },
  };
}
