// Runs one scene at a time inside the runtime iframe.
//
// Every load gets a fresh canvas and WebGL context (or WebGPU device): no
// GPU state or leaked resources carry over between scenes, so there is
// nothing to track or reset by hand.
import { evaluateTracks, sortKeys, type Keyframe } from "../gl/keyframes";
import { ShaderError } from "../gl/shader";
import type { CaptureResult, LoadResult, MonitorValue, RecordOptions, RecordResult, RuntimeState, RuntimeStatus, SceneError, SceneErrorSource } from "../protocol";
import { recordOffline, recordRealtime } from "./recorder";
import { uniformValues, type Scene, type Timeline, type UniformValue } from "../schema";
import { createCtx, type SceneCtx } from "./ctx";
import { createGpuCtx, type GpuSceneCtx } from "./gpuCtx";
import { SceneInputs } from "./inputs";
import type { OscMessage } from "./inputData";

/** What scripts receive, either backend. The runner only touches the shared fields. */
type AnyCtx = SceneCtx | GpuSceneCtx;

/** What differs between WebGL2 and WebGPU around a scene's scripts. */
interface Surface {
  /** Before each render call. */
  beforeRender(canvas: HTMLCanvasElement, check: boolean): void;
  /** After each render call; `check` frames look for GPU errors. */
  afterRender(check: boolean, report: (err: Error) => void): void;
  /** Wraps setup; WebGPU turns validation errors raised during it into a setup failure. */
  setup(run: Promise<void>): Promise<void>;
  dispose(): void;
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (ctx: SceneCtx) => Promise<void>;

const SETUP_TIMEOUT_MS = 20_000;
const FRAMES_BEFORE_LOADED = 3;
const MAX_ERRORS = 20;
const MAX_PIXEL_RATIO = 2;
const GL_ERROR_CHECK_EVERY = 60;
const MAX_MONITORS = 32;
const MAX_MONITOR_TEXT = 200;

// new Function() puts the body two lines below the header in V8.
const FUNCTION_HEADER_LINES = 2;

type Emit = (event: "error" | "stats" | "monitors" | "recording" | "oscListen", data: unknown) => void;

interface Loaded {
  generation: number;
  canvas: HTMLCanvasElement;
  surface: Surface;
  ctx: AnyCtx;
  render: (ctx: AnyCtx) => unknown;
  cleanup: (ctx: AnyCtx) => unknown;
  disposeCtx: () => void;
  /** Per-frame work of the ctx (e.g. the audio texture upload). */
  beforeFrame: () => void;
  inputs: SceneInputs;
  assetUrls: string[];
}

interface PendingCapture {
  maxSize: number;
  resolve: (result: CaptureResult) => void;
  reject: (err: Error) => void;
}

export class SceneRunner {
  private readonly container: HTMLElement;
  private readonly emit: Emit;
  private current: Loaded | null = null;
  private generation = 0;
  private state: RuntimeState = "idle";
  private playing = true;
  private dirty = true;
  private time = 0;
  private frame = 0;
  private fps = 0;
  private lastTick = 0;
  private lastStats = 0;
  private errors: SceneError[] = [];
  private framesRendered = 0;
  private frameWaiters: Array<() => void> = [];
  private captures: PendingCapture[] = [];
  private readonly mouse: [number, number, number, number] = [0.5, 0.5, 0.5, 0.5];
  private mouseDown = false;
  private readonly keys = new Set<string>();
  /** What the current scene was loaded from, for restarting on loop. */
  private source: { scene: Scene; assets: Record<string, Blob> } | null = null;
  private timeline: Timeline | undefined;
  private tracks: Record<string, Keyframe[]> = {};
  /** Keyed uniforms the person set directly; they win over keyframes until the keys change. */
  private readonly overrides = new Set<string>();
  private restarting = false;
  private monitors: Record<string, MonitorValue> = {};
  private monitorsChanged = false;
  /** Button uniforms pressed since the last frame; they read true for one rendered frame. */
  private readonly pulses = new Set<string>();
  private recording = false;
  private recordAbort: AbortController | null = null;
  /** Output size while recording; the canvas ignores the container until it's cleared. */
  private fixedSize: { width: number; height: number } | null = null;

