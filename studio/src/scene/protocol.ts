// Messages between the app (host) and the scene runtime iframe.
// Everything crosses window.postMessage; both sides check the peer origin.
import type { Scene, UniformValue } from "./schema";

export const CHANNEL = "siljangnim-scene/1";

export type SceneErrorSource = "setup" | "render" | "cleanup" | "shader" | "webgl" | "runtime";

export interface ShaderDiagnostic {
  line: number;
  message: string;
}

export interface SceneError {
  source: SceneErrorSource;
  message: string;
  /** 1-based line inside the script phase or shader source. */
  line?: number;
  column?: number;
  /** For shader errors: which stage failed and the parsed compiler log. */
  stage?: "vertex" | "fragment" | "link";
  diagnostics?: ShaderDiagnostic[];
  /** Source lines around the first diagnostic, numbered. */
  excerpt?: string;
  at: number;
}

export type RuntimeState = "idle" | "loading" | "running" | "paused" | "error";

export interface RuntimeStatus {
  state: RuntimeState;
  time: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  errors: SceneError[];
}

export interface LoadResult {
  ok: boolean;
  errors: SceneError[];
}

export interface CaptureResult {
  png: Blob;
  width: number;
  height: number;
}

/** Request methods: params and result types. */
export interface RuntimeMethods {
  load: { params: { scene: Scene; assets: Record<string, Blob> }; result: LoadResult };
  setUniform: { params: { name: string; value: UniformValue }; result: void };
  transport: { params: { action: "play" | "pause" | "seek"; time?: number }; result: void };
  capture: { params: { maxSize: number }; result: CaptureResult };
  status: { params: Record<string, never>; result: RuntimeStatus };
}

export type MethodName = keyof RuntimeMethods;

/** Events the runtime pushes without a request. */
export interface RuntimeEvents {
  ready: Record<string, never>;
  error: SceneError;
  stats: { state: RuntimeState; time: number; fps: number };
}

export type EventName = keyof RuntimeEvents;

export type Envelope =
  | { channel: typeof CHANNEL; kind: "request"; id: number; method: MethodName; params: unknown }
  | { channel: typeof CHANNEL; kind: "response"; id: number; ok: true; result: unknown }
  | { channel: typeof CHANNEL; kind: "response"; id: number; ok: false; error: string }
  | { channel: typeof CHANNEL; kind: "event"; event: EventName; data: unknown };

export function isEnvelope(data: unknown): data is Envelope {
  return typeof data === "object" && data !== null && (data as { channel?: unknown }).channel === CHANNEL;
}
