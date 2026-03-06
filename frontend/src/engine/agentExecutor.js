/**
 * Agent execution loop — ported from executor.py.
 *
 * Anthropic-only. Loop: LLM call → tool execution → result feedback → repeat.
 * Conversation history management + compaction.
 * Loop detection (3 warn, 5 break).
 */

import { callAnthropic } from "./anthropicClient.js";
import { buildSystemPrompt } from "./agentPrompts.js";
import TOOLS from "./agentTools.js";
import { handleTool } from "./toolHandlers.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TURNS = 30;
const MAX_COMPACT_RETRIES = 2;
const MAX_OVERLOAD_RETRIES = 5;
const LOOP_WARN_THRESHOLD = 3;
const LOOP_BREAK_THRESHOLD = 5;

// Model configuration
const MODEL_COMPLEX = "claude-sonnet-4-6";
const MODEL_COMPLEX_MAX = 16384;
const MODEL_THINKING_MAX = 32000; // with explicit budget: ~10k thinking + ~22k output

// ---------------------------------------------------------------------------
// Conversation compaction
// ---------------------------------------------------------------------------

function stripThinking(messages) {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if (!Array.isArray(msg.content)) continue;
    const filtered = msg.content.filter(
      (block) => !(typeof block === "object" && block.type === "thinking")
    );
    msg.content = filtered.length ? filtered : [{ type: "text", text: "(continued)" }];
  }
}

function compactMessages(messages) {
  const TRUNC = 200;
  const SAFE_TOKENS = 120000;

  stripThinking(messages);

  for (const msg of messages) {
    const content = msg.content;
    if (!Array.isArray(content)) {
      if (typeof content === "string" && content.length > 10000) {
        msg.content = content.slice(0, 10000) + "\n...(truncated)";
      }
      continue;
    }

    for (const block of content) {
      if (typeof block !== "object") continue;
      if (block.type === "tool_use" && typeof block.input === "object") {
        for (const key of Object.keys(block.input)) {
          if (typeof block.input[key] === "string" && block.input[key].length > TRUNC) {
            block.input[key] = block.input[key].slice(0, TRUNC) + "...(truncated)";
          }
        }
      }
      if (block.type === "tool_result" && typeof block.content === "string") {
        if (block.content.length > TRUNC) {
          block.content = block.content.slice(0, TRUNC) + "...(truncated)";
        }
      }
    }
  }

  // Progressively trim old turns
  let keepRecent = 6;
  while (messages.length > 4) {
    const est = JSON.stringify(messages).length / 4;
    if (est <= SAFE_TOKENS) break;
    const kept = [messages[0], ...messages.slice(-keepRecent)];
    if (kept.length >= messages.length) break;
    messages.length = 0;
    messages.push(...kept);
    keepRecent = Math.max(2, keepRecent - 2);
  }
}

// ---------------------------------------------------------------------------
// Multimodal content builder
// ---------------------------------------------------------------------------

function buildMultimodalContent(userPrompt, files) {
  const descs = files.map(
    (f) =>
      `[Uploaded file: ${f.name} (${f.size} bytes, ${f.mime_type}) — ` +
      `use read_file tool with path='uploads/${f.name}' to read its contents. ` +
      `The file is accessible at /api/uploads/${f.name}]`
  );
  let text = userPrompt || "The user uploaded these files.";
  if (descs.length) text += "\n\n" + descs.join("\n");
  return [{ type: "text", text }];
}

// ---------------------------------------------------------------------------
// Main agent loop
// ---------------------------------------------------------------------------

/**
 * Run the agent for one user prompt.
 *
 * @param {Object} params
 * @param {string} params.apiKey - Anthropic API key
 * @param {string} params.userPrompt - User's message
 * @param {Function} params.log - (agent, message, level) => void
 * @param {Function} params.broadcast - (msg) => void
 * @param {Function} [params.onText] - (text) => void
 * @param {Function} [params.onStatus] - (statusType, detail) => void
 * @param {Array} [params.files] - Uploaded files
 * @param {Array} params.messages - Conversation history (mutated in-place)
 * @param {Object} params.errorCollector - Browser error collector
 * @param {Function} params.userAnswerPromise - Returns promise that resolves with user answer
 * @param {AbortSignal} [params.signal] - For cancellation
 * @param {Array} [params.injectedMessages] - Queue of injected user messages
 * @returns {Promise<{chatText: string}>}
 */
