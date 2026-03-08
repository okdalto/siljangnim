/**
 * Agent execution loop — ported from executor.py.
 *
 * Anthropic-only. Loop: LLM call → tool execution → result feedback → repeat.
 * Conversation history management + compaction.
 * Loop detection (3 warn, 5 break).
 */

import { callAnthropic } from "./anthropicClient.js";

/** Build a markdown section describing the client environment. */
function getEnvironmentSection() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMac = /Macintosh/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isLinux = /Linux/i.test(ua) && !isAndroid;
  const hasTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const platform = isIOS ? "iOS" : isAndroid ? "Android" : isMac ? "macOS" : isWindows ? "Windows" : isLinux ? "Linux" : "unknown";
  const screenW = typeof screen !== "undefined" ? screen.width : 0;
  const screenH = typeof screen !== "undefined" ? screen.height : 0;
  const dpr = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1;

  return `\n\n## CLIENT ENVIRONMENT
- **Platform**: ${platform}${isMobile ? " (mobile)" : " (desktop)"}
- **Touch support**: ${hasTouch ? "yes" : "no"}${hasTouch ? " — use ctx.mouse for touch input (touch maps to mouse)" : ""}
- **Screen**: ${screenW}×${screenH} @ ${dpr}x DPR
- **Note**: ${isMobile
    ? "This is a mobile device. Prefer touch-friendly interactions (drag, swipe, tap). Avoid hover-dependent effects. Keep performance in mind — use simpler shaders when possible."
    : "Desktop environment with mouse and keyboard. ctx.mouse and ctx.keys are available."}`;
}
import { buildSystemPrompt } from "./agentPrompts.js";
import TOOLS from "./agentTools.js";
import { handleTool } from "./toolHandlers.js";
import {
  shouldPlan,
  buildPlannerMessages,
  parsePlan,
  buildExecutionContext,
  PLANNER_SYSTEM,
  PLANNER_MODEL,
  PLANNER_MAX_TOKENS,
} from "./executionContext.js";

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
  systemPromptAddition = "",
  assetContext = [],
  backendTarget = "auto",
  modelOverride,
}) {
  log("System", `Starting agent for: "${userPrompt}"`, "info");
  if (files?.length) {
    log("System", `Files attached: ${files.map((f) => f.name).join(", ")}`, "info");
  }

  let systemPrompt = buildSystemPrompt(userPrompt, !!files?.length);
  if (systemPromptAddition) {
    systemPrompt += "\n\n" + systemPromptAddition;
  }

  // Inject backend target if available
  if (backendTarget && backendTarget !== "auto") {
    systemPrompt += `\n\n## ACTIVE BACKEND TARGET\nThe current project uses **${backendTarget}** backend. Generate ${backendTarget === "webgpu" ? "WGSL" : "GLSL"} shaders accordingly. Follow the ${backendTarget === "webgpu" ? "WGSL" : "GLSL"} rules strictly.`;
  }

  // Inject matching technique hints
  if (userPrompt) {
    try {
      const { findTechniques } = await import("./techniqueKnowledgeBase.js");
      const matches = findTechniques(userPrompt);
      if (matches.length > 0) {
        const top3 = matches.slice(0, 3);
        const hints = top3.map(t => `- **${t.name}** (${t.category}): ${t.description?.slice(0, 100) || t.summary?.slice(0, 100) || ""}`).join("\n");
        systemPrompt += `\n\n## SUGGESTED TECHNIQUES\nBased on the user prompt, these techniques from the knowledge base may be relevant:\n${hints}\nConsider using their patterns as a starting point if applicable.`;
      }
    } catch { /* technique matching is non-critical */ }
  }

  // Inject environment info
  systemPrompt += getEnvironmentSection();

  // Inject asset context if available
  if (assetContext.length > 0) {
    const assetLines = assetContext.map((a) => {
      let line = `- "${a.semanticName}" (${a.filename}, ${a.category})`;
      if (a.aiSummary) line += `: ${a.aiSummary}`;
      if (a.processingStatus !== "ready") line += ` [${a.processingStatus}]`;
      return line;
    });
    systemPrompt += `\n\n## WORKSPACE ASSETS\nThe following assets are loaded in the workspace:\n${assetLines.join("\n")}\nUse \`ctx.uploads["filename"]\` to reference them in scripts.`;
  }

  // Build user message content
  const content = files?.length
    ? buildMultimodalContent(userPrompt, files)
    : userPrompt;

  messages.push({ role: "user", content });

  return _runAgentLoop({
    apiKey,
    systemPrompt,
    messages,
    log,
    broadcast,
    onText,
    onStatus,
    errorCollector,
    userAnswerPromise,
    signal,
    injectedMessages,
    modelOverride,
  });
}