  constructor(container: HTMLElement, emit: Emit) {
    this.container = container;
    this.emit = emit;
    new ResizeObserver(() => this.resize()).observe(container);
    this.bindInput();
    requestAnimationFrame((t) => this.tick(t));
  }

  // --- public API (called through RPC) ---

  async load(scene: Scene, assets: Record<string, Blob>): Promise<LoadResult> {
    const generation = ++this.generation;
    this.unload();
    this.source = { scene, assets };
    this.applyTimeline(scene.timeline, scene.keyframes);
    this.monitors = {};
    this.monitorsChanged = true;
    this.pulses.clear();
    this.errors = [];
    this.state = "loading";
    this.time = 0;
    this.frame = 0;
    this.framesRendered = 0;

    const canvas = document.createElement("canvas");
    this.container.replaceChildren(canvas);
    this.sizeCanvas(canvas);

    const assetUrls: string[] = [];
    const assetMap: Record<string, string> = {};
    for (const [name, blob] of Object.entries(assets)) {
      const url = URL.createObjectURL(blob);
      assetUrls.push(url);
      assetMap[name] = url;
    }
    const revokeAssets = () => assetUrls.forEach((url) => URL.revokeObjectURL(url));
    const publish = (name: string, value: Parameters<SceneCtx["publish"]>[1]) => this.publish(name, value);

    const inputs = new SceneInputs((port) => generation === this.generation && this.emit("oscListen", { port }));
    let made: { ctx: AnyCtx; dispose: () => void; surface: Surface; beforeFrame?: () => void } | null;
    try {
      made =
        scene.backend === "webgpu"
          ? await this.makeWebGpu(canvas, scene, assetMap, publish, generation, inputs)
          : this.makeWebGl(canvas, scene, assetMap, publish, inputs);
    } catch (err) {
      inputs.dispose();
      revokeAssets();
      if (generation === this.generation) this.fail(scene.backend === "webgpu" ? "webgpu" : "webgl", err);
      return generation === this.generation ? this.loadResult() : { ok: false, errors: [] };
    }
    if (!made) {
      inputs.dispose();
      revokeAssets();
      return { ok: false, errors: [] };
    }
    const { ctx, dispose, surface } = made;
    const beforeFrame = made.beforeFrame ?? (() => undefined);
    ctx.mouse = this.mouse;
    ctx.keys = this.keys;

    let setup: (ctx: AnyCtx) => Promise<void>;
    let render: (ctx: AnyCtx) => unknown;
    let cleanup: (ctx: AnyCtx) => unknown;
    try {
      setup = this.compile("setup", () => new AsyncFunction("ctx", scene.script.setup) as (ctx: AnyCtx) => Promise<void>);
      render = this.compile("render", () => new Function("ctx", scene.script.render) as (ctx: AnyCtx) => unknown);
      cleanup = this.compile("cleanup", () => new Function("ctx", scene.script.cleanup) as (ctx: AnyCtx) => unknown);
    } catch {
      dispose();
      inputs.dispose();
      revokeAssets();
      surface.dispose();
      return this.loadResult();
    }

    this.current = { generation, canvas, surface, ctx, render, cleanup, disposeCtx: dispose, beforeFrame, inputs, assetUrls };
    // Declared inputs start with the scene; a refusal is reported, not fatal.
    if (scene.inputs.includes("microphone")) inputs.microphone().catch((err: unknown) => this.record("runtime", new Error(`microphone: ${err instanceof Error ? err.message : err}`)));
    if (scene.inputs.includes("osc")) inputs.listenOsc();
    if (scene.inputs.includes("midi")) inputs.enableMidi().catch((err: unknown) => this.record("runtime", new Error(`MIDI: ${err instanceof Error ? err.message : err}`)));

    try {
      await withTimeout(surface.setup(setup(ctx)), SETUP_TIMEOUT_MS, "setup did not finish within 20s");
    } catch (err) {
      if (generation === this.generation) this.fail("setup", err);
      return this.loadResult();
    }
    if (generation !== this.generation) return { ok: false, errors: [] };

    this.state = this.playing ? "running" : "paused";
    this.dirty = true;
    await this.waitForFrames(FRAMES_BEFORE_LOADED);
    return this.loadResult();
  }

