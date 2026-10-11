// Runs one scene at a time inside the runtime iframe.
//
// Every load gets a fresh canvas and WebGL context: no GL state or leaked
// resources carry over between scenes, so there is nothing to track or
// reset by hand.
import { ShaderError } from "../gl/shader";
import type { CaptureResult, LoadResult, RuntimeState, RuntimeStatus, SceneError, SceneErrorSource } from "../protocol";
import { uniformValues, type Scene, type UniformValue } from "../schema";
import { createCtx, type SceneCtx } from "./ctx";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (ctx: SceneCtx) => Promise<void>;

const SETUP_TIMEOUT_MS = 20_000;
const FRAMES_BEFORE_LOADED = 3;
const MAX_ERRORS = 20;
const MAX_PIXEL_RATIO = 2;
const GL_ERROR_CHECK_EVERY = 60;

// new Function() puts the body two lines below the header in V8.
const FUNCTION_HEADER_LINES = 2;

type Emit = (event: "error" | "stats", data: unknown) => void;

interface Loaded {
  generation: number;
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  ctx: SceneCtx;
  render: (ctx: SceneCtx) => unknown;
  cleanup: (ctx: SceneCtx) => unknown;
  disposeCtx: () => void;
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
    this.errors = [];
    this.state = "loading";
    this.time = 0;
    this.frame = 0;
    this.framesRendered = 0;

    if (scene.backend !== "webgl2") {
      this.fail("setup", new Error(`backend "${scene.backend}" is not supported yet; use "webgl2"`));
      return this.loadResult();
    }

    const canvas = document.createElement("canvas");
    this.container.replaceChildren(canvas);
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) {
      this.fail("webgl", new Error("WebGL2 is not available"));
      return this.loadResult();
    }
    this.sizeCanvas(canvas);

    const assetUrls: string[] = [];
    const assetMap: Record<string, string> = {};
    for (const [name, blob] of Object.entries(assets)) {
      const url = URL.createObjectURL(blob);
      assetUrls.push(url);
      assetMap[name] = url;
    }

    const { ctx, dispose } = createCtx(gl, canvas, uniformValues(scene), assetMap);
    ctx.mouse = this.mouse;
    ctx.keys = this.keys;

    let setup: (ctx: SceneCtx) => Promise<void>;
    let render: (ctx: SceneCtx) => unknown;
    let cleanup: (ctx: SceneCtx) => unknown;
    try {
      setup = this.compile("setup", () => new AsyncFunction("ctx", scene.script.setup));
      render = this.compile("render", () => new Function("ctx", scene.script.render) as (ctx: SceneCtx) => unknown);
      cleanup = this.compile("cleanup", () => new Function("ctx", scene.script.cleanup) as (ctx: SceneCtx) => unknown);
    } catch {
      dispose();
      for (const url of assetUrls) URL.revokeObjectURL(url);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return this.loadResult();
    }

    this.current = { generation, canvas, gl, ctx, render, cleanup, disposeCtx: dispose, assetUrls };

    try {
      await withTimeout(setup(ctx), SETUP_TIMEOUT_MS, "setup did not finish within 20s");
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
    this.dirty = true;
  }

  transport(action: "play" | "pause" | "seek", time?: number): void {
    if (action === "play") this.playing = true;
    if (action === "pause") this.playing = false;
    if (action === "seek" && time !== undefined) this.time = Math.max(0, time);
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
    };
  }

  /** Errors raised outside script phases (async callbacks, promise rejections). */
  reportUncaught(err: unknown): void {
    if (this.current) this.record("runtime", err);
  }

  // --- internals ---

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
    for (const url of old.assetUrls) URL.revokeObjectURL(url);
    old.gl.getExtension("WEBGL_lose_context")?.loseContext();
    old.canvas.remove();
  }

  private tick(now: number): void {
    requestAnimationFrame((t) => this.tick(t));
    const dt = this.lastTick ? Math.min((now - this.lastTick) / 1000, 0.1) : 0;
    this.lastTick = now;
    if (dt > 0) this.fps = this.fps * 0.9 + (1 / dt) * 0.1;

    const loaded = this.current;
    const active = loaded && (this.state === "running" || this.state === "paused");
    if (active && (this.playing || this.dirty)) {
      const frameDt = this.playing ? dt : 0;
      if (this.playing) this.time += dt;
      const ctx = loaded.ctx;
      ctx.time = this.time;
      ctx.dt = frameDt;
      ctx.frame = this.frame;
      ctx.mouseDown = this.mouseDown;
      ctx.resolution[0] = loaded.canvas.width;
      ctx.resolution[1] = loaded.canvas.height;
      try {
        // Scripts that render to framebuffers set their own viewport; the
        // default one always covers the (possibly resized) canvas.
        loaded.gl.bindFramebuffer(loaded.gl.FRAMEBUFFER, null);
        loaded.gl.viewport(0, 0, loaded.canvas.width, loaded.canvas.height);
        const result = loaded.render(ctx);
        ctx.mousePrev.splice(0, 4, ...this.mouse);
        if (result instanceof Promise) {
          throw new Error("render must be synchronous; do async work (loading, imports) in setup");
        }
        this.frame++;
        this.dirty = false;
        if (this.frame % GL_ERROR_CHECK_EVERY === 1) this.checkGlError(loaded.gl);
        this.framesRendered++;
        this.flushCaptures(loaded.canvas);
      } catch (err) {
        this.fail("render", err);
      }
      this.notifyFrame();
    } else if (this.captures.length && loaded) {
      // Errored scene: hand back whatever the canvas shows.
      this.flushCaptures(loaded.canvas);
    }

    if (now - this.lastStats > 250) {
      this.lastStats = now;
      this.emit("stats", { state: this.state, time: this.time, fps: Math.round(this.fps) });
    }
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

  private checkGlError(gl: WebGL2RenderingContext): void {
    const code = gl.getError();
    if (code === gl.NO_ERROR || code === gl.CONTEXT_LOST_WEBGL) return;
    const names: Record<number, string> = {
      [gl.INVALID_ENUM]: "INVALID_ENUM",
      [gl.INVALID_VALUE]: "INVALID_VALUE",
      [gl.INVALID_OPERATION]: "INVALID_OPERATION",
      [gl.INVALID_FRAMEBUFFER_OPERATION]: "INVALID_FRAMEBUFFER_OPERATION",
      [gl.OUT_OF_MEMORY]: "OUT_OF_MEMORY",
    };
    this.record("webgl", new Error(`gl.getError() = ${names[code] ?? code} during render`));
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
