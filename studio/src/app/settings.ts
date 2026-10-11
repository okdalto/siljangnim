// Non-secret preferences, kept in localStorage.
import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "../agent/llm/anthropic";
import { OpenAICompatibleProvider } from "../agent/llm/openai";
import type { Effort, LLMProvider } from "../agent/llm/types";
import { apiBase, forwarderHeaders, keys } from "./platform";

export interface Settings {
  provider: "anthropic" | "openai";
  anthropicModel: string;
  effort: Effort;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiMaxTokens: number;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  anthropicModel: DEFAULT_ANTHROPIC_MODEL,
  effort: "high",
  openaiBaseUrl: "",
  openaiModel: "",
  openaiMaxTokens: 8192,
};

const STORAGE_KEY = "siljangnim.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // not persisted; fine for this session
  }
}

export async function createProvider(settings: Settings): Promise<{ provider: LLMProvider; model: string }> {
  const headers = await forwarderHeaders();
  if (settings.provider === "openai") {
    return {
      provider: new OpenAICompatibleProvider({
        endpoint: `${apiBase()}/llm/openai`,
        baseUrl: settings.openaiBaseUrl.trim(),
        apiKey: keys.forRequest("openai") || undefined,
        maxTokens: settings.openaiMaxTokens,
        headers,
      }),
      model: settings.openaiModel.trim(),
    };
  }
  return {
    // Desktop: the main process adds the key; the SDK still wants a non-empty value.
    provider: new AnthropicProvider(`${apiBase()}/llm/anthropic`, keys.forRequest("anthropic") || "set-by-desktop", headers),
    model: settings.anthropicModel,
  };
}