  setUniform(name: string, value: UniformValue): void {
    if (!this.current) return;
    this.current.ctx.uniforms[name] = value;
    if (this.tracks[name]) this.overrides.add(name);
    if (value === true && this.source?.scene.uniforms[name]?.widget === "button") this.pulses.add(name);
    this.dirty = true;
  }

  /** OSC from the hub, through the app. */
  osc(update: { active?: boolean; messages?: OscMessage[]; error?: string }): void {
    if (update.error) this.record("runtime", new Error(`OSC: ${update.error}`));
    this.current?.inputs.receiveOsc(update);
  }

  setTimeline(timeline: Timeline | undefined, keyframes: Record<string, Keyframe[]>): void {
    this.applyTimeline(timeline, keyframes);
    if (this.source) this.source = { ...this.source, scene: { ...this.source.scene, timeline, keyframes } };
    this.time = this.clampTime(this.time);
    this.dirty = true;
  }

  transport(action: "play" | "pause" | "seek", time?: number): void {
    if (action === "play") {
      // Playing a finished one-shot timeline starts it over.
      if (this.timeline && !this.timeline.loop && this.time >= this.timeline.duration) this.time = 0;
      this.playing = true;
    }
    if (action === "pause") this.playing = false;
    if (action === "seek" && time !== undefined) this.time = this.clampTime(time);
    if (this.state === "running" || this.state === "paused") this.state = this.playing ? "running" : "paused";
    this.dirty = true;
  }

  capture(maxSize: number): Promise<CaptureResult> {
    if (!this.current) return Promise.reject(new Error("no scene loaded"));
    this.dirty = true; // make sure a frame is drawn even when paused
    return new Promise((resolve, reject) => this.captures.push({ maxSize, resolve, reject }));
  }

  status(): RuntimeStatus {
    const canvas = this.current?.canvas;
    return {
      state: this.state,
      time: this.time,
      frame: this.frame,
      fps: Math.round(this.fps),
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      errors: [...this.errors],
      monitors: { ...this.monitors },
    };
  }

  /** Errors raised outside script phases (async callbacks, promise rejections). */
  reportUncaught(err: unknown): void {
    if (this.current) this.record("runtime", err);
  }

  // --- internals ---

  private publish(name: string, value: MonitorValue): void {
    if (typeof name !== "string" || !name) return;
    let v: MonitorValue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return;
      v = value;
    } else if (typeof value === "boolean") v = value;
    else v = String(value).slice(0, MAX_MONITOR_TEXT);
    if (!(name in this.monitors) && Object.keys(this.monitors).length >= MAX_MONITORS) return;
    if (this.monitors[name] === v) return;
    this.monitors[name] = v;
    this.monitorsChanged = true;
  }

  private applyTimeline(timeline: Timeline | undefined, keyframes: Record<string, Keyframe[]>): void {
    this.timeline = timeline;
    this.tracks = Object.fromEntries(Object.entries(keyframes).map(([name, keys]) => [name, sortKeys(keys)]));
    this.overrides.clear();
  }

  /** Keyframe values at the current time; int uniforms are rounded. */
  private keyedValues(): Record<string, number> {
    const values = evaluateTracks(this.tracks, this.time, this.overrides);
    const uniforms = this.source?.scene.uniforms ?? {};
    for (const name of Object.keys(values)) if (uniforms[name]?.type === "int") values[name] = Math.round(values[name]!);
    return values;
  }

  private clampTime(time: number): number {
    const t = Math.max(0, time);
    return this.timeline ? Math.min(t, this.timeline.duration) : t;
  }

  private restart(): void {
    if (this.restarting || !this.source) return;
    this.restarting = true;
    const { scene, assets } = this.source;
    void this.load(scene, assets).finally(() => {
      this.restarting = false;
    });
  }

  private compile<T>(source: SceneErrorSource, build: () => T): T {
    try {
      return build();
    } catch (err) {
      this.fail(source, err);
      throw err;
    }
  }

  private unload(): void {
    const old = this.current;
    this.current = null;
    for (const c of this.captures.splice(0)) c.reject(new Error("scene was replaced"));
    if (!old) return;
    try {
      old.cleanup(old.ctx);
    } catch (err) {
      // Report but don't let a broken cleanup block the next scene.
      this.record("cleanup", err);
    }
    old.disposeCtx();
    old.inputs.dispose();
    for (const url of old.assetUrls) URL.revokeObjectURL(url);
    old.surface.dispose();
    old.canvas.remove();
  }