export async function runAgent({
  apiKey,
  userPrompt,
  log,
  broadcast,
  onText,
  onStatus,
  files,
  messages,
  errorCollector,
  userAnswerPromise,
  signal,
  injectedMessages = [],
}) {
  log("System", `Starting agent for: "${userPrompt}"`, "info");
  if (files?.length) {
    log("System", `Files attached: ${files.map((f) => f.name).join(", ")}`, "info");
  }

  const modelName = MODEL_COMPLEX;
  const useThinking = modelName.includes("opus") || modelName.includes("sonnet");
  const maxTokens = useThinking ? MODEL_THINKING_MAX : MODEL_COMPLEX_MAX;

  log("System", `Model: ${modelName}`, "info");

  const systemPrompt = buildSystemPrompt(userPrompt, !!files?.length);

  // Build user message content
  const content = files?.length
    ? buildMultimodalContent(userPrompt, files)
    : userPrompt;

  messages.push({ role: "user", content });

  let lastText = "";
  let turns = 0;
  let compactRetries = 0;
  let overloadRetries = 0;
  const recentToolSigs = [];

  try {
    while (turns < MAX_TURNS) {
      turns++;

      // Check cancellation
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // Pre-flight compaction
      const estTokens = JSON.stringify(messages).length / 4;
      const compactThreshold = 150000;
      if (estTokens > compactThreshold) {
        log("System", `Estimated ~${Math.round(estTokens)} tokens — compacting...`, "info");
        onStatus?.("thinking", "Compacting conversation...");
        compactMessages(messages);
      }

      // Sanitize: remove empty messages
      const cleaned = messages.filter(
        (m) => m.content != null && m.content !== "" && !(Array.isArray(m.content) && m.content.length === 0)
      );
      messages.length = 0;
      messages.push(...cleaned);

      // --- Call Anthropic ---
      let contentBlocks, stopReason;
      let thinkingBuffer = "";
      try {
        const result = await callAnthropic({
          apiKey,
          model: modelName,
          maxTokens,
          system: systemPrompt,
          messages,
          tools: TOOLS,
          signal,
          callbacks: {
            onThinkingDelta(chunk) {
              thinkingBuffer += chunk;
              onStatus?.("thinking", thinkingBuffer);
            },
            onTextDelta(chunk) {
              // Text deltas are accumulated; final text handled below
            },
            onToolUseStart(name) {
              onStatus?.("tool_use", name);
            },
            onContentBlockStop(type, data) {
              if (type === "thinking") {
                thinkingBuffer = "";
                log("Agent", data, "thinking");
              }
            },
          },
        });
        contentBlocks = result.contentBlocks;
        stopReason = result.stopReason;
      } catch (err) {
        // Handle specific API errors
        if (err.name === "AbortError") throw err;

        const errMsg = (err.message || "").toLowerCase();
        const status = err.status || 0;

        // Overloaded / rate limited
        if (status === 529 || status === 429 || errMsg.includes("overloaded") || errMsg.includes("rate_limit")) {
          overloadRetries++;
          if (overloadRetries > MAX_OVERLOAD_RETRIES) {
            log("System", `API overloaded after ${MAX_OVERLOAD_RETRIES} retries`, "error");
            throw err;
          }
          const delay = Math.min(2 ** overloadRetries, 30);
          log("System", `API overloaded — retrying in ${delay}s...`, "info");
          onStatus?.("thinking", `Server busy, retrying in ${delay}s...`);
          await sleep(delay * 1000, signal);
          continue;
        }

        // Context too long
        if (errMsg.includes("prompt is too long") || errMsg.includes("too long")) {
          compactRetries++;
          if (compactRetries > MAX_COMPACT_RETRIES) {
            log("System", "Context too long after compaction", "error");
            throw err;
          }
          log("System", "Context too long — compacting...", "info");
          onStatus?.("thinking", "Compacting conversation...");
          compactMessages(messages);
          continue;
        }

        // Server errors
        if (status >= 500) {
          overloadRetries++;
          if (overloadRetries > MAX_OVERLOAD_RETRIES) throw err;
          const delay = Math.min(2 ** overloadRetries, 30);
          log("System", `Server error — retrying in ${delay}s...`, "info");
          onStatus?.("thinking", `Server error, retrying in ${delay}s...`);
          await sleep(delay * 1000, signal);
          continue;
        }

        throw err;
      }

      // Handle empty response — retry once, then give up
      if (!contentBlocks || !contentBlocks.length) {
        overloadRetries++;
        if (overloadRetries > 2) {
          log("System", `Empty response after retries — stopping`, "warning");
          break;
        }
        log("System", `Empty response — retrying (${overloadRetries}/2)...`, "warning");
        await sleep(2000, signal);
        continue;
      }

      // Process content blocks
      for (const block of contentBlocks) {
        if (block.type === "text" && block.text?.trim()) {
          lastText = block.text;
          log("Agent", block.text, "info");
          onText?.(block.text);
        } else if (block.type === "tool_use") {
          const inputStr = JSON.stringify(block.input);
          const preview = inputStr.length > 200 ? inputStr.slice(0, 200) + "..." : inputStr;
          log("Agent", `Tool: ${block.name}(${preview})`, "thinking");
          onStatus?.("tool_use", block.name);
        }
      }

      // Append assistant message to history (strip thinking blocks —
      // they've been logged already and keeping them risks signature
      // validation errors on subsequent API calls after compaction)
      const storedBlocks = contentBlocks.filter(b => b.type !== "thinking");

      // If the model only produced thinking (no text/tool_use), ask it to continue
      if (!storedBlocks.length && stopReason !== "max_tokens") {
        compactRetries++;
        if (compactRetries <= MAX_COMPACT_RETRIES) {
          log("System", "Thinking only — nudging model to produce output...", "info");
          messages.push({
            role: "assistant",
            content: [{ type: "text", text: "(continued)" }],
          });
          messages.push({
            role: "user",
            content: "You only produced thinking but no visible output. Please continue and produce your response (text or tool calls).",
          });
          continue;
        }
      }

      messages.push({
        role: "assistant",
        content: storedBlocks.length ? storedBlocks : [{ type: "text", text: "(continued)" }],
      });

      // Handle max_tokens
      if (stopReason === "max_tokens") {
        compactRetries++;
        if (compactRetries > MAX_COMPACT_RETRIES) {
          log("System", "Max compact retries — using partial response", "info");
          break;
        }
        log("System", "Token limit — compacting...", "info");
        onStatus?.("thinking", "Compacting conversation...");
        compactMessages(messages);
        messages.push({
          role: "user",
          content: "You were cut off due to token limit. Continue where you left off.",
        });
        continue;
      }

      // If no tool calls, we're done (or check injected messages)
      if (stopReason !== "tool_use") {
        // Check for injected messages
        if (injectedMessages.length) {
          const combined = injectedMessages.splice(0).join("\n\n");
          log("System", "Injecting user message", "info");
          messages.push({ role: "user", content: `[User message]: ${combined}` });
          continue;
        }
        break;
      }

      // --- Execute tool calls ---
      const toolBlocks = contentBlocks.filter((b) => b.type === "tool_use");
      const toolResults = [];

      for (const block of toolBlocks) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        onStatus?.("thinking", `Running ${block.name}...`);

        let resultStr;
        let isError = false;
        try {
          resultStr = await handleTool(block.name, block.input, broadcast, {
            errorCollector,
            userAnswerPromise,
          });
          if (resultStr?.startsWith("Error")) isError = true;
        } catch (e) {
          resultStr = `Error executing tool '${block.name}': ${e.message}`;
          isError = true;
          log("System", resultStr, "error");
        }

        const tr = {
          type: "tool_result",
          tool_use_id: block.id,
          content: resultStr || "(empty result)",
        };
        if (isError) tr.is_error = true;
        toolResults.push(tr);

        // Status preview
        const preview = (resultStr || "").slice(0, 120);
        onStatus?.("thinking", isError ? `${block.name} → Error: ${preview}` : `${block.name} → ${preview}`);

        // Loop detection
        const inputKey = JSON.stringify(block.input, Object.keys(block.input).sort());
        const sig = `${block.name}|${hashCode(inputKey)}`;
        recentToolSigs.push(sig);
      }

      // Append tool results as user message
      messages.push({ role: "user", content: toolResults });

      // --- Loop detection ---
      const last10 = recentToolSigs.slice(-10);
      const sigCounts = {};
      for (const s of last10) sigCounts[s] = (sigCounts[s] || 0) + 1;
      const maxCount = Math.max(0, ...Object.values(sigCounts));

      if (maxCount >= LOOP_BREAK_THRESHOLD) {
        log("System", `Loop detected (${maxCount} identical calls) — stopping`, "warning");
        // Inject warning and let model respond
        messages.push({
          role: "user",
          content: "SYSTEM: You are in an infinite loop calling the same tool repeatedly. STOP calling tools and respond to the user with what you have so far.",
        });
        break;
      }
      if (maxCount >= LOOP_WARN_THRESHOLD) {
        // Inject warning as a separate user message (not a fake tool_result,
        // which the API rejects if there's no matching tool_use)
        messages.push({
          role: "user",
          content: `WARNING: You have called the same tool ${maxCount} times. If you are stuck in a loop, try a different approach or respond to the user with what you have.`,
        });
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      log("System", "Agent cancelled by user", "info");
    } else {
      throw err;
    }
  }

  return { chatText: lastText };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
