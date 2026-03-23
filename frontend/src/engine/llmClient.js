/**
 * Unified LLM client — routes to the correct provider via the proxy.
 *
 * All providers normalize responses to: { contentBlocks: [{type, text, ...}], stopReason }
 */

import { callAnthropic, validateApiKey as validateAnthropicKey } from "./anthropicClient.js";

const PROXY_URL = "/api/proxy";

const SMALL_MODELS = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-5-mini",
  gemini: "gemini-2.0-flash",
  glm: "glm-4-flash",
  custom: null, // use the configured model
};

/**
 * Get the small/fast model for a provider (used for title generation).
 */
export function getSmallModel(provider) {
  return SMALL_MODELS[provider] || null;
}

/**
 * Call an LLM provider with streaming.
 *
 * @param {Object} params
 * @param {string} params.provider - Provider name (anthropic, openai, gemini, glm, custom)
 * @param {string} params.apiKey - API key
 * @param {string} [params.baseUrl] - Base URL for glm/custom providers
 * @param {string} params.model - Model name
 * @param {number} params.maxTokens - Max tokens to generate
 * @param {string} params.system - System prompt
 * @param {Array} params.messages - Conversation messages (Anthropic format)
 * @param {Array} params.tools - Tool definitions (Anthropic format)
 * @param {AbortSignal} [params.signal] - AbortController signal
 * @param {Object} [params.callbacks] - Streaming callbacks
 * @returns {Promise<{contentBlocks: Array, stopReason: string}>}
 */
// Strip internal metadata fields (e.g. _fromPlan, _planFailureSummary) that
// would cause API validation errors if sent to the provider.
const _INTERNAL_FIELDS = new Set(["_fromPlan", "_planFailureSummary"]);

function _sanitizeMessages(msgs) {
  let needsCopy = false;
  for (const m of msgs) {
    for (const key of _INTERNAL_FIELDS) {
      if (key in m) { needsCopy = true; break; }
    }
    if (needsCopy) break;
  }
  if (!needsCopy) return msgs;
  return msgs.map(m => {
    let hasInternal = false;
    for (const key of _INTERNAL_FIELDS) {
      if (key in m) { hasInternal = true; break; }
    }
    if (!hasInternal) return m;
    const clean = {};
    for (const [k, v] of Object.entries(m)) {
      if (!_INTERNAL_FIELDS.has(k)) clean[k] = v;
    }
    return clean;
  });
}

export async function callLLM({
  provider = "anthropic",
  apiKey,
  baseUrl,
  model,
  maxTokens,
  system,
  messages: rawMessages,
  tools,
  signal,
  callbacks = {},
}) {
  const messages = _sanitizeMessages(rawMessages);

  if (provider === "anthropic") {
    return callAnthropic({ apiKey, model, maxTokens, system, messages, tools, signal, callbacks });
  }

  if (provider === "gemini") {
    return callGemini({ apiKey, model, maxTokens, system, messages, tools, signal, callbacks });
  }

  // openai, glm, custom all use OpenAI-compatible format
  return callOpenAICompatible({ provider, apiKey, baseUrl, model, maxTokens, system, messages, tools, signal, callbacks });
}

/**
 * Validate a provider's API key/config.
 */
