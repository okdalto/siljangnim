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
}

declare global {
  interface Window {
    siljangnim?: SiljangnimBridge;
  }
}
