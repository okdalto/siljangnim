// The ctx WebGPU scenes (backend "webgpu") receive. Scripts use the WebGPU
// API directly; these helpers only cover what every scene needs. Keep in
// sync with the WebGPU part of agent/prompt.ts.
import { ShaderError } from "../gl/shader";
import { FULLSCREEN_VERTEX_WGSL, packUniforms, uniformLayout, wgslDiagnostics, type UniformLayout } from "../gpu/wgsl";
import type { MonitorValue } from "../protocol";
import type { Scene, UniformValue } from "../schema";
import { importModule, type SceneAudioUtils } from "./ctx";
import { emptyAudio, emptyMidi, emptyOsc, type AudioState, type MidiState, type OscState } from "./inputData";
import type { SceneInputs } from "./inputs";

// WebGPU usage flags (the TypeScript DOM lib types the API but not these constants).
const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;
const TEXTURE_COPY_DST = 0x02;
const TEXTURE_BINDING = 0x04;
const TEXTURE_RENDER_ATTACHMENT = 0x10;

export interface GpuUniforms {
  buffer: GPUBuffer;
  /** `struct Uniforms { time, dt, frame, resolution, mouse, <scene uniforms> }` for your WGSL. */
  wgsl: string;
  layout: UniformLayout;
  /** Write the current values; call once per frame before submitting. */
  update(): void;
}

export interface GpuSceneCtx {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  state: Record<string, unknown>;
  time: number;
  dt: number;
  frame: number;
  resolution: [number, number];
  mouse: [number, number, number, number];
  mousePrev: [number, number, number, number];
  mouseDown: boolean;
  keys: Set<string>;
  uniforms: Record<string, UniformValue>;
  assets: Record<string, string>;
  audio: AudioState;
  midi: MidiState;
  osc: OscState;
  publish(name: string, value: MonitorValue): void;
  utils: {
    audio: SceneAudioUtils;
    enableMidi(): Promise<void>;
    listenOsc(port?: number): void;
    /** The webcam as a playing <video>; use device.importExternalTexture({ source }) each frame. */
    cameraVideo(options?: { width?: number; height?: number; facingMode?: string }): Promise<HTMLVideoElement>;
    FULLSCREEN_VERTEX_WGSL: string;
    /** Compiles WGSL and throws with line numbers and an excerpt on errors. */
    createShaderModule(code: string, label?: string): Promise<GPUShaderModule>;
    /** A uniform buffer holding the standard values and every scene uniform (usage UNIFORM | COPY_DST). */
    createUniforms(): GpuUniforms;
    loadTexture(nameOrUrl: string, options?: { flipY?: boolean }): Promise<{ texture: GPUTexture; width: number; height: number }>;
    import(url: string): Promise<unknown>;
  };
}

export function createGpuCtx(
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  canvas: HTMLCanvasElement,
  scene: Scene,
  uniforms: Record<string, UniformValue>,
  assets: Record<string, string>,
  publish: GpuSceneCtx["publish"],
  inputs?: SceneInputs,
): GpuSceneCtx {
  const ctx: GpuSceneCtx = {
    device,
    context,
    format,
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
    audio: inputs?.audio ?? emptyAudio(),
    midi: inputs?.midi ?? emptyMidi(),
    osc: inputs?.osc ?? emptyOsc(),
    publish,
    utils: undefined as unknown as GpuSceneCtx["utils"],
  };

  ctx.utils = {
    audio: {
      useMicrophone: () => (inputs ? inputs.microphone() : Promise.reject(new Error("audio input is not available here"))),
      play: (nameOrUrl, options) => (inputs ? inputs.play(ctx.assets[nameOrUrl] ?? nameOrUrl, options) : Promise.reject(new Error("audio is not available here"))),
      stop: () => inputs?.stopAudio(),
    },
    enableMidi: () => (inputs ? inputs.enableMidi() : Promise.reject(new Error("MIDI is not available here"))),
    listenOsc: (port) => inputs?.listenOsc(port),
    async cameraVideo(options = {}) {
      if (!inputs) throw new Error("camera input is not available here");
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = await inputs.camera(options);
      await video.play();
      return video;
    },
    FULLSCREEN_VERTEX_WGSL,
    async createShaderModule(code, label) {
      // Own scope: the compile error is reported once, as a ShaderError with line numbers,
      // not again as an uncaptured device error.
      device.pushErrorScope("validation");
      const module = device.createShaderModule({ code, label });
      const info = await module.getCompilationInfo();
      await device.popErrorScope();
      const diagnostics = wgslDiagnostics(info.messages);
      if (diagnostics.length) throw new ShaderError("wgsl", "", code, diagnostics);
      return module;
    },
    createUniforms() {
      const layout = uniformLayout(scene.uniforms);
      const buffer = device.createBuffer({ size: layout.size, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
      const data = new Float32Array(layout.size / 4);
      return {
        buffer,
        wgsl: layout.wgsl,
        layout,
        update() {
          const [w, h] = ctx.resolution;
          // Same convention as WebGL's u_mouse: pixels, origin bottom-left, zw negative when not pressed.
          const [mx, my, cx, cy] = ctx.mouse;
          const mouse = [mx * w, (1 - my) * h, ctx.mouseDown ? cx * w : -cx * w, ctx.mouseDown ? (1 - cy) * h : -(1 - cy) * h];
          const audio = [ctx.audio.level, ctx.audio.bass, ctx.audio.mid, ctx.audio.treble];
          packUniforms(layout, { ...ctx.uniforms, time: ctx.time, dt: ctx.dt, frame: ctx.frame, resolution: [w, h], mouse, audio }, data);
          device.queue.writeBuffer(buffer, 0, data);
        },
      };
    },
    async loadTexture(nameOrUrl, options = {}) {
      const response = await fetch(ctx.assets[nameOrUrl] ?? nameOrUrl);
      if (!response.ok) throw new Error(`loadTexture: ${response.status} for ${nameOrUrl}`);
      const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: options.flipY ? "flipY" : "none" });
      const texture = device.createTexture({
        size: [bitmap.width, bitmap.height],
        format: "rgba8unorm",
        usage: TEXTURE_BINDING | TEXTURE_COPY_DST | TEXTURE_RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
      const result = { texture, width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    },
    import: importModule,
  };
  return ctx;
}
