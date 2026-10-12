// Bridge exposed by desktop/src/preload.cjs. Absent in the browser.
export type ProviderKeyId = "anthropic" | "openai";

export interface HubInfo {
  status: "idle" | "installing" | "starting" | "ready" | "error" | "stopped";
  error: string | null;
  url: string | null;
  token: string | null;
  logPath: string;
}

export interface SiljangnimBridge {
  desktop: true;
  platform: string;
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
}

export interface AgentAttach {
  /** The bridge's WebSocket, ws://localhost:<port>/bridge. */
  ws: string;
  token: string;
}

declare global {
  interface Window {
    siljangnim?: SiljangnimBridge;
  }
}