  private tick(now: number): void {
    requestAnimationFrame((t) => this.tick(t));
    const dt = this.lastTick ? Math.min((now - this.lastTick) / 1000, 0.1) : 0;
    this.lastTick = now;
    if (dt > 0) this.fps = this.fps * 0.9 + (1 / dt) * 0.1;

    const loaded = this.current;
    // While recording offline, frames are rendered by the recorder at exact times instead.
    const active = loaded && !this.recording && (this.state === "running" || this.state === "paused");
    if (active && (this.playing || this.dirty)) {
      const frameDt = this.playing ? dt : 0;
      if (this.playing) {
        this.time += dt;
        if (this.timeline && this.time >= this.timeline.duration) {
          if (!this.timeline.loop) {
            this.time = this.timeline.duration;
            this.playing = false;
            this.state = "paused";
          } else if (this.timeline.preserveStateOnLoop) {
            this.time %= this.timeline.duration;
          } else {
            // Start the scene over so simulations line up with the keyframes again.
            this.restart();
            return;
          }
        }
      }
      try {
        this.renderFrame(loaded, frameDt);
        this.flushCaptures(loaded.canvas);
      } catch (err) {
        this.fail("render", err);
      }
      this.notifyFrame();
    } else if (this.captures.length && loaded) {
      // Errored scene: hand back whatever the canvas shows.
      this.flushCaptures(loaded.canvas);
    }

    // Often enough for a smooth playhead and animated controls.
    if (now - this.lastStats > 100) {
      this.lastStats = now;
      this.emit("stats", { state: this.state, time: this.time, fps: Math.round(this.fps) });
      if (this.monitorsChanged) {
        this.monitorsChanged = false;
        this.emit("monitors", { ...this.monitors });
      }
    }
  }

  /** Draw one frame at this.time. Throws what the scene's render throws. */
  private renderFrame(loaded: Loaded, dt: number): void {
    const ctx = loaded.ctx;
    loaded.inputs.update();
    loaded.beforeFrame();
    Object.assign(ctx.uniforms, this.keyedValues());
    ctx.time = this.time;
    ctx.dt = dt;
    ctx.frame = this.frame;
    ctx.mouseDown = this.mouseDown;
    ctx.resolution[0] = loaded.canvas.width;
    ctx.resolution[1] = loaded.canvas.height;
    const check = this.frame % GL_ERROR_CHECK_EVERY === 1;
    loaded.surface.beforeRender(loaded.canvas, check);
    const result = loaded.render(ctx);
    ctx.mousePrev.splice(0, 4, ...this.mouse);
    if (result instanceof Promise) {
      throw new Error("render must be synchronous; do async work (loading, imports) in setup");
    }
    this.frame++;
    this.dirty = false;
    for (const name of this.pulses) ctx.uniforms[name] = false;
    this.pulses.clear();
    loaded.surface.afterRender(check, (err) => this.record(err.message.startsWith("WebGPU") ? "webgpu" : "webgl", err));
    this.framesRendered++;
  }

  // --- recording ---

  async recordScene(options: RecordOptions): Promise<RecordResult> {
    if (!this.source) throw new Error("no scene loaded");
    if (this.recording) throw new Error("already recording");
    const abort = new AbortController();
    this.recordAbort = abort;
    const progress = (frame: number, total: number) => this.emit("recording", { frame, total });
    const wasPlaying = this.playing;
    try {
      if (options.mode === "realtime") {
        if (!this.current) throw new Error("no scene loaded");
        this.playing = true;
        return await recordRealtime(options, this.current.canvas, abort.signal, progress);
      }
      // Offline: start the scene over at the output size, then render frame by frame.
      if (options.width > 0 && options.height > 0) {
        // H.264 needs even dimensions.
        this.fixedSize = { width: options.width - (options.width % 2), height: options.height - (options.height % 2) };
      }
      const { scene, assets } = this.source;
      const loaded = await this.load(scene, assets);
      if (!loaded.ok || !this.current) throw new Error(`the scene failed to load for recording: ${loaded.errors.map((e) => e.message).join("; ")}`);
      const current = this.current;
      if (!this.fixedSize) {
        const even = { width: current.canvas.width - (current.canvas.width % 2), height: current.canvas.height - (current.canvas.height % 2) };
        this.fixedSize = even;
        this.sizeCanvas(current.canvas);
      }
      this.recording = true;
      return await recordOffline(options, {
        canvas: current.canvas,
        signal: abort.signal,
        onProgress: progress,
        renderAt: (time, dt, frame) => {
          if (this.current !== current) throw new Error("the scene was replaced during recording");
          this.time = time;
          this.frame = frame;
          this.renderFrame(current, dt);
          if (this.errors.length) throw new Error(`the scene failed while recording: ${this.errors.at(-1)!.message}`);
        },
      });
    } finally {
      this.recording = false;
      this.recordAbort = null;
      this.fixedSize = null;
      this.playing = wasPlaying;
      if (this.current) this.sizeCanvas(this.current.canvas);
      this.dirty = true;
    }
  }

