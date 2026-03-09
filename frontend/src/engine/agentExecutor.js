/**
 * Agent execution loop — ported from executor.py.
 *
 * Anthropic-only. Loop: LLM call → tool execution → result feedback → repeat.
 * Conversation history management + compaction.
 * Loop detection (3 warn, 5 break).
 */

import { callAnthropic } from "./anthropicClient.js";
import { classifyApiError } from "./agentErrorHandler.js";
import { detectToolLoop } from "./agentLoopDetector.js";

/** Detect platform type for prompt section filtering. */
function detectPlatformType() {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua) ? "web-mobile" : "web-desktop";
}

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

/**
 * Build an augmented system prompt by injecting backend target, technique hints,
 * environment info, and asset context into a base system prompt.
 */
async function buildAugmentedSystemPrompt(basePrompt, { userPrompt, backendTarget, assetContext = [], systemPromptAddition = "" } = {}) {
  let prompt = basePrompt;

  if (systemPromptAddition) {
    prompt += "\n\n" + systemPromptAddition;
  }

  // Inject backend target if available
  if (backendTarget && backendTarget !== "auto") {
    prompt += `\n\n## ACTIVE BACKEND TARGET\nThe current project uses **${backendTarget}** backend. Generate ${backendTarget === "webgpu" ? "WGSL" : "GLSL"} shaders accordingly. Follow the ${backendTarget === "webgpu" ? "WGSL" : "GLSL"} rules strictly.`;
  }

  // Inject matching technique hints
  if (userPrompt) {
    try {
      const { findTechniques } = await import("./techniqueKnowledgeBase.js");
      const matches = findTechniques(userPrompt);
      if (matches.length > 0) {
        const top3 = matches.slice(0, 3);
        const hints = top3.map(t => `- **${t.name}** (${t.category}): ${t.description?.slice(0, 100) || t.summary?.slice(0, 100) || ""}`).join("\n");
        prompt += `\n\n## SUGGESTED TECHNIQUES\nBased on the user prompt, these techniques from the knowledge base may be relevant:\n${hints}\nConsider using their patterns as a starting point if applicable.`;
      }
    } catch { /* technique matching is non-critical */ }
  }

  // Inject environment info
  prompt += getEnvironmentSection();

  // Inject asset context if available
  if (assetContext.length > 0) {
    const assetLines = assetContext.map((a) => {
      let line = `- "${a.semanticName}" (${a.filename}, ${a.category})`;
      if (a.aiSummary) line += `: ${a.aiSummary}`;
      if (a.processingStatus !== "ready") line += ` [${a.processingStatus}]`;
      return line;
    });
    prompt += `\n\n## WORKSPACE ASSETS\nThe following assets are loaded in the workspace:\n${assetLines.join("\n")}\nUse \`ctx.uploads["filename"]\` to reference them in scripts.`;
  }

  // Detect user language and enforce matching response language.
  // Placed at the end of the system prompt for maximum adherence.
  if (userPrompt) {
    const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(userPrompt);
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(userPrompt);
    const hasChinese = /[\u4E00-\u9FFF]/.test(userPrompt) && !hasJapanese && !hasKorean;
    let lang = null;
    if (hasKorean) lang = "Korean";
    else if (hasJapanese) lang = "Japanese";
    else if (hasChinese) lang = "Chinese";
    if (lang) {
      prompt += `\n\n## RESPONSE LANGUAGE\n**You MUST reply entirely in ${lang}.** The user wrote in ${lang}. Do not mix in English unless quoting code or technical terms.`;
    }
  }

  return prompt;
}

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

  const systemPrompt = await buildAugmentedSystemPrompt(
    buildSystemPrompt(userPrompt, !!files?.length, detectPlatformType()),
    { userPrompt, backendTarget, assetContext, systemPromptAddition },
  );

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

  // Incremental byte tracking for token estimation (avoids full JSON.stringify each turn)
  let runningBytes = new Blob([JSON.stringify(messages)]).size;
  let lastMsgCount = messages.length;

  try {
    while (turns < MAX_TURNS) {
      turns++;

      // Check cancellation
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // Incrementally update byte estimate for newly pushed messages
      if (messages.length > lastMsgCount) {
        for (let i = lastMsgCount; i < messages.length; i++) {
          runningBytes += new Blob([JSON.stringify(messages[i])]).size;
        }
        lastMsgCount = messages.length;
      }

      // Safety: full recomputation every 5 turns to prevent drift
      if (turns % 5 === 0) {
        runningBytes = new Blob([JSON.stringify(messages)]).size;
        lastMsgCount = messages.length;
      }

      // Pre-flight compaction (estimate ~3 bytes/token for mixed content including multibyte)
      const estTokens = runningBytes / 3;
      const compactThreshold = 150000;
      if (estTokens > compactThreshold) {
        log("System", `Estimated ~${Math.round(estTokens)} tokens — compacting...`, "info");
        onStatus?.("thinking", "Compacting conversation...");
        compactMessages(messages);
        // Recompute after compaction
        runningBytes = new Blob([JSON.stringify(messages)]).size;
        lastMsgCount = messages.length;
      }

      // Sanitize: remove empty messages
      const cleaned = messages.filter(
        (m) => m.content != null && m.content !== "" && !(Array.isArray(m.content) && m.content.length === 0)
      );
      if (cleaned.length !== messages.length) {
        messages.length = 0;
        messages.push(...cleaned);
        runningBytes = new Blob([JSON.stringify(messages)]).size;
        lastMsgCount = messages.length;
      }

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
        if (err.name === "AbortError") throw err;

        const decision = classifyApiError(err, {
          overloadRetries,
          compactRetries,
          maxOverloadRetries: MAX_OVERLOAD_RETRIES,
          maxCompactRetries: MAX_COMPACT_RETRIES,
        });

        if (decision.action === "throw") {
          if (decision.message) log("System", decision.message, "error");
          throw err;
        }

        if (decision.action === "compact") {
          compactRetries++;
          log("System", decision.message, "info");
          onStatus?.("thinking", "Compacting conversation...");
          compactMessages(messages);
          continue;
        }

        if (decision.action === "retry") {
          overloadRetries++;
          log("System", decision.message, "info");
          onStatus?.("thinking", decision.message);
          if (document.hidden) await waitForVisible(signal);
          await sleep(decision.delay * 1000, signal);
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

      // Handle stream_incomplete — stream dropped before message_delta
      if (stopReason === "stream_incomplete") {
        overloadRetries++;
        if (overloadRetries > MAX_OVERLOAD_RETRIES) {
          log("System", "Stream incomplete after max retries — using partial response", "warning");
          break;
        }
        // If we got useful content (text), keep it and ask to continue
        const hasText = storedBlocks.some(b => b.type === "text" && b.text?.trim());
        const hasToolUse = storedBlocks.some(b => b.type === "tool_use");
        if (hasText && !hasToolUse) {
          // Got partial text, ask to continue
          log("System", `Stream dropped mid-response — continuing (${overloadRetries}/${MAX_OVERLOAD_RETRIES})...`, "info");
          onStatus?.("thinking", "Connection lost, continuing...");
          if (document.hidden) await waitForVisible(signal);
          await sleep(Math.min(2 ** overloadRetries, 10) * 1000, signal);
          messages.push({
            role: "user",
            content: "Your response was interrupted by a network error. Continue exactly where you left off.",
          });
          continue;
        }
        // No useful content — remove the incomplete assistant message and retry
        messages.pop(); // remove the incomplete assistant message
        log("System", `Stream dropped — retrying (${overloadRetries}/${MAX_OVERLOAD_RETRIES})...`, "info");
        onStatus?.("thinking", "Connection lost, retrying...");
        if (document.hidden) await waitForVisible(signal);
        await sleep(Math.min(2 ** overloadRetries, 10) * 1000, signal);
        continue;
      }

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
      const loopResult = detectToolLoop(recentToolSigs, {
        warnThreshold: LOOP_WARN_THRESHOLD,
        breakThreshold: LOOP_BREAK_THRESHOLD,
      });

      if (loopResult.action === "break") {
        log("System", `Loop detected (${loopResult.count} identical calls) — stopping`, "warning");
        messages.push({
          role: "user",
          content: "SYSTEM: You are in an infinite loop calling the same tool repeatedly. STOP calling tools and respond to the user with what you have so far.",
        });
        break;
      }
      if (loopResult.action === "warn") {
        messages.push({
          role: "user",
          content: `WARNING: You have called the same tool ${loopResult.count} times. If you are stuck in a loop, try a different approach or respond to the user with what you have.`,
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

  const baseSystemPrompt = await buildAugmentedSystemPrompt(
    buildSystemPrompt(userPrompt, !!files?.length, detectPlatformType()),
    { userPrompt, backendTarget, assetContext, systemPromptAddition },
  );

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
