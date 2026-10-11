// Desktop vs. browser differences: where the LLM forwarder lives and who holds API keys.
import type { ProviderKeyId } from "../desktop";

export const bridge = window.siljangnim;
export const isDesktop = bridge?.desktop === true;

/** Base of the app's API routes (LLM forwarder). The desktop serves them from app://siljangnim even in dev. */
export function apiBase(): string {
  return isDesktop ? "app://siljangnim/api" : `${window.location.origin}/api`;
}

let forwarderToken: Promise<string> | null = null;

/** Headers the desktop LLM forwarder requires: a per-launch token only the app UI can obtain. */
export async function forwarderHeaders(): Promise<Record<string, string>> {
  if (!bridge) return {};
  forwarderToken ??= bridge.llm.token();
  return { "x-siljangnim-token": await forwarderToken };
}

const SESSION_KEY = (p: ProviderKeyId) => `siljangnim.key.${p}`;

/**
 * Desktop: keys live in the main process (OS keychain encryption) and are added
 * to requests there. Browser: kept in sessionStorage of the app origin, which
 * scene code cannot reach (it runs on a separate origin).
 */
export const keys = {
  async status(): Promise<Record<ProviderKeyId, boolean>> {
    if (bridge) return bridge.keys.status();
    return { anthropic: Boolean(read("anthropic")), openai: Boolean(read("openai")) };
  },
  async set(provider: ProviderKeyId, key: string | null): Promise<void> {
    if (bridge) return bridge.keys.set(provider, key);
    try {
      if (key) sessionStorage.setItem(SESSION_KEY(provider), key);
      else sessionStorage.removeItem(SESSION_KEY(provider));
    } catch {
      // storage unavailable: the key lasts for this page only
      memory[provider] = key ?? undefined;
    }
  },
  /** The key to send from the renderer; always empty on desktop. */
  forRequest(provider: ProviderKeyId): string {
    return bridge ? "" : (read(provider) ?? "");
  },
};

const memory: Partial<Record<ProviderKeyId, string>> = {};

function read(provider: ProviderKeyId): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY(provider)) ?? memory[provider] ?? null;
  } catch {
    return memory[provider] ?? null;
  }
}