  cancelRecording(): void {
    this.recordAbort?.abort();
  }

  private flushCaptures(canvas: HTMLCanvasElement): void {
    if (!this.captures.length) return;
    const pending = this.captures.splice(0);
    // The bitmap snapshot is taken synchronously, right after this frame's draw.
    createImageBitmap(canvas).then(
      async (bitmap) => {
        for (const capture of pending) {
          try {
            capture.resolve(await encodePng(bitmap, capture.maxSize));
          } catch (err) {
            capture.reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
        bitmap.close();
      },
      (err) => pending.forEach((c) => c.reject(err)),
    );
  }

  private makeWebGl(canvas: HTMLCanvasElement, scene: Scene, assets: Record<string, string>, publish: SceneCtx["publish"], inputs: SceneInputs) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is not available");
    const { ctx, dispose, beforeFrame } = createCtx(gl, canvas, uniformValues(scene), assets, publish, inputs);
    const names: Record<number, string> = {
      [gl.INVALID_ENUM]: "INVALID_ENUM",
      [gl.INVALID_VALUE]: "INVALID_VALUE",
      [gl.INVALID_OPERATION]: "INVALID_OPERATION",
      [gl.INVALID_FRAMEBUFFER_OPERATION]: "INVALID_FRAMEBUFFER_OPERATION",
      [gl.OUT_OF_MEMORY]: "OUT_OF_MEMORY",
    };
    const surface: Surface = {
      beforeRender(c) {
        // Scripts that render to framebuffers set their own viewport; the
        // default one always covers the (possibly resized) canvas.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, c.width, c.height);
      },
      afterRender(check, report) {
        if (!check) return;
        const code = gl.getError();
        if (code !== gl.NO_ERROR && code !== gl.CONTEXT_LOST_WEBGL) report(new Error(`gl.getError() = ${names[code] ?? code} during render`));
      },
      setup: (run) => run,
      dispose: () => gl.getExtension("WEBGL_lose_context")?.loseContext(),
    };
    return { ctx, dispose, surface, beforeFrame };
  }

  /** A fresh device per load; null when a newer load started meanwhile. */
  private async makeWebGpu(canvas: HTMLCanvasElement, scene: Scene, assets: Record<string, string>, publish: SceneCtx["publish"], generation: number, inputs: SceneInputs) {
    if (!navigator.gpu) throw new Error("WebGPU is not available in this browser; use backend \"webgl2\"");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter on this machine; use backend \"webgl2\"");
    const device = await adapter.requestDevice();
    if (generation !== this.generation) {
      device.destroy();
      return null;
    }
    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!context) {
      device.destroy();
      throw new Error("Could not get a webgpu canvas context");
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    let destroyed = false;
    void device.lost.then((info) => {
      if (!destroyed && this.current?.generation === generation) this.fail("webgpu", new Error(`WebGPU device lost (${info.reason}): ${info.message}`));
    });
    device.addEventListener("uncapturederror", (e) => {
      if (this.current?.generation === generation) this.record("webgpu", new Error(`WebGPU error: ${(e as GPUUncapturedErrorEvent).error.message}`));
    });

    const ctx = createGpuCtx(device, context, format, canvas, scene, uniformValues(scene), assets, publish, inputs);
    const surface: Surface = {
      beforeRender(_c, check) {
        if (check) device.pushErrorScope("validation");
      },
      afterRender(check, report) {
        if (!check) return;
        void device.popErrorScope().then((err) => err && report(new Error(`WebGPU validation error during render: ${err.message}`)));
      },
      async setup(run) {
        device.pushErrorScope("validation");
        // The scope must be popped whether setup threw or not; the script's own error wins.
        const outcome = await run.then(() => null, (err: unknown) => ({ err }));
        const validation = await device.popErrorScope();
        if (outcome) throw outcome.err;
        if (validation) throw new Error(`WebGPU validation error during setup: ${validation.message}`);
      },
      dispose() {
        destroyed = true;
        device.destroy();
      },
    };
    return { ctx, dispose: () => undefined, surface };
  }

