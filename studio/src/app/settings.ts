// Non-secret preferences, kept in localStorage.
import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "../agent/llm/anthropic";
import { OpenAICompatibleProvider, listModels } from "../agent/llm/openai";
import { OpenAIResponsesProvider } from "../agent/llm/responses";
import type { Effort, LLMProvider } from "../agent/llm/types";
import { apiBase, forwarderHeaders, keys } from "./platform";

/** anthropic: Claude. openai: GPT on api.openai.com. custom: any OpenAI-compatible server (vLLM, Ollama…). */
export type ProviderChoice = "anthropic" | "openai" | "custom";

export interface Settings {
  provider: ProviderChoice;
  anthropicModel: string;
  effort: Effort;
  openaiModel: string;
  customBaseUrl: string;
  customModel: string;
  /** Output limit for GPT and custom servers. */
  openaiMaxTokens: number;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  anthropicModel: DEFAULT_ANTHROPIC_MODEL,
  effort: "high",
  openaiModel: "",
  customBaseUrl: "",
  customModel: "",
  openaiMaxTokens: 8192,
};

/** Settings saved before GPT and custom servers were separate choices. */
interface LegacySettings {
  openaiBaseUrl?: string;
}

/** API keys pasted into the wrong field must never be stored in plain settings. */
export function looksLikeApiKey(value: string): boolean {
  return /^\s*sk-/i.test(value);
}

export function migrateSettings(stored: Partial<Settings> & LegacySettings): Settings {
  const { openaiBaseUrl, ...rest } = stored;
  const settings = { ...DEFAULT_SETTINGS, ...rest };
  for (const field of ["anthropicModel", "openaiModel", "customModel", "customBaseUrl"] as const) {
    if (looksLikeApiKey(settings[field])) settings[field] = DEFAULT_SETTINGS[field];
  }
  if (openaiBaseUrl?.trim() && !stored.customBaseUrl) {
    settings.customBaseUrl = openaiBaseUrl.trim();
    if (settings.provider === "openai") {
      settings.provider = "custom";
      settings.customModel = settings.openaiModel;
      settings.openaiModel = "";
    }
  }
  return settings;
}

/** The model the current provider will use. */
export function activeModel(settings: Settings): string {
  if (settings.provider === "anthropic") return settings.anthropicModel;
  return (settings.provider === "openai" ? settings.openaiModel : settings.customModel).trim();
}

const STORAGE_KEY = "siljangnim.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const settings = migrateSettings(JSON.parse(raw) as Partial<Settings>);
    // Rewrite right away so a key that ended up in a settings field is gone from storage.
    saveSettings(settings);
    return settings;
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

async function openAIOptions(settings: Settings) {
  const official = settings.provider === "openai";
  return {
    endpoint: `${apiBase()}/llm/openai`,
    baseUrl: official ? "" : settings.customBaseUrl.trim(),
    // Custom servers share the OpenAI key slot; local ones usually need none.
    apiKey: keys.forRequest("openai") || undefined,
    maxTokens: settings.openaiMaxTokens,
    headers: await forwarderHeaders(),
  };
}

/** Model ids the GPT or custom server offers, newest first. */
export async function fetchModels(settings: Settings): Promise<string[]> {
  return listModels(await openAIOptions(settings), { chatOnly: settings.provider === "openai" });
}

export async function createProvider(settings: Settings): Promise<{ provider: LLMProvider; model: string }> {
  if (settings.provider === "openai") {
    // OpenAI's reasoning models take tools only through the Responses API.
    return { provider: new OpenAIResponsesProvider(await openAIOptions(settings)), model: activeModel(settings) };
  }
  if (settings.provider === "custom") {
    return { provider: new OpenAICompatibleProvider(await openAIOptions(settings)), model: activeModel(settings) };
  }
  const headers = await forwarderHeaders();
  return {
    // Desktop: the main process adds the key; the SDK still wants a non-empty value.
    provider: new AnthropicProvider(`${apiBase()}/llm/anthropic`, keys.forRequest("anthropic") || "set-by-desktop", headers),
    model: settings.anthropicModel,
  };
}
