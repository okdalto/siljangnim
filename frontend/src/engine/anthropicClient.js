/**
 * Anthropic API streaming client — replaces executor.py._call_anthropic().
 *
 * Uses fetch() + ReadableStream to parse SSE from Anthropic's Messages API.
 * Routes through Vercel Edge Function proxy to avoid CORS issues.
 */

const PROXY_URL = "/api/proxy";

/**
 * Call the Anthropic Messages API with streaming.
 *
 * @param {Object} params
 * @param {string} params.apiKey - Anthropic API key
 * @param {string} params.model - Model name (e.g. "claude-sonnet-4-6")
 * @param {number} params.maxTokens - Max tokens to generate
 * @param {string} params.system - System prompt
 * @param {Array} params.messages - Conversation messages (Anthropic format)
 * @param {Array} params.tools - Tool definitions
 * @param {AbortSignal} [params.signal] - AbortController signal for cancellation
 * @param {Object} [params.callbacks] - Streaming callbacks
 * @param {Function} [params.callbacks.onThinkingDelta] - (chunk: string) => void
 * @param {Function} [params.callbacks.onTextDelta] - (chunk: string) => void
 * @param {Function} [params.callbacks.onToolUseStart] - (name: string) => void
 * @param {Function} [params.callbacks.onContentBlockStop] - (type: string, data: any) => void
 *
 * @returns {Promise<{contentBlocks: Array, stopReason: string}>}
 */
export async function callAnthropic({
  apiKey,
  model,
  maxTokens,
  system,
  messages,
  tools,
  signal,
  callbacks = {},
}) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    tools,
    stream: true,
  };

  // Enable adaptive thinking for supported models
  if (model.includes("opus") || model.includes("sonnet")) {
    body.thinking = { type: "adaptive" };
  }

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Anthropic API error: ${response.status} ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  return parseSSEStream(response.body, callbacks);
}

/**
 * Parse Anthropic SSE stream and collect content blocks.
 */
async function parseSSEStream(body, callbacks) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Accumulate content blocks
  const contentBlocks = [];
  let currentBlockIndex = -1;
  let currentBlockType = null;
  let thinkingChunks = [];
  let textChunks = [];
  let toolInput = "";
  let toolId = "";
  let toolName = "";
  let stopReason = "end_turn";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        switch (event.type) {
          case "message_start":
            // Nothing to process
            break;

          case "content_block_start": {
            currentBlockIndex = event.index;
            const block = event.content_block;
            currentBlockType = block.type;

            if (block.type === "thinking") {
              thinkingChunks = [];
              callbacks.onContentBlockStart?.("thinking");
            } else if (block.type === "text") {
              textChunks = [];
              callbacks.onContentBlockStart?.("text");
            } else if (block.type === "tool_use") {
              toolId = block.id;
              toolName = block.name;
              toolInput = "";
              callbacks.onToolUseStart?.(block.name);
            }
            break;
          }

          case "content_block_delta": {
            const delta = event.delta;
            if (delta.type === "thinking_delta") {
              thinkingChunks.push(delta.thinking);
              callbacks.onThinkingDelta?.(delta.thinking);
            } else if (delta.type === "text_delta") {
              textChunks.push(delta.text);
              callbacks.onTextDelta?.(delta.text);
            } else if (delta.type === "input_json_delta") {
              toolInput += delta.partial_json;
            }
            break;
          }

          case "content_block_stop": {
            if (currentBlockType === "thinking") {
              const fullThinking = thinkingChunks.join("");
              contentBlocks.push({
                type: "thinking",
                thinking: fullThinking,
              });
              callbacks.onContentBlockStop?.("thinking", fullThinking);
            } else if (currentBlockType === "text") {
              const fullText = textChunks.join("");
              contentBlocks.push({
                type: "text",
                text: fullText,
              });
              callbacks.onContentBlockStop?.("text", fullText);
            } else if (currentBlockType === "tool_use") {
              let parsedInput = {};
              try {
                parsedInput = toolInput ? JSON.parse(toolInput) : {};
              } catch {
                // Partial JSON from interrupted stream
                parsedInput = {};
              }
              contentBlocks.push({
                type: "tool_use",
                id: toolId,
                name: toolName,
                input: parsedInput,
              });
              callbacks.onContentBlockStop?.("tool_use", { id: toolId, name: toolName, input: parsedInput });
            }
            currentBlockType = null;
            break;
          }

          case "message_delta": {
            if (event.delta?.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
            break;
          }

          case "message_stop":
            // Stream complete
            break;

          case "error": {
            const error = new Error(event.error?.message || "Anthropic stream error");
            error.type = event.error?.type;
            throw error;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { contentBlocks, stopReason };
}

/**
 * Validate an API key by making a small test request.
 */
export async function validateApiKey(apiKey) {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (response.ok) return { valid: true, error: null };

    const text = await response.text();
    if (response.status === 401) {
      return { valid: false, error: "Invalid API key" };
    }
    // 400/other errors with valid auth still mean the key works
    if (response.status === 400) {
      return { valid: true, error: null };
    }
    return { valid: false, error: `API error: ${response.status} ${text.slice(0, 200)}` };
  } catch (err) {
    return { valid: false, error: `Connection failed: ${err.message}` };
  }
}
