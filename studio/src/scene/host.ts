// App-side handle on the scene runtime iframe.
import {
  CHANNEL,
  isEnvelope,
  type Envelope,
  type EventName,
  type MethodName,
  type RuntimeEvents,
  type RuntimeMethods,
} from "./protocol";
import type { Scene, UniformValue } from "./schema";

const DEFAULT_TIMEOUT_MS = 15_000;
const LOAD_TIMEOUT_MS = 30_000;

/**
 * Where the runtime document lives. It must be a different origin from the
 * app so scene code cannot reach the app's storage (API keys, projects).
 */
export function sceneRuntimeUrl(loc: Location = window.location): URL {
  let base: string;
  if (loc.protocol === "app:") {
    base = "app://scene/";
  } else if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") {
    // Dev server: localhost and 127.0.0.1 are distinct origins on the same server.
    const other = loc.hostname === "localhost" ? "127.0.0.1" : "localhost";
    base = `${loc.protocol}//${other}:${loc.port}/`;
  } else if (import.meta.env.VITE_SCENE_ORIGIN) {
    base = `${import.meta.env.VITE_SCENE_ORIGIN}/`;
  } else {
    throw new Error("No isolated scene origin configured (set VITE_SCENE_ORIGIN)");
  }
  const url = new URL("scene.html", base);
  url.searchParams.set("parent", loc.origin);
  return url;
}

type Listener<E extends EventName> = (data: RuntimeEvents[E]) => void;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SceneHost {
  readonly iframe: HTMLIFrameElement;
  private readonly origin: string;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<EventName, Set<Listener<EventName>>>();
  private nextId = 1;
  private readyPromise: Promise<void>;
  private loadChain: Promise<unknown> = Promise.resolve();
  private readonly onMessage = (e: MessageEvent) => this.handleMessage(e);

  constructor(container: HTMLElement, url: URL = sceneRuntimeUrl()) {
    this.origin = url.origin;
    this.iframe = document.createElement("iframe");
    this.iframe.title = "Scene";
    this.iframe.src = url.href;
    // Same-origin here means the *scene's own* origin, never the app's.
    this.iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-pointer-lock");
    this.iframe.setAttribute("allow", "camera; microphone; midi; fullscreen; autoplay");
    this.iframe.className = "block h-full w-full border-0";
    this.readyPromise = new Promise((resolve) => {
      const off = this.on("ready", () => {
        off();
        resolve();
      });
    });
    window.addEventListener("message", this.onMessage);
    container.appendChild(this.iframe);
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  on<E extends EventName>(event: E, listener: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener as Listener<EventName>);
    return () => set.delete(listener as Listener<EventName>);
  }

  async request<M extends MethodName>(
    method: M,
    params: RuntimeMethods[M]["params"],
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<RuntimeMethods[M]["result"]> {
    await this.readyPromise;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`scene runtime did not answer ${method} within ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.post({ channel: CHANNEL, kind: "request", id, method, params });
    });
  }

  /** Loads are serialized so overlapping callers never interleave. */
  load(scene: Scene, assets: Record<string, Blob> = {}): Promise<RuntimeMethods["load"]["result"]> {
    const run = () => this.request("load", { scene, assets }, LOAD_TIMEOUT_MS);
    const next = this.loadChain.then(run, run);
    this.loadChain = next.catch(() => undefined);
    return next;
  }

  setUniform(name: string, value: UniformValue): void {
    void this.request("setUniform", { name, value }).catch(() => undefined);
  }

  destroy(): void {
    window.removeEventListener("message", this.onMessage);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("scene host destroyed"));
    }
    this.pending.clear();
    this.iframe.remove();
  }

  private post(envelope: Envelope): void {
    this.iframe.contentWindow?.postMessage(envelope, this.origin);
  }

  private handleMessage(e: MessageEvent): void {
    if (e.source !== this.iframe.contentWindow || e.origin !== this.origin || !isEnvelope(e.data)) return;
    const msg = e.data;
    if (msg.kind === "response") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    } else if (msg.kind === "event") {
      for (const listener of this.listeners.get(msg.event) ?? []) listener(msg.data as never);
    }
  }
}
