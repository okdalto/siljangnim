// Access to the Python hub (runtime jobs). The desktop app learns its URL and
// token from the preload bridge; a viewer opened by the MCP bridge gets them
// over the bridge connection. The token never reaches the scene iframe.
import type { OscMessage } from "../scene/runtime/inputData";
import { bridge } from "./platform";

export interface HubAccess {
  url: string;
  token: string;
}

/** Hub access, or why there is none. */
export type HubProvider = () => Promise<HubAccess | string>;

let provider: HubProvider = async () => {
  if (!bridge) {
    return "Running open-source tools needs the desktop app or the MCP bridge (siljangnim-mcp); this browser session has neither.";
  }
  const info = await bridge.hub.info();
  if (info.status === "ready" && info.url && info.token) return { url: info.url, token: info.token };
  if (info.status === "error") return `The runtime failed to start: ${info.error ?? "unknown error"}`;
  return "The runtime is still being set up (the first launch installs Python). Try again in a minute.";
};

export function setHubProvider(next: HubProvider): void {
  provider = next;
}

export async function hubClient(): Promise<HubClient | string> {
  const access = await provider();
  return typeof access === "string" ? access : new HubClient(access);
}

export interface HubJob {
  id: string;
  state: "created" | "queued" | "installing" | "running" | "done" | "failed" | "cancelled";
  kind: "python" | "command";
  packages: string[];
  /** For commands: the resolved program path and arguments. */
  argv: string[];
  exit_code: number | null;
  error: string | null;
  log: string;
  outputs: Array<{ name: string; size: number }>;
  resolved: string[];
  seconds: number;
  /** What it is for, e.g. "recipe trimesh.torus-knot". */
  label?: string;
  created_at?: number;
}

export interface HubRecipeSummary {
  id: string;
  version: number;
  title: string;
  capability: string;
  tier: "C" | "D";
  kind: "python" | "command";
  packages: string[];
  program: string | null;
  io: Record<string, unknown>;
  license: string | null;
  origin: string;
  status_here: "draft" | "verified" | "broken";
  tested_here: string | null;
}

export interface HubOscStatus {
  listening: boolean;
  port: number | null;
  host: string;
  error: string | null;
  received: number;
  dropped: number;
}

const TERMINAL = new Set(["done", "failed", "cancelled"]);
/** The hub holds a request at most this long; longer waits are several requests. */
const HUB_WAIT_S = 55;

export class HubClient {
  constructor(private readonly access: HubAccess) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.access.url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.access.token}`, ...(init.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...init.headers },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `hub returned ${res.status}`);
    }
    return (path.includes("/outputs/") ? res.blob() : res.json()) as Promise<T>;
  }

  system() {
    return this.request<{ platform: string; accelerators: string[]; gpus: Array<{ name: string }> }>("/system");
  }

  runtime() {
    return this.request<{ environments: Array<{ packages: string[] }>; programs: Record<string, string | null> }>("/runtime");
  }

  createJob(body: { kind: "python" | "command"; packages: string[]; code: string; argv: string[]; timeout_s: number; label?: string }) {
    return this.request<HubJob>("/jobs", { method: "POST", body: JSON.stringify(body) });
  }

  putInput(id: string, name: string, data: Blob) {
    return this.request<unknown>(`/jobs/${id}/inputs/${encodeURIComponent(name)}`, { method: "PUT", body: data });
  }

  /** Recent jobs, newest first, with the end of each log. */
  jobs() {
    return this.request<{ jobs: HubJob[] }>("/jobs");
  }

  cancel(id: string) {
    return this.request<HubJob>(`/jobs/${id}/cancel`, { method: "POST" });
  }

  start(id: string) {
    return this.request<HubJob>(`/jobs/${id}/start`, { method: "POST" });
  }

  output(id: string, name: string) {
    return this.request<Blob>(`/jobs/${id}/outputs/${encodeURIComponent(name)}`);
  }

  recipes(query: string) {
    return this.request<{ platform: string; recipes: HubRecipeSummary[] }>(`/recipes?q=${encodeURIComponent(query)}`);
  }

  recipe(id: string) {
    return this.request<{ summary: HubRecipeSummary; code: string; argv: string[]; text: string; meta: { verify?: { params?: Record<string, unknown>; expect_outputs?: string[] } } }>(
      `/recipes/${encodeURIComponent(id)}`,
    );
  }

  saveRecipe(id: string, fields: unknown) {
    return this.request<{ summary: HubRecipeSummary; text: string }>(`/recipes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(fields) });
  }

  registry(query: string) {
    return this.request<{ url: string; recipes: Array<{ id: string; version: number; title: string; capability: string; kind: "python" | "command"; license: string | null; verified_on: string[] }> }>(
      `/registry?q=${encodeURIComponent(query)}`,
    );
  }

  installRecipe(id: string) {
    return this.request<{ summary: HubRecipeSummary; kept: boolean }>(`/registry/${encodeURIComponent(id)}/install`, { method: "POST" });
  }

  importRecipe(text: string) {
    return this.request<{ summary: HubRecipeSummary; kept: boolean }>("/recipes/import", { method: "POST", body: JSON.stringify({ text }) });
  }

  recipeStatus(id: string, status: "verified" | "broken", log: string) {
    return this.request<{ summary: HubRecipeSummary }>(`/recipes/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status, log }) });
  }

  oscListen(port: number) {
    return this.request<HubOscStatus>("/osc/listen", { method: "POST", body: JSON.stringify({ port }) });
  }

  oscStop() {
    return this.request<HubOscStatus>("/osc/stop", { method: "POST" });
  }

  /** Server-sent OSC batches until the signal aborts or the hub goes away. */
  async oscStream(signal: AbortSignal, onBatch: (messages: OscMessage[]) => void): Promise<void> {
    const res = await fetch(`${this.access.url}/osc/stream`, { headers: { Authorization: `Bearer ${this.access.token}` }, signal });
    if (!res.ok || !res.body) throw new Error(`hub returned ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
        if (data) onBatch(JSON.parse(data) as OscMessage[]);
      }
    }
  }

  /** The job once it finishes, or as it is after `waitS` seconds. */
  async wait(id: string, waitS: number): Promise<HubJob> {
    const deadline = Date.now() + waitS * 1000;
    for (;;) {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      const job = await this.request<HubJob>(`/jobs/${id}?wait=${Math.min(remaining, HUB_WAIT_S)}`);
      if (TERMINAL.has(job.state) || remaining === 0) return job;
    }
  }
}
