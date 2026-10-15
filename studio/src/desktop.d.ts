// Bridge exposed by desktop/src/preload.cjs. Absent in the browser.
export type ProviderKeyId = "anthropic" | "openai";

export interface HubInfo {
  status: "idle" | "installing" | "starting" | "ready" | "error" | "stopped";
  error: string | null;
  url: string | null;
  token: string | null;
  logPath: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  downloadUrl: string | null;
  releaseUrl: string;
}

export interface SiljangnimBridge {
  desktop: true;
  platform: string;
  updates?: {
    info(): Promise<{ currentVersion: string }>;
    check(): Promise<UpdateInfo>;
    download(): Promise<void>;
    releases(): Promise<void>;
  };
  hub: {
    info(): Promise<HubInfo>;
    onStatus(callback: (info: HubInfo) => void): () => void;
  };
  llm: {
    /** Per-launch token to send as x-siljangnim-token with LLM requests. */
    token(): Promise<string>;
  };
  keys: {
    /** Which providers have a stored key. Keys themselves never reach the renderer. */
    status(): Promise<Record<ProviderKeyId, boolean>>;
    set(provider: ProviderKeyId, key: string | null): Promise<void>;
  };
  project: {
    /** Writes the files under ~/Siljangnim/projects/<folder>/, opens the folder, and returns its path. */
    reveal(folder: string, files: { path: string; data: Uint8Array | string }[]): Promise<string>;
  };
  agent: {
    /** An agent's MCP bridge asks to use this window as its viewer. */
    onAttach(callback: (request: AgentAttach) => void): () => void;
    pending(): Promise<AgentAttach | null>;
  };
  /** The person's own Claude Code or Codex CLI as the chat agent (desktop/src/localAgents.js). */
  localAgent?: {
    detect(): Promise<Record<LocalEngineId, LocalEngineStatus>>;
    setup(engine: LocalEngineId, action: "install" | "login"): Promise<{ ok: boolean; stdout: string; stderr: string }>;
    run(engine: LocalEngineId, prompt: string, sessionId: string | null): Promise<string>;
    stop(id: string): Promise<void>;
    onEvent(callback: (id: string, event: LocalAgentEvent) => void): () => void;
  };
}

export type LocalEngineId = "claude-code" | "codex";

export interface LocalEngineStatus {
  installed: boolean;
  loggedIn: boolean;
  path?: string;
  version?: string | null;
  /** The official install command for this platform. */
  install: string | null;
  docs: string;
}

export type LocalAgentEvent =
  | { type: "session"; id: string }
  | { type: "text"; delta: string }
  | { type: "assistant"; content: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown })[] }
  | { type: "tool_result"; id: string; isError: boolean; text: string }
  | { type: "error"; message: string; auth?: boolean }
  | { type: "done"; stopped: boolean };

export interface AgentAttach {
  /** The bridge's WebSocket, ws://localhost:<port>/bridge. */
  ws: string;
  token: string;
  /** The bridge of the app's own chat run (Claude Code / Codex), not an outside agent. */
  embedded?: boolean;
}

declare global {
  interface Window {
    siljangnim?: SiljangnimBridge;
  }
}
