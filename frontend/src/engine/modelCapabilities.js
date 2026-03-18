/**
 * Model capability detection — vision support, tool filtering, token estimation.
 * Centralizes provider-specific model knowledge.
 */

// ---------------------------------------------------------------------------
// Vision model capability detection
// ---------------------------------------------------------------------------

/**
 * Known vision-capable model patterns per provider.
 * Models matching these patterns support image input in tool results.
 */
const VISION_MODELS = {
  anthropic: [
    // All Claude 3+ models support vision
    /claude-3/, /claude-sonnet/, /claude-opus/, /claude-haiku/,
  ],
  openai: [
    // GPT-4o, GPT-4.1, GPT-4 Turbo, GPT-5, o-series — all support vision
    /gpt-4o/, /gpt-4\.1/, /gpt-4-turbo/, /gpt-4-vision/, /gpt-5/,
    /^o1/, /^o3/, /^o4/,
  ],
  gemini: [
    // All Gemini 1.5+, 2.x, 3.x are natively multimodal
    /gemini-1\.5/, /gemini-2/, /gemini-3/, /gemini-pro-vision/,
  ],
  glm: [
    // GLM-4V, 4.5V, 4.6V, 4.1V series
    /glm-4v/, /glm-4\.5v/, /glm-4\.6v/, /glm-4\.1v/,
  ],
  custom: [],
};

/**
 * Check if a given provider + model combination supports vision (image input).
 * For "custom" providers, falls back to providerConfig.vision flag.
 */
export function isVisionCapable(provider, model, providerConfig = {}) {
  // Explicit override from provider config (useful for custom providers)
  if (providerConfig.vision === true) return true;
  if (providerConfig.vision === false) return false;

  const patterns = VISION_MODELS[provider] || [];
  if (!model) return false;
  const lower = model.toLowerCase();
  return patterns.some((re) => re.test(lower));
}

/**
 * Filter tools based on model capabilities.
 * Removes capture_viewport for non-vision models.
 */
export function filterToolsForModel(tools, provider, model, providerConfig = {}) {
  if (isVisionCapable(provider, model, providerConfig)) return tools;
  return tools.filter((t) => t.name !== "capture_viewport");
}

/**
 * Estimate bytes per token based on message content (ASCII vs multibyte ratio).
 */
export function estimateBytesPerToken(messages) {
  const sample = JSON.stringify(messages).slice(0, 6000);
  let multibyte = 0, total = 0;
  for (const ch of sample) { total++; if (ch.charCodeAt(0) > 127) multibyte++; }
  // 3.0 (pure ASCII/code) ~ 4.5 (high Korean ratio)
  return total > 0 ? 3.0 + (multibyte / total) * 1.5 : 3.0;
}