  private waitForFrames(count: number): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.framesRendered >= count || this.state === "error" || !this.current) resolve();
        else this.frameWaiters.push(check);
      };
      check();
    });
  }

  private notifyFrame(): void {
    const waiters = this.frameWaiters.splice(0);
    for (const w of waiters) w();
  }

  private loadResult(): LoadResult {
    return { ok: this.errors.length === 0 && this.state !== "error", errors: [...this.errors] };
  }

  private fail(source: SceneErrorSource, err: unknown): void {
    this.record(source, err);
    this.state = "error";
    this.notifyFrame();
  }

  private record(source: SceneErrorSource, err: unknown): void {
    const error = toSceneError(source, err);
    const duplicate = this.errors.some((e) => e.source === error.source && e.message === error.message);
    if (duplicate) return;
    this.errors.push(error);
    if (this.errors.length > MAX_ERRORS) this.errors.shift();
    this.emit("error", error);
  }

  private resize(): void {
    if (this.current) this.sizeCanvas(this.current.canvas);
    this.dirty = true;
  }

  private sizeCanvas(canvas: HTMLCanvasElement): void {
    if (this.fixedSize) {
      if (canvas.width !== this.fixedSize.width || canvas.height !== this.fixedSize.height) {
        canvas.width = this.fixedSize.width;
        canvas.height = this.fixedSize.height;
      }
      return;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(this.container.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.container.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  private bindInput(): void {
    const toNormalized = (e: PointerEvent) => {
      const rect = this.container.getBoundingClientRect();
      return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height] as const;
    };
    this.container.addEventListener("pointermove", (e) => {
      const [x, y] = toNormalized(e);
      this.mouse[0] = x;
      this.mouse[1] = y;
      if (!this.playing) this.dirty = true;
    });
    this.container.addEventListener("pointerdown", (e) => {
      // A click is the gesture browsers want before audio can start.
      this.current?.inputs.resume();
      const [x, y] = toNormalized(e);
      this.mouse.splice(0, 4, x, y, x, y);
      this.mouseDown = true;
      this.container.setPointerCapture(e.pointerId);
    });
    const release = () => {
      this.mouseDown = false;
    };
    this.container.addEventListener("pointerup", release);
    this.container.addEventListener("pointercancel", release);
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function toSceneError(source: SceneErrorSource, err: unknown): SceneError {
  const at = Date.now();
  if (err instanceof ShaderError) {
    return {
      source: "shader",
      message: err.message,
      stage: err.stage,
      diagnostics: err.diagnostics,
      excerpt: err.excerpt,
      line: err.diagnostics[0]?.line,
      at,
    };
  }
  const error = err instanceof Error ? err : new Error(String(err));
  const location = scriptLocation(error);
  return {
    source,
    message: `${error.name}: ${error.message}`,
    ...(location ?? {}),
    at,
  };
}

/** Line/column of the first stack frame inside script code (new Function bodies). */
export function scriptLocation(error: Error): { line: number; column: number } | null {
  const match = error.stack?.match(/<anonymous>:(\d+):(\d+)/);
  if (!match?.[1] || !match[2]) return null;
  const line = Number(match[1]) - FUNCTION_HEADER_LINES;
  return line > 0 ? { line, column: Number(match[2]) } : null;
}

async function encodePng(bitmap: ImageBitmap, maxSize: number): Promise<CaptureResult> {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable for capture");
  context.drawImage(bitmap, 0, 0, width, height);
  return { png: await canvas.convertToBlob({ type: "image/png" }), width, height };
}