export async function validateProvider(provider, apiKey, config = {}) {
  if (provider === "anthropic") {
    return validateAnthropicKey(apiKey);
  }

  if (provider === "openai") {
    return validateOpenAIKey(apiKey);
  }

  if (provider === "gemini") {
    return validateGeminiKey(apiKey);
  }

  if (provider === "glm") {
    return validateGLMKey(apiKey, config);
  }

  if (provider === "custom") {
    return validateCustom(apiKey, config);
  }

  return { valid: false, error: `Unknown provider: ${provider}` };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible providers (openai, glm, custom)
// ---------------------------------------------------------------------------

/**
 * Convert Anthropic-format messages to OpenAI Chat format.
 */
function toOpenAIMessages(system, messages) {
  const result = [];
  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      // Handle tool_result content blocks
      if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(b => b.type === "tool_result");
        if (toolResults.length > 0) {
          // OpenAI tool messages only accept string content.
          // If there are image blocks, extract them and inject as a
          // follow-up user message (the standard workaround).
          const pendingImages = [];
          for (const tr of toolResults) {
            if (Array.isArray(tr.content)) {
              // Extract text for tool result, collect images separately
              const textParts = [];
              for (const block of tr.content) {
                if (block.type === "text") {
                  textParts.push(block.text);
                } else if (block.type === "image" && block.source?.type === "base64") {
                  pendingImages.push({
                    type: "image_url",
                    image_url: {
                      url: `data:${block.source.media_type};base64,${block.source.data}`,
                    },
                  });
                }
              }
              result.push({
                role: "tool",
                tool_call_id: tr.tool_use_id,
                content: textParts.join("\n") || "ok",
              });
            } else {
              result.push({
                role: "tool",
                tool_call_id: tr.tool_use_id,
                content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
              });
            }
          }
          // Inject images as a follow-up user message
          if (pendingImages.length > 0) {
            result.push({
              role: "user",
              content: [
                { type: "text", text: "Here is the viewport screenshot from the tool result:" },
                ...pendingImages,
              ],
            });
          }
          continue;
        }
        // Regular content blocks
        const text = msg.content
          .filter(b => b.type === "text")
          .map(b => b.text)
          .join("\n");
        if (text) result.push({ role: "user", content: text });
      } else {
        result.push({ role: "user", content: msg.content });
      }
    } else if (msg.role === "assistant") {
      if (Array.isArray(msg.content)) {
        const textParts = msg.content.filter(b => b.type === "text").map(b => b.text).join("\n");
        const toolCalls = msg.content.filter(b => b.type === "tool_use").map(b => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));

        const entry = { role: "assistant" };
        if (textParts) entry.content = textParts;
        else entry.content = null;
        if (toolCalls.length) entry.tool_calls = toolCalls;
        result.push(entry);
      } else {
        result.push({ role: "assistant", content: msg.content });
      }
    }
  }

  return result;
}

/**
 * Convert Anthropic tool definitions to OpenAI function format.
 */
function toOpenAITools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/**
 * Call OpenAI-compatible endpoint with SSE streaming.
 */