/**
 * Core agent loop — shared by both direct runAgent and plan-based runWithPlan.
 */
async function _runAgentLoop({
  apiKey,
  systemPrompt,
  messages,
  log,
  broadcast,
  onText,
  onStatus,
  errorCollector,
  userAnswerPromise,
  signal,
  injectedMessages = [],
  modelOverride,
}) {
  const modelName = modelOverride || MODEL_COMPLEX;
  const useThinking = modelName.includes("opus") || modelName.includes("sonnet");
  const maxTokens = useThinking ? MODEL_THINKING_MAX : MODEL_COMPLEX_MAX;

  log("System", `Model: ${modelName}`, "info");

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

      // Pre-flight compaction (estimate ~3 bytes/token for mixed content including multibyte)
      const estTokens = new Blob([JSON.stringify(messages)]).size / 3;
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

        // Network / stream errors (e.g. mobile browser backgrounded)
        if (status === 0 && (
          errMsg.includes("fetch") || errMsg.includes("network") ||
          errMsg.includes("timeout") || errMsg.includes("failed") ||
          errMsg.includes("terminated") || errMsg.includes("connection")
        )) {
          overloadRetries++;
          if (overloadRetries > MAX_OVERLOAD_RETRIES) throw err;
          // Wait for page to be visible before retrying
          if (document.hidden) {
            log("System", "App backgrounded — will resume when visible...", "info");
            onStatus?.("thinking", "Paused (app in background)...");
            await waitForVisible(signal);
          }
          const delay = Math.min(2 ** overloadRetries, 10);
          log("System", `Connection lost — retrying in ${delay}s...`, "info");
          onStatus?.("thinking", `Reconnecting in ${delay}s...`);
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
// Planner → Execution Context Rebuild → Generator
// ---------------------------------------------------------------------------

/**
 * Run the planner: a single lightweight LLM call that produces a structured
 * execution plan from the conversation context + current workspace state.
 *
 * @returns {Object|null} Parsed plan, or null if planning fails
 */
async function runPlanner({ apiKey, userPrompt, conversation, currentState, log, onStatus, signal }) {
  onStatus?.("thinking", "Planning execution...");
  log("System", "Running planner for execution context rebuild", "info");

  const plannerMessages = buildPlannerMessages(userPrompt, conversation, currentState);

  try {
    const result = await callAnthropic({
      apiKey,
      model: PLANNER_MODEL,
      maxTokens: PLANNER_MAX_TOKENS,
      system: PLANNER_SYSTEM,
      messages: plannerMessages,
      tools: [], // no tools for planner
      signal,
    });

    const textBlock = result.contentBlocks?.find((b) => b.type === "text");
    if (!textBlock?.text) {
      log("System", "Planner returned empty response — falling back to direct execution", "info");
      return null;
    }

    const plan = parsePlan(textBlock.text);
    if (!plan) {
      log("System", "Failed to parse planner output — falling back to direct execution", "info");
      return null;
    }

    log("System", `Plan: [${plan.intent}] ${plan.summary} (${plan.steps.length} steps)`, "info");
    return plan;
  } catch (err) {
    // Planner failure is non-fatal — fall back to direct execution
    log("System", `Planner error: ${err.message} — falling back to direct execution`, "info");
    return null;
  }
}

/**
 * Plan-then-execute: run the planner to produce a plan, rebuild the execution
 * context, then run the generator with a fresh conversation.
 *
 * Falls back to normal runAgent if planning fails or isn't needed.
 */
export async function runWithPlan({
  apiKey,
  userPrompt,
  log,
  broadcast,
  onText,
  onStatus,
  files,
  messages, // original conversation (mutated)
  currentState, // { scene_json, ui_config, panels, assets }
  errorCollector,
  userAnswerPromise,
  signal,
  injectedMessages = [],
  systemPromptAddition = "",
  assetContext = [],
  backendTarget = "auto",
  modelOverride,
}) {
  // Check if planning is warranted
  if (!shouldPlan(messages.length, userPrompt)) {
    return runAgent({
      apiKey, userPrompt, log, broadcast, onText, onStatus,
      files, messages, errorCollector, userAnswerPromise,
      signal, injectedMessages, systemPromptAddition, assetContext, backendTarget, modelOverride,
    });
  }

  // --- Phase 1: Plan ---
  const plan = await runPlanner({
    apiKey, userPrompt, conversation: messages, currentState,
    log, onStatus, signal,
  });

  if (!plan) {
    // Fallback: direct execution
    return runAgent({
      apiKey, userPrompt, log, broadcast, onText, onStatus,
      files, messages, errorCollector, userAnswerPromise,
      signal, injectedMessages, systemPromptAddition, assetContext, backendTarget, modelOverride,
    });
  }

  // --- Phase 2: Rebuild execution context ---
  onStatus?.("thinking", "Rebuilding execution context...");

  let baseSystemPrompt = buildSystemPrompt(userPrompt, !!files?.length);
  if (systemPromptAddition) {
    baseSystemPrompt += "\n\n" + systemPromptAddition;
  }

  // Inject backend target if available
  if (backendTarget && backendTarget !== "auto") {
    baseSystemPrompt += `\n\n## ACTIVE BACKEND TARGET\nThe current project uses **${backendTarget}** backend. Generate ${backendTarget === "webgpu" ? "WGSL" : "GLSL"} shaders accordingly. Follow the ${backendTarget === "webgpu" ? "WGSL" : "GLSL"} rules strictly.`;
  }

  // Inject matching technique hints
  if (userPrompt) {
    try {
      const { findTechniques } = await import("./techniqueKnowledgeBase.js");
      const matches = findTechniques(userPrompt);
      if (matches.length > 0) {
        const top3 = matches.slice(0, 3);
        const hints = top3.map(t => `- **${t.name}** (${t.category}): ${t.description?.slice(0, 100) || t.summary?.slice(0, 100) || ""}`).join("\n");
        baseSystemPrompt += `\n\n## SUGGESTED TECHNIQUES\nBased on the user prompt, these techniques from the knowledge base may be relevant:\n${hints}\nConsider using their patterns as a starting point if applicable.`;
      }
    } catch { /* technique matching is non-critical */ }
  }

  // Inject environment info
  baseSystemPrompt += getEnvironmentSection();

  if (assetContext.length > 0) {
    const assetLines = assetContext.map((a) => {
      let line = `- "${a.semanticName}" (${a.filename}, ${a.category})`;
      if (a.aiSummary) line += `: ${a.aiSummary}`;
      if (a.processingStatus !== "ready") line += ` [${a.processingStatus}]`;
      return line;
    });
    baseSystemPrompt += `\n\n## WORKSPACE ASSETS\n${assetLines.join("\n")}`;
  }

  const { systemPrompt: execSystemPrompt, messages: execMessages } =
    buildExecutionContext(plan, currentState, baseSystemPrompt);

  // --- Phase 3: Run generator with rebuilt context ---
  // We still append user message to the ORIGINAL conversation for history,
  // but the generator runs on a FRESH message array.
  const content = files?.length
    ? buildMultimodalContent(userPrompt, files)
    : userPrompt;
  messages.push({ role: "user", content });

  log("System", "Execution context rebuilt — running generator", "info");

  // Run the generator loop using the fresh execution context
  const result = await _runAgentLoop({
    apiKey,
    systemPrompt: execSystemPrompt,
    messages: execMessages,
    log,
    broadcast,
    onText,
    onStatus,
    errorCollector,
    userAnswerPromise,
    signal,
    injectedMessages,
    modelOverride,
  });

  // Sync final assistant response back to the original conversation
  // so future planners can see what was done
  const lastAssistant = execMessages.filter((m) => m.role === "assistant").pop();
  if (lastAssistant) {
    messages.push(lastAssistant);
  }

  return result;
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

function waitForVisible(signal) {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => document.removeEventListener("visibilitychange", handler);
    const handler = () => {
      if (!document.hidden) {
        cleanup();
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      }
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    document.addEventListener("visibilitychange", handler);
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function hashCode(str) {
  // FNV-1a 32-bit hash — better distribution than djb2 for collision resistance
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
