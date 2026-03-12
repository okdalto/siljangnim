export const PROVIDER_LABELS = {
  anthropic: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
  glm: "GLM",
  custom: "Custom",
};

export const PROVIDER_MODELS = {
  anthropic: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { id: "claude-opus-4-6", label: "Opus 4.6" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
    { id: "gpt-5-mini", label: "GPT-5 Mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "o3", label: "o3" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  glm: [
    { id: "glm-4-plus", label: "GLM-4 Plus" },
  ],
};

// Flat ID-only map for model auto-switching (used in App.jsx)
export const PROVIDER_MODEL_IDS = Object.fromEntries(
  Object.entries(PROVIDER_MODELS).map(([k, v]) => [k, v.map((m) => m.id)])
);