async function callOpenAICompatible({
  provider,
  apiKey,
  baseUrl,
  model,
  maxTokens,
  system,
  messages,
  tools,
  signal,
  callbacks = {},
}) {
  const openaiMessages = toOpenAIMessages(system, messages);
  const body = {
    model,
    max_tokens: maxTokens,
    messages: openaiMessages,
    stream: true,
  };

  const openaiTools = toOpenAITools(tools);
  if (openaiTools) body.tools = openaiTools;

  const headers = { "Content-Type": "application/json" };
  let proxyUrl = PROXY_URL;

  if (provider === "openai") {
    proxyUrl = `${PROXY_URL}?target=openai`;
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (provider === "glm") {
    proxyUrl = `${PROXY_URL}?target=glm`;
    headers.Authorization = `Bearer ${apiKey}`;
    if (baseUrl) headers["x-base-url"] = baseUrl;
  } else if (provider === "custom") {
    // Custom provider: call the endpoint directly (no proxy) to avoid
    // Vercel Edge Function timeout limits on slow/self-hosted models.
    proxyUrl = `${baseUrl}/chat/completions`;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`${provider} API error: ${response.status} ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  // Non-streaming: parse JSON response directly
  if (!body.stream) {
    return parseOpenAIJsonResponse(await response.json(), callbacks);
  }

  return parseOpenAISSEStream(response.body, callbacks);
}

/**
 * Shared SSE line reader — handles chunked reads, timeout, and JSON parsing.
 */
async function readSSELines(body, onChunk) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const STREAM_READ_TIMEOUT = 120_000;
  try {
    while (true) {
      const readPromise = reader.read();
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error("Stream read timeout");
          err.status = 0;
          reject(err);
        }, STREAM_READ_TIMEOUT);
      });
      let result;
      try {
        result = await Promise.race([readPromise, timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
      const { done, value } = result;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }
        onChunk(chunk);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a non-streaming OpenAI JSON response into Anthropic-like content blocks.
 */
function parseOpenAIJsonResponse(json, callbacks) {
  const contentBlocks = [];
  const choice = json.choices?.[0];
  if (!choice) return { contentBlocks, stopReason: "end_turn" };

  const msg = choice.message;
  if (msg?.content) {
    callbacks.onContentBlockStart?.("text");
    callbacks.onTextDelta?.(msg.content);
    contentBlocks.push({ type: "text", text: msg.content });
    callbacks.onContentBlockStop?.("text", msg.content);
  }

  if (msg?.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      let args = {};
      try { args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch {}
      const block = { type: "tool_use", id: tc.id, name: tc.function.name, input: args };
      callbacks.onContentBlockStart?.("tool_use", block);
      contentBlocks.push(block);
      callbacks.onContentBlockStop?.("tool_use", block);
    }
  }

  let stopReason = "end_turn";
  if (choice.finish_reason === "length") stopReason = "max_tokens";
  else if (choice.finish_reason === "tool_calls") stopReason = "tool_use";

  return { contentBlocks, stopReason };
}

/**
 * Parse OpenAI-format SSE stream and normalize to Anthropic-like content blocks.
 */
async function parseOpenAISSEStream(body, callbacks) {
  const contentBlocks = [];
  let textChunks = [];
  let hasText = false;
  const toolCallMap = new Map();
  let stopReason = "stream_incomplete";

  await readSSELines(body, (chunk) => {
    const choice = chunk.choices?.[0];
    if (!choice) return;

    const delta = choice.delta;
    if (!delta) return;

    // Text content
    if (delta.content) {
      if (!hasText) {
        hasText = true;
        callbacks.onContentBlockStart?.("text");
      }
      textChunks.push(delta.content);
      callbacks.onTextDelta?.(delta.content);
    }

    // Tool calls
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallMap.has(idx)) {
          toolCallMap.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: "" });
          if (tc.function?.name) callbacks.onToolUseStart?.(tc.function.name);
        }
        const existing = toolCallMap.get(idx);
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
      }
    }

    // Stop reason
    if (choice.finish_reason) {
      if (choice.finish_reason === "stop") stopReason = "end_turn";
      else if (choice.finish_reason === "tool_calls") stopReason = "tool_use";
      else if (choice.finish_reason === "length") stopReason = "max_tokens";
      else stopReason = choice.finish_reason;
    }
  });

  // Flush text
  if (textChunks.length > 0) {
    const fullText = textChunks.join("");
    contentBlocks.push({ type: "text", text: fullText });
    callbacks.onContentBlockStop?.("text", fullText);
  }

  // Flush tool calls
  for (const [, tc] of toolCallMap) {
    let parsedInput = {};
    let parseError = null;
    try {
      parsedInput = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch {
      console.warn(`[llmClient] Incomplete tool_use JSON for ${tc.name}: ${(tc.arguments || "").slice(0, 100)}...`);
      parsedInput = {};
      parseError = `Tool "${tc.name}"의 인자 JSON이 불완전합니다 (스트림 절단).`;
    }
    const block = {
      type: "tool_use",
      id: tc.id || `call_${crypto.randomUUID().slice(0, 8)}`,
      name: tc.name,
      input: parsedInput,
    };
    if (parseError) block._parseError = parseError;
    contentBlocks.push(block);
    callbacks.onContentBlockStop?.("tool_use", { id: tc.id, name: tc.name, input: parsedInput });
  }

  return { contentBlocks, stopReason };
}

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

/**
 * Convert Anthropic-format messages to Gemini format.
 */
function toGeminiContents(messages) {
  const contents = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";

    if (Array.isArray(msg.content)) {
      const parts = [];

      for (const block of msg.content) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "tool_use") {
          parts.push({
            functionCall: { name: block.name, args: block.input },
          });
        } else if (block.type === "tool_result") {
          parts.push({
            functionResponse: {
              name: block.tool_use_id,
              response: { result: typeof block.content === "string" ? block.content : JSON.stringify(block.content) },
            },
          });
        }
      }

      // tool_result blocks in user messages
      if (msg.role === "user") {
        const toolResults = msg.content.filter(b => b.type === "tool_result");
        if (toolResults.length > 0) {
          const trParts = [];
          for (const tr of toolResults) {
            // Handle image content blocks for vision-capable Gemini models
            if (Array.isArray(tr.content)) {
              // Extract text and image parts, then wrap in functionResponse
              let textContent = "";
              for (const block of tr.content) {
                if (block.type === "text") {
                  textContent += block.text;
                } else if (block.type === "image" && block.source?.type === "base64") {
                  // Gemini supports inline_data for images
                  trParts.push({
                    inline_data: {
                      mime_type: block.source.media_type,
                      data: block.source.data,
                    },
                  });
                }
              }
              trParts.push({
                functionResponse: {
                  name: tr.tool_use_id,
                  response: { result: textContent || "ok" },
                },
              });
            } else {
              trParts.push({
                functionResponse: {
                  name: tr.tool_use_id,
                  response: { result: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content) },
                },
              });
            }
          }
          contents.push({ role: "user", parts: trParts });
          continue;
        }
      }

      if (parts.length > 0) contents.push({ role, parts });
    } else if (typeof msg.content === "string") {
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  return contents;
}

/**
 * Convert Anthropic tool definitions to Gemini function declarations.
 */
function toGeminiTools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

/**
 * Call Gemini API with SSE streaming.
 */
async function callGemini({
  apiKey,
  model,
  maxTokens,
  system,
  messages,
  tools,
  signal,
  callbacks = {},
}) {
  const contents = toGeminiContents(messages);
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const geminiTools = toGeminiTools(tools);
  if (geminiTools) body.tools = geminiTools;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "x-model": model,
  };

  const response = await fetch(`${PROXY_URL}?target=gemini`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Gemini API error: ${response.status} ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  return parseGeminiSSEStream(response.body, callbacks);
}

/**
 * Parse Gemini SSE stream and normalize to Anthropic-like content blocks.
 */
async function parseGeminiSSEStream(body, callbacks) {
  const contentBlocks = [];
  let textChunks = [];
  let hasText = false;
  let stopReason = "stream_incomplete";

  await readSSELines(body, (chunk) => {
    const candidates = chunk.candidates;
    if (!candidates?.length) return;

    const candidate = candidates[0];
    const parts = candidate.content?.parts || [];

    for (const part of parts) {
      if (part.text) {
        if (!hasText) {
          hasText = true;
          callbacks.onContentBlockStart?.("text");
        }
        textChunks.push(part.text);
        callbacks.onTextDelta?.(part.text);
      }

      if (part.functionCall) {
        const fc = part.functionCall;
        callbacks.onToolUseStart?.(fc.name);
        const toolBlock = {
          type: "tool_use",
          id: `gemini_${crypto.randomUUID().slice(0, 8)}`,
          name: fc.name,
          input: fc.args || {},
        };
        contentBlocks.push(toolBlock);
        callbacks.onContentBlockStop?.("tool_use", toolBlock);
      }
    }

    // Check finish reason
    if (candidate.finishReason) {
      if (candidate.finishReason === "STOP") stopReason = "end_turn";
      else if (candidate.finishReason === "MAX_TOKENS") stopReason = "max_tokens";
      else stopReason = "end_turn";
    }
  });

  // Flush text (unshift — Gemini puts text before tool blocks)
  if (textChunks.length > 0) {
    const fullText = textChunks.join("");
    contentBlocks.unshift({ type: "text", text: fullText });
    callbacks.onContentBlockStop?.("text", fullText);
  }

  return { contentBlocks, stopReason };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function createValidator({ url, headers, body, successStatuses = [200], earlyCheck }) {
  return async function validate(apiKey, config = {}) {
    if (earlyCheck) {
      const earlyError = earlyCheck(apiKey, config);
      if (earlyError) return earlyError;
    }
    try {
      const response = await fetch(url(apiKey, config), {
        method: "POST",
        headers: headers(apiKey, config),
        body: JSON.stringify(body(apiKey, config)),
      });
      if (response.ok || successStatuses.includes(response.status)) return { valid: true, error: null };
      if (response.status === 401 || response.status === 403) return { valid: false, error: "Invalid API key" };
      const text = await response.text();
      return { valid: false, error: `API error (${response.status}): ${text.slice(0, 200)}` };
    } catch (err) {
      return { valid: false, error: `Connection failed: ${err.message}` };
    }
  };
}

const validateOpenAIKey = createValidator({
  url: () => `${PROXY_URL}?target=openai`,
  headers: (apiKey) => ({ "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }),
  body: () => ({ model: "gpt-4o-mini", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
  successStatuses: [200, 400],
});

const validateGeminiKey = createValidator({
  url: () => `${PROXY_URL}?target=gemini`,
  headers: (apiKey) => ({ "Content-Type": "application/json", "x-api-key": apiKey, "x-model": "gemini-2.0-flash" }),
  body: () => ({ contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } }),
  successStatuses: [200, 400],
});

const validateGLMKey = createValidator({
  url: () => `${PROXY_URL}?target=glm`,
  headers: (apiKey, config) => {
    const endpoint = config.endpoint || "open.bigmodel.cn";
    return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "x-base-url": `https://${endpoint}/api/paas/v4` };
  },
  body: () => ({ model: "glm-4-flash", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
  successStatuses: [200, 400],
});

const validateCustom = createValidator({
  url: (_, config) => `${config.base_url.replace(/\/+$/, "")}/chat/completions`,
  headers: (apiKey) => {
    const h = { "Content-Type": "application/json" };
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    return h;
  },
  body: (_, config) => ({ model: config.model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
  successStatuses: [200, 400],
  earlyCheck: (apiKey, config) => {
    if (!config.base_url) return { valid: false, error: "Base URL is required" };
    if (!config.model) return { valid: false, error: "Model name is required" };
    return null;
  },
});
