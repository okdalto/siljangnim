/**
 * Agent execution loop — ported from executor.py.
 *
 * Anthropic-only. Loop: LLM call → tool execution → result feedback → repeat.
 * Conversation history management + compaction.
 * Loop detection (3 warn, 5 break).
 */

import { callLLM } from "./llmClient.js";
import { classifyApiError } from "./agentErrorHandler.js";
import { detectToolLoop, detectErrorLoop, normalizeError, isUnrecoverableError } from "./agentLoopDetector.js";
import * as storage from "./storage.js";

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
function isVisionCapable(provider, model, providerConfig = {}) {
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
function filterToolsForModel(tools, provider, model, providerConfig = {}) {
  if (isVisionCapable(provider, model, providerConfig)) return tools;
  return tools.filter((t) => t.name !== "capture_viewport");
}

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
  isSimpleEditRequest,
  buildPlannerMessages,
  parsePlan,
  buildExecutionContext,
  buildResumeContext,
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

const TOOL_TIMEOUT = 30_000;
const TOOL_TIMEOUT_OVERRIDES = {
  start_recording: 120_000,
  ask_user: 300_000,
  run_debug_diagnosis: 60_000,
};

// Cross-turn cache settings
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 100;

// Parallel tool execution classification
const WRITE_TOOLS = new Set([
  "write_scene", "edit_scene", "write_file",
  "open_panel", "close_panel", "delete_asset", "clear_viewport",
]);
const BLOCKING_TOOLS = new Set(["ask_user", "start_recording", "run_preprocess"]);
const SCENE_DEPENDENT = new Set(["check_browser_errors", "capture_viewport"]);

// ---------------------------------------------------------------------------
// Checkpoint helpers (fire-and-forget, never block the agent loop)
// ---------------------------------------------------------------------------

function _saveCheckpoint(data) {
  const cp = { v: 1, ts: Date.now(), ...data };
  storage.writeJson("agent_checkpoint.json", cp).catch(() => {});
}

function _clearCheckpoint() {
  storage.deleteFile("agent_checkpoint.json").catch(() => {});
}

function withToolTimeout(promise, ms, name) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${ms / 1000}s`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

function estimateBytesPerToken(messages) {
  const sample = JSON.stringify(messages).slice(0, 6000);
  let multibyte = 0, total = 0;
  for (const ch of sample) { total++; if (ch.charCodeAt(0) > 127) multibyte++; }
  // 3.0 (pure ASCII/code) ~ 4.5 (high Korean ratio)
  return total > 0 ? 3.0 + (multibyte / total) * 1.5 : 3.0;
}

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

async function compactMessages(messages, { apiKey, provider, providerConfig, log } = {}) {
  const RESULT_TRUNC = 4000;
  const SAFE_TOKENS = 120000;

  // Phase 1: Synchronous truncation (fast)
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
      if (block.type === "tool_result") {
        if (typeof block.content === "string") {
          if (block.content.length > RESULT_TRUNC) {
            block.content = block.content.slice(0, RESULT_TRUNC) + "...(truncated)";
          }
        } else if (Array.isArray(block.content)) {
          block.content = block.content
            .filter((b) => b.type !== "image")
            .map((b) => {
              if (b.type === "text" && b.text?.length > RESULT_TRUNC) {
                return { ...b, text: b.text.slice(0, RESULT_TRUNC) + "...(truncated)" };
              }
              return b;
            });
          if (block.content.length === 1 && block.content[0].type === "text") {
            block.content = block.content[0].text;
          } else if (block.content.length === 0) {
            block.content = "(image result — compacted)";
          }
        }
      }
    }
  }

  // Phase 2: LLM summarization (if still over threshold and API key available)
  const estAfterTrunc = JSON.stringify(messages).length / 4;
  if (estAfterTrunc > SAFE_TOKENS && apiKey) {
    await _llmSummarize(messages, { apiKey, provider, providerConfig, log });
  }

  // Phase 3: Progressive trim (fallback)
  const { lastSuccessWriteIdx, lastErrorIdx } = findLandmarks(messages);
  const landmarkIndices = new Set([0, lastSuccessWriteIdx, lastErrorIdx].filter(i => i >= 0));

  let keepRecent = 6;
  while (messages.length > 4) {
    const est = JSON.stringify(messages).length / 4;
    if (est <= SAFE_TOKENS) break;

    const recentStart = Math.max(0, messages.length - keepRecent);
    const keepSet = new Set();
    keepSet.add(0);
    for (const idx of landmarkIndices) {
      if (idx >= recentStart) continue;
      keepSet.add(idx);
    }
    for (let i = recentStart; i < messages.length; i++) keepSet.add(i);

    for (let j = 0; j < messages.length; j++) {
      if (!keepSet.has(j)) continue;
      const msg = messages[j];
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      if (msg.role === "assistant" && blocks.some((b) => b.type === "tool_use")) {
        if (j + 1 < messages.length) keepSet.add(j + 1);
      }
      if (msg.role === "user" && blocks.some((b) => b.type === "tool_result")) {
        if (j - 1 >= 0) keepSet.add(j - 1);
      }
    }

    const kept = [];
    let i = 0;
    while (i < messages.length) {
      if (keepSet.has(i)) {
        kept.push(messages[i]);
        i++;
      } else {
        const rangeStart = i;
        while (i < messages.length && !keepSet.has(i)) i++;
        const summary = _summarizeFailedCycle(messages, rangeStart, i - 1);
        if (summary) {
          kept.push({ role: "user", content: summary });
        }
      }
    }

    if (kept.length >= messages.length) break;
    messages.length = 0;
    messages.push(...kept);
    keepRecent = Math.max(2, keepRecent - 2);
  }

  // Final safety pass: compaction may have placed summary strings next to
  // assistant messages with tool_use blocks — fix any orphans.
  sanitizeOrphanedToolUse(messages);
}

// ---------------------------------------------------------------------------
// LLM-based conversation summarization
// ---------------------------------------------------------------------------

const SUMMARIZER_SYSTEM =
  "You are summarizing a conversation between a user and an AI creative coding assistant. " +
  "The assistant creates WebGL/WebGPU visual scenes. Preserve:\n" +
  "- User's creative intent and specific requests\n" +
  "- Key decisions and approaches taken\n" +
  "- What worked (successful scene writes) and what failed (errors encountered)\n" +
  "- Current scene state (what's rendered now)\n" +
  "- Any user preferences or constraints mentioned\n" +
  "Output a concise bullet-point summary in the same language as the conversation (usually Korean).";

function _serializeForSummary(messages, maxChars) {
  const lines = [];
  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    if (typeof msg.content === "string") {
      lines.push(`[${role}]: ${msg.content.slice(0, 500)}`);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text") lines.push(`[${role}]: ${block.text.slice(0, 300)}`);
        else if (block.type === "tool_use") lines.push(`[${role} tool]: ${block.name}(${JSON.stringify(block.input).slice(0, 200)})`);
        else if (block.type === "tool_result") {
          const text = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
          lines.push(`[Tool result${block.is_error ? " ERROR" : ""}]: ${text.slice(0, 300)}`);
        }
      }
    }
  }
  let result = lines.join("\n");
  if (result.length > maxChars) result = result.slice(0, maxChars) + "\n...(truncated)";
  return result;
}

async function _llmSummarize(messages, { apiKey, provider, providerConfig, log }) {
  const keepRecent = 6;
  const recentStart = Math.max(0, messages.length - keepRecent);

  // Messages to summarize: everything between the first message and recent messages
  const toSummarize = messages.slice(1, recentStart);
  if (toSummarize.length < 4) return; // too few to bother

  const serialized = _serializeForSummary(toSummarize, 8000);

  try {
    const { callLLM: callLLMForSummary, getSmallModel } = await import("./llmClient.js");
    const model = getSmallModel?.(provider) || "claude-haiku-4-5-20251001";
    const result = await callLLMForSummary({
      provider,
      apiKey,
      baseUrl: providerConfig?.base_url,
      model,
      maxTokens: 1024,
      system: SUMMARIZER_SYSTEM,
      messages: [{ role: "user", content: serialized }],
      tools: [],
    });

    const summary = result.contentBlocks?.find(b => b.type === "text")?.text;
    if (!summary) return; // failed — Phase 3 fallback handles it

    // Replace summarized range with a compact summary message pair
    const kept = [
      messages[0], // first message preserved
      { role: "user", content: `[CONVERSATION SUMMARY]\n${summary}` },
      { role: "assistant", content: [{ type: "text", text: "Understood. I have the context from the summary above." }] },
      ...messages.slice(recentStart), // recent messages preserved
    ];
    messages.length = 0;
    messages.push(...kept);
    if (log) log("System", `Conversation summarized (${toSummarize.length} messages → summary)`, "info");
  } catch (e) {
    if (log) log("System", `LLM summarization failed: ${e.message} — falling back to truncation`, "info");
    // Phase 3 will handle the rest
  }
}

/** Identify landmark messages that should be preserved during compaction. */
function findLandmarks(messages) {
  let lastSuccessWriteIdx = -1;
  let lastErrorIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== "object" || block.type !== "tool_result") continue;
      const text = typeof block.content === "string" ? block.content : "";
      if (/^ok\s*[—–-]\s*(scene saved|.*applied to)/i.test(text)) lastSuccessWriteIdx = i;
      if (/Script errors|FAILED|Validation errors/i.test(text) || block.is_error) lastErrorIdx = i;
    }
  }
  return { lastSuccessWriteIdx, lastErrorIdx };
}

/** Summarize a range of failed write→error cycles into a compact message. */
function _summarizeFailedCycle(messages, startIdx, endIdx) {
  const parts = [];
  for (let i = startIdx; i <= endIdx && i < messages.length; i++) {
    const content = messages[i].content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use" && (block.name === "write_scene" || block.name === "write_file")) {
        parts.push(`Wrote scene (${block.name})`);
      }
      if (block?.type === "tool_result") {
        const text = typeof block.content === "string" ? block.content : "";
        if (text.includes("Script errors") || text.includes("Error")) {
          const firstLine = text.split("\n").find(l => l.trim().startsWith("-") || l.includes("error")) || text.slice(0, 100);
          parts.push(`Error: ${firstLine.trim().slice(0, 150)}`);
        }
      }
    }
  }
  return parts.length ? `[COMPACTED] Failed attempt: ${parts.join(" → ")}` : null;
}

// ---------------------------------------------------------------------------
// Orphaned tool_use sanitizer
// ---------------------------------------------------------------------------

/**
 * Scan conversation history and fix orphaned tool_use blocks.
 * An orphaned tool_use is an assistant message containing tool_use blocks
 * that are NOT followed by a user message with matching tool_result blocks.
 * This can happen after stream drops, max_tokens interruptions, or compaction.
 *
 * Strategy: two-phase approach.
 *   Phase 1: Collect all tool_use ids per assistant message and check if the
 *            immediately following user message has matching tool_results.
 *   Phase 2: Build the fixed messages array in one pass (no splice mid-iteration).
 */
function sanitizeOrphanedToolUse(messages, log) {
  // Phase 1: identify all orphaned tool_use ids per assistant message index
  const fixes = []; // { assistantIdx, missingIds[] }
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

    const toolUseIds = msg.content
      .filter(b => b.type === "tool_use" && b.id)
      .map(b => b.id);
    if (!toolUseIds.length) continue;

    const nextMsg = messages[i + 1];
    if (nextMsg?.role === "user") {
      // Next message is user — check which tool_results are present
      const blocks = Array.isArray(nextMsg.content) ? nextMsg.content : [];
      const resultIds = new Set(
        blocks.filter(b => b.type === "tool_result").map(b => b.tool_use_id)
      );
      const missingIds = toolUseIds.filter(id => !resultIds.has(id));
      if (missingIds.length) {
        fixes.push({ assistantIdx: i, missingIds, patchNext: true });
      }
    } else {
      // Next message is not user (another assistant, or end of array)
      fixes.push({ assistantIdx: i, missingIds: toolUseIds, patchNext: false });
    }
  }

  if (!fixes.length) return;

  // Phase 2: apply fixes (build new array to avoid splice index issues)
  const needsInsert = new Set(); // indices where we need to INSERT a synthetic user message AFTER
  const needsPatch = new Map();  // index → missingIds to inject into existing user message

  for (const fix of fixes) {
    if (fix.patchNext) {
      // Patch the existing user message at assistantIdx + 1
      const existingIds = needsPatch.get(fix.assistantIdx + 1) || [];
      needsPatch.set(fix.assistantIdx + 1, [...existingIds, ...fix.missingIds]);
    } else {
      needsInsert.add(fix.assistantIdx);
      needsPatch.set(`insert_${fix.assistantIdx}`, fix.missingIds);
    }
  }

  const makeSyntheticResults = (ids) => ids.map(id => ({
    type: "tool_result",
    tool_use_id: id,
    content: "Error: tool call was interrupted by a connection error. Please retry if needed.",
    is_error: true,
  }));

  // Build new messages array
  const result = [];
  let totalPatched = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Patch existing user message with missing tool_results
    if (needsPatch.has(i) && msg.role === "user") {
      const ids = needsPatch.get(i);
      if (!Array.isArray(msg.content)) {
        // Convert string content to array
        msg.content = [{ type: "text", text: msg.content || "" }];
      }
      msg.content.push(...makeSyntheticResults(ids));
      totalPatched += ids.length;
    }

    result.push(msg);

    // Insert synthetic user message after this assistant message
    if (needsInsert.has(i)) {
      const ids = needsPatch.get(`insert_${i}`);
      if (ids?.length) {
        result.push({ role: "user", content: makeSyntheticResults(ids) });
        totalPatched += ids.length;
      }
    }
  }

  if (totalPatched > 0) {
    messages.length = 0;
    messages.push(...result);
    if (log) log("System", `Sanitized ${totalPatched} orphaned tool_use(s) across ${fixes.length} message(s)`, "info");
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
async function buildAugmentedSystemPrompt(basePrompt, { userPrompt, backendTarget, assetContext = [], systemPromptAddition = "", conversationHistory = [] } = {}) {
  let prompt = basePrompt;

  if (systemPromptAddition) {
    prompt += "\n\n" + systemPromptAddition;
  }

  // Auto-detect WebGPU intent from user prompt AND conversation history when backend is "auto"
  let effectiveBackend = backendTarget;
  if ((!effectiveBackend || effectiveBackend === "auto")) {
    const webgpuKeywords = ["webgpu", "wgsl", "compute shader", "컴퓨트 셰이더", "storage buffer", "gpudevice", "gpubuffer"];
    // Check current prompt
    const lower = (userPrompt || "").toLowerCase();
    if (webgpuKeywords.some((kw) => lower.includes(kw))) {
      effectiveBackend = "webgpu";
    }
    // Check recent conversation history (user messages only, last 10)
    if (effectiveBackend === "auto" || !effectiveBackend) {
      const recentUserMsgs = conversationHistory
        .filter((m) => m.role === "user")
        .slice(-10)
        .map((m) => (typeof m.content === "string" ? m.content : "").toLowerCase());
      if (recentUserMsgs.some((msg) => webgpuKeywords.some((kw) => msg.includes(kw)))) {
        effectiveBackend = "webgpu";
      }
    }
  }

  // Inject backend target if available
  if (effectiveBackend && effectiveBackend !== "auto") {
    const isHybrid = effectiveBackend === "hybrid";
    const isPureWebGPU = effectiveBackend === "webgpu";
    const shaderLang = isPureWebGPU ? "WGSL" : "GLSL";
    const backendDesc = isHybrid
      ? "**hybrid** (WebGPU compute + WebGL2 GLSL rendering). Use `ctx.renderer` for compute shaders and `ctx.gl` for rendering"
      : `**${effectiveBackend}**. Generate ${shaderLang} shaders accordingly. Follow the ${shaderLang} rules strictly`;
    prompt += `\n\n## ACTIVE BACKEND TARGET\nThe current project uses ${backendDesc}.`;

    // Force-include WebGPU-related sections when backend needs WebGPU
    if (isPureWebGPU || isHybrid) {
      try {
        const { advancedSections } = await import("./prompts/advancedSections.js");
        const webgpuSectionIds = new Set(isHybrid
          ? ["per_project_backend"]  // hybrid doesn't need wgsl_rules for rendering
          : ["wgsl_rules", "per_project_backend"]);
        for (const section of advancedSections) {
          if (webgpuSectionIds.has(section.id) && !prompt.includes(section.content)) {
            prompt += "\n\n" + section.content;
          }
        }
      } catch { /* non-critical */ }
    }
  }

  // Inject matching technique hints
  if (userPrompt) {
    try {
      const { findTechniques } = await import("./techniqueKnowledgeBase.js");
      const matches = findTechniques(userPrompt);
      if (matches.length > 0) {
        const top3 = matches.slice(0, 3);
        const hints = top3.map(t => `- **${t.name}** (id: \`${t.id}\`, ${t.category}): ${t.description?.slice(0, 100) || t.summary?.slice(0, 100) || ""}`).join("\n");
        prompt += `\n\n## SUGGESTED TECHNIQUES\nBased on the user prompt, these techniques from the knowledge base may be relevant:\n${hints}\nYou can load any of these instantly with \`use_template(template_id="...")\` and then customize with \`edit_scene\`. This is faster and more reliable than writing from scratch.`;
      }
    } catch { /* technique matching is non-critical */ }
  }

  // Inject incremental build strategy (applies to all execution paths)
  prompt += `\n\n## MANDATORY BUILD STRATEGY
ALWAYS build scenes INCREMENTALLY:
1. write_scene with MINIMAL working skeleton (< 80 lines, basic structure + one simple render pass)
2. check_browser_errors to verify it works
3. edit_scene to add ONE feature at a time
4. check_browser_errors after EACH edit_scene
NEVER write more than 80 lines in a single write_scene call. NEVER put entire complex scenes in one write_scene.
For .workspace/ files: write_file with small modules, then loadModule() in setup. Do NOT inline large WGSL/shader code in scene.json.`;

  // Inject environment info
  prompt += getEnvironmentSection();

  // Inject asset context if available
  if (assetContext.length > 0) {
    const assetLines = assetContext.map((a) => {
      let line = `- "${a.semanticName}" (${a.filename}, ${a.category})`;
      if (a.aiSummary) line += `: ${a.aiSummary}`;
      // Include key technical info (duration, dimensions, fps, etc.)
      if (a.technicalInfo && typeof a.technicalInfo === "object") {
        const ti = a.technicalInfo;
        const parts = [];
        if (ti.duration != null) parts.push(`duration=${ti.duration}s`);
        if (ti.width != null && ti.height != null) parts.push(`${ti.width}×${ti.height}`);
        if (ti.fps != null) parts.push(`${ti.fps}fps`);
        if (ti.sampleRate != null) parts.push(`${ti.sampleRate}Hz`);
        if (ti.channels != null) parts.push(`${ti.channels}ch`);
        if (ti.bpm != null) parts.push(`~${ti.bpm}bpm`);
        if (parts.length) line += ` [${parts.join(", ")}]`;
      }
      if (a.processingStatus !== "ready") line += ` [${a.processingStatus}]`;
      return line;
    });
    prompt += `\n\n## WORKSPACE ASSETS\nThe following assets are loaded in the workspace:\n${assetLines.join("\n")}\nUse \`ctx.uploads["filename"]\` to reference them in scripts.`;
  }

  // Improvement #8: inject success patterns for reference
  try {
    const { readTextFile } = await import("./storage.js");
    const raw = await readTextFile(".workspace/success_patterns.json");
    const patterns = JSON.parse(raw);
    if (Array.isArray(patterns) && patterns.length > 0) {
      const recent = patterns.slice(-5);
      const lines = recent.map(p =>
        `- [${p.backend}] ${p.techniques.join(", ")} (${Math.round(p.scriptSize / 1000)}KB)`
      );
      prompt += `\n\n## PREVIOUS SUCCESSFUL PATTERNS\nThese techniques have worked in this workspace:\n${lines.join("\n")}\nConsider reusing these patterns when applicable.`;
    }
  } catch { /* no patterns yet, fine */ }

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
  onTextDelta,
  onTextFinalize,
  onStatus,
  files,
  messages,
  errorCollector,
  userAnswerPromise,
  preprocessPromise,
  recordingDonePromise,
  signal,
  injectedMessages = [],
  systemPromptAddition = "",
  assetContext = [],
  backendTarget = "auto",
  modelOverride,
  provider = "anthropic",
  providerConfig = {},
  toolResultCache,
}) {
  log("System", `Starting agent for: "${userPrompt}"`, "info");
  if (files?.length) {
    log("System", `Files attached: ${files.map((f) => f.name).join(", ")}`, "info");
  }

  const lightweight = isSimpleEditRequest(userPrompt);
  if (lightweight) log("System", "Simple edit detected — using lightweight prompt", "info");

  const systemPrompt = await buildAugmentedSystemPrompt(
    buildSystemPrompt(userPrompt, !!files?.length, detectPlatformType(), { backendTarget, lightweight }),
    { userPrompt, backendTarget, assetContext, systemPromptAddition, conversationHistory: messages },
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
    onTextDelta,
    onTextFinalize,
    onStatus,
    errorCollector,
    userAnswerPromise,
    preprocessPromise,
    recordingDonePromise,
    signal,
    injectedMessages,
    modelOverride,
    provider,
    providerConfig,
    toolResultCache,
    _cpUserPrompt: userPrompt,
  });
}

// ---------------------------------------------------------------------------
// Parallel tool execution helpers
// ---------------------------------------------------------------------------

function _classifyToolGroups(toolBlocks) {
  const groups = [];
  let currentParallel = [];

  const flushParallel = () => {
    if (currentParallel.length) {
      groups.push({ parallel: true, blocks: currentParallel });
      currentParallel = [];
    }
  };

  for (const block of toolBlocks) {
    if (WRITE_TOOLS.has(block.name) || BLOCKING_TOOLS.has(block.name) || SCENE_DEPENDENT.has(block.name)) {
      flushParallel();
      groups.push({ parallel: false, blocks: [block] });
    } else {
      currentParallel.push(block);
    }
  }
  flushParallel();
  return groups;
}

async function _executeOneTool(block, ctx) {
  const {
    toolCache, broadcast, errorCollector, userAnswerPromise, preprocessPromise,
    recordingDonePromise, log, onStatus, signal, visionEnabled, READ_ONLY_TOOLS,
    apiKey, provider, providerConfig,
  } = ctx;

  // Handle parse errors
  if (block._parseError) {
    log("System", `Skipped ${block.name}: JSON parse error`, "warning");
    return {
      toolResult: {
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: ${block._parseError} Please retry this tool call with complete arguments.`,
        is_error: true,
      },
    };
  }

  onStatus?.("thinking", `Running ${block.name}...`);

  let result;
  let isError = false;
  try {
    const isReadOnly = READ_ONLY_TOOLS.has(block.name);
    const cacheKey = isReadOnly ? `${block.name}|${JSON.stringify(block.input)}` : null;

    if (cacheKey && toolCache.has(cacheKey)) {
      const entry = toolCache.get(cacheKey);
      if (Date.now() - entry.ts < CACHE_TTL) {
        result = entry.result;
        log("System", `Cache hit: ${block.name}`, "info");
      } else {
        toolCache.delete(cacheKey);
      }
    }
    if (result === undefined) {
      const timeout = TOOL_TIMEOUT_OVERRIDES[block.name] || TOOL_TIMEOUT;
      result = await withToolTimeout(handleTool(block.name, block.input, broadcast, {
        errorCollector,
        userAnswerPromise,
        preprocessPromise,
        recordingDonePromise,
        engineRef: errorCollector.getEngineRef(),
        debugSubagentRunner: (errorContext) => runDebugSubagent({
          apiKey, errorContext, log, broadcast, onStatus,
          errorCollector, signal, provider, providerConfig,
        }),
      }), timeout, block.name);
      // Cache read-only results with TTL
      if (cacheKey) {
        if (toolCache.size >= CACHE_MAX_SIZE) {
          const oldest = [...toolCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
          if (oldest) toolCache.delete(oldest[0]);
        }
        toolCache.set(cacheKey, { result, ts: Date.now() });
      }
      // Invalidate cache on write operations
      if (block.name === "write_scene" || block.name === "edit_scene" || block.name === "write_file") {
        toolCache.clear();
      }
    }
    if (typeof result === "string" && result.startsWith("Error")) isError = true;
  } catch (e) {
    result = `Error executing tool '${block.name}': ${e.message}`;
    isError = true;
    log("System", result, "error");
  }

  // Check for unrecoverable errors in any tool result (context loss, etc.)
  let errorInfo = null;
  let errorCleared = false;
  if (isError && typeof result === "string") {
    const { unrecoverable, reason } = isUnrecoverableError(result);
    if (unrecoverable) {
      errorInfo = { pattern: normalizeError(result.split("\n")[0]), unrecoverable, reason };
    }
  }
  // Track error patterns from check_browser_errors
  if (!errorInfo && block.name === "check_browser_errors" && typeof result === "string") {
    if (result.includes("Script errors") || result.includes("FAILED")) {
      const lines = result.split("\n").filter(l => l.trim().startsWith("-") || l.trim().match(/^\d+\./));
      if (lines.length) {
        const pattern = normalizeError(lines[0]);
        const { unrecoverable, reason } = isUnrecoverableError(result);
        errorInfo = { pattern, unrecoverable, reason };
      }
    } else if (result.includes("No browser errors detected")) {
      errorCleared = true;
    }
  }

  // Build tool result
  let tr;
  if (result && typeof result === "object" && result.__type === "image" && visionEnabled) {
    tr = {
      type: "tool_result",
      tool_use_id: block.id,
      content: [
        { type: "text", text: `Viewport capture (${result.width}×${result.height})` },
        {
          type: "image",
          source: { type: "base64", media_type: result.media_type, data: result.base64 },
        },
      ],
    };
  } else {
    const resultStr = (typeof result === "object" && result.__type === "image")
      ? `Viewport captured (${result.width}×${result.height}) but vision is not available for this model. The scene is rendering.`
      : (typeof result === "string" ? result : JSON.stringify(result));
    tr = {
      type: "tool_result",
      tool_use_id: block.id,
      content: resultStr || "(empty result)",
    };
  }
  if (isError) tr.is_error = true;

  // Status preview
  const previewStr = typeof result === "string" ? result : (result?.__type === "image" ? "[viewport screenshot]" : "");
  const preview = (previewStr || "").slice(0, 120);
  onStatus?.("thinking", isError ? `${block.name} → Error: ${preview}` : `${block.name} → ${preview}`);

  // Loop detection signature
  const inputKey = JSON.stringify(block.input, Object.keys(block.input).sort());
  const sig = `${block.name}|${hashCode(inputKey)}`;

  return { toolResult: tr, toolName: block.name, sig, errorInfo, errorCleared };
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
  onTextDelta,
  onTextFinalize,
  onStatus,
  errorCollector,
  userAnswerPromise,
  preprocessPromise,
  recordingDonePromise,
  signal,
  injectedMessages = [],
  modelOverride,
  provider = "anthropic",
  providerConfig = {},
  toolResultCache,
  _cpUserPrompt = "",
  _cpCompletedSteps = [],
}) {
  const modelName = modelOverride || (providerConfig.model || MODEL_COMPLEX);
  const isAnthropic = provider === "anthropic";
  const useThinking = isAnthropic && (modelName.includes("opus") || modelName.includes("sonnet"));
  const maxTokens = providerConfig.max_tokens || (useThinking ? MODEL_THINKING_MAX : MODEL_COMPLEX_MAX);

  // Filter tools based on vision capability
  const availableTools = filterToolsForModel(TOOLS, provider, modelName, providerConfig);
  const visionEnabled = isVisionCapable(provider, modelName, providerConfig);

  log("System", `Model: ${modelName}${visionEnabled ? " (vision)" : ""}`, "info");

  let lastText = "";
  let turns = 0;
  let compactRetries = 0;
  let overloadRetries = 0;
  const recentToolSigs = [];
  const recentErrors = [];       // Improvement #1: error pattern tracking
  let errorFixCycles = 0;        // Improvement #2: debug subagent auto-trigger
  const READ_ONLY_TOOLS = new Set(["read_file", "list_files", "list_uploaded_files", "search_code"]);
  const toolCache = toolResultCache || new Map(); // Cross-turn cache (or fallback per-loop)

  // Incremental byte tracking for token estimation (avoids full JSON.stringify each turn)
  const _enc = new TextEncoder();
  const byteLen = (v) => _enc.encode(JSON.stringify(v)).length;
  let runningBytes = byteLen(messages);
  let lastMsgCount = messages.length;

  try {
    while (turns < MAX_TURNS) {
      turns++;

      // Check cancellation
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // Incrementally update byte estimate for newly pushed messages
      if (messages.length > lastMsgCount) {
        for (let i = lastMsgCount; i < messages.length; i++) {
          runningBytes += byteLen(messages[i]);
        }
        lastMsgCount = messages.length;
      }

      // Safety: full recomputation every 5 turns to prevent drift
      if (turns % 5 === 0) {
        runningBytes = byteLen(messages);
        lastMsgCount = messages.length;
      }

      // Pre-flight compaction (adaptive bytes/token: 3.0 for ASCII, up to 4.5 for Korean-heavy)
      const estTokens = runningBytes / estimateBytesPerToken(messages);
      const compactThreshold = 150000;
      if (estTokens > compactThreshold) {
        log("System", `Estimated ~${Math.round(estTokens)} tokens — compacting...`, "info");
        onStatus?.("thinking", "대화 내용 정리 중...");
        await compactMessages(messages, { apiKey, provider, providerConfig, log });
        // Recompute after compaction
        runningBytes = byteLen(messages);
        lastMsgCount = messages.length;
      }

      // Sanitize: remove empty messages
      const cleaned = messages.filter(
        (m) => m.content != null && m.content !== "" && !(Array.isArray(m.content) && m.content.length === 0)
      );
      if (cleaned.length !== messages.length) {
        messages.length = 0;
        messages.push(...cleaned);
        runningBytes = byteLen(messages);
        lastMsgCount = messages.length;
      }

      // --- Sanitize orphaned tool_use blocks before LLM call ---
      // After stream drops, an assistant message may contain tool_use blocks
      // without matching tool_result in the next user message. This causes
      // API errors ("every tool_use must have a tool_result"). Fix by
      // injecting synthetic error tool_results for any unmatched tool_use.
      sanitizeOrphanedToolUse(messages, log);

      // --- Call LLM ---
      let contentBlocks, stopReason;
      let thinkingBuffer = "";
      try {
        const result = await callLLM({
          provider,
          apiKey,
          baseUrl: providerConfig.base_url,
          model: modelName,
          maxTokens,
          system: systemPrompt,
          messages,
          tools: availableTools,
          signal,
          callbacks: {
            onThinkingDelta(chunk) {
              thinkingBuffer += chunk;
              onStatus?.("thinking", thinkingBuffer);
            },
            onTextDelta(chunk) {
              onTextDelta?.(chunk);
            },
            onToolUseStart(name) {
              onStatus?.("tool_use", name);
            },
            onContentBlockStop(type, data) {
              if (type === "thinking") {
                thinkingBuffer = "";
                log("Agent", data, "thinking");
              }
              if (type === "text") {
                onTextFinalize?.();
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
          onStatus?.("thinking", "대화 내용 정리 중...");
          await compactMessages(messages, { apiKey, provider, providerConfig, log });
          continue;
        }

        if (decision.action === "retry") {
          overloadRetries++;
          log("System", decision.message, "info");
          onStatus?.("thinking", decision.userMessage || decision.message);
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
          // If streaming via onTextDelta, text was already sent incrementally
          if (!onTextDelta) onText?.(block.text);
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
          // Safety: strip orphaned tool_use blocks before giving up
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === "assistant" && Array.isArray(lastMsg.content) &&
              lastMsg.content.some(b => b.type === "tool_use")) {
            messages.pop();
          }
          log("System", "Stream incomplete after max retries — using partial response", "warning");
          onText?.("연결이 반복적으로 끊어져 작업을 중단했습니다. 대화 내용이 너무 길거나 생성하는 코드가 클 수 있습니다. 코드를 더 작은 단위로 나누어 다시 시도해 주세요.");
          lastText = lastText || "연결이 반복적으로 끊어져 작업을 중단했습니다.";
          break;
        }
        const hasText = storedBlocks.some(b => b.type === "text" && b.text?.trim());
        const hasToolUse = storedBlocks.some(b => b.type === "tool_use");
        if (hasText && !hasToolUse) {
          // Got partial text only — keep it and nudge to continue
          // Extract the last ~200 chars to anchor the continuation point
          const partialText = storedBlocks.filter(b => b.type === "text").map(b => b.text).join("");
          const tail = partialText.length > 200 ? "..." + partialText.slice(-200) : partialText;
          log("System", `Stream dropped mid-response — continuing (${overloadRetries}/${MAX_OVERLOAD_RETRIES})...`, "info");
          onStatus?.("thinking", "연결이 끊어졌습니다. 계속 진행합니다...");
          if (document.hidden) await waitForVisible(signal);
          await sleep(Math.min(2 ** overloadRetries, 10) * 1000, signal);
          messages.push({
            role: "user",
            content: `Network interruption. Your last output ended with:\n"${tail}"\nContinue from that exact point. Do NOT restart or repeat previous content — just output the remaining part.`,
          });
          continue;
        }
        // Has tool_use or no useful content — remove the incomplete assistant message and retry
        // (orphaned tool_use without tool_result will corrupt the conversation)
        messages.pop();
        log("System", `Stream dropped — retrying (${overloadRetries}/${MAX_OVERLOAD_RETRIES})...`, "info");
        onStatus?.("thinking", "연결이 끊어졌습니다. 재시도합니다...");
        if (document.hidden) await waitForVisible(signal);
        await sleep(Math.min(2 ** overloadRetries, 10) * 1000, signal);
        continue;
      }

      // Handle max_tokens — the model was cut off, possibly mid-tool-call
      if (stopReason === "max_tokens") {
        // Check if the last block is a truncated tool_use (empty input = JSON was incomplete)
        const lastBlock = storedBlocks[storedBlocks.length - 1];
        const hasTruncatedTool = lastBlock?.type === "tool_use" &&
          Object.keys(lastBlock.input || {}).length === 0;
        // Also check for any tool_use that would need a tool_result
        const hasAnyToolUse = storedBlocks.some(b => b.type === "tool_use");

        if (hasTruncatedTool || hasAnyToolUse) {
          // Remove the assistant message with tool_use — orphaned tool_use
          // without tool_result will corrupt the conversation on next LLM call
          messages.pop();
          log("System", `Tool call${hasTruncatedTool ? " truncated" : " cut off"} by token limit — retrying...`, "warning");
        } else {
          compactRetries++;
          if (compactRetries > MAX_COMPACT_RETRIES) {
            log("System", "Max compact retries — using partial response", "info");
            break;
          }
          log("System", "Token limit — compacting...", "info");
          onStatus?.("thinking", "대화 내용 정리 중...");
          await compactMessages(messages, { apiKey, provider, providerConfig, log });
        }
        messages.push({
          role: "user",
          content: hasAnyToolUse
            ? "SYSTEM: Your tool call was cut off by the token limit. MANDATORY STRATEGY: Use write_scene for a MINIMAL skeleton (< 60 lines with basic structure + rendering). Then use edit_scene to add features ONE AT A TIME. Each edit_scene must be followed by check_browser_errors. Do NOT attempt to write the full scene in one call again."
            : "You were cut off due to token limit. Continue from where you stopped — do NOT restart or repeat previous content.",
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

      // --- Execute tool calls (with parallel execution for read-only tools) ---
      const toolBlocks = contentBlocks.filter((b) => b.type === "tool_use");

      const toolCtx = {
        toolCache, broadcast, errorCollector, userAnswerPromise, preprocessPromise,
        recordingDonePromise, log, onStatus, signal, visionEnabled, READ_ONLY_TOOLS,
        apiKey, provider, providerConfig,
      };

      const groups = _classifyToolGroups(toolBlocks);
      const allResults = [];

      for (const group of groups) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        if (group.parallel && group.blocks.length > 1) {
          onStatus?.("thinking", `Running ${group.blocks.length} tools in parallel...`);
          const results = await Promise.all(
            group.blocks.map(block => _executeOneTool(block, toolCtx))
          );
          allResults.push(...results);
        } else {
          for (const block of group.blocks) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const result = await _executeOneTool(block, toolCtx);
            allResults.push(result);
          }
        }
      }

      // Collect results
      const toolResults = allResults.map(r => r.toolResult);
      for (const r of allResults) {
        if (r.sig) recentToolSigs.push(r.sig);
        if (r.errorInfo) {
          recentErrors.push(r.errorInfo.pattern);
          errorFixCycles++;
        }
        if (r.errorCleared) {
          recentErrors.length = 0;
          errorFixCycles = 0;
        }
      }

      // Checkpoint: save after successful write_scene / edit_scene
      for (const r of allResults) {
        if (r.toolResult && !r.toolResult.is_error &&
            (r.toolName === "write_scene" || r.toolName === "edit_scene")) {
          _saveCheckpoint({
            userPrompt: _cpUserPrompt,
            completedSteps: _cpCompletedSteps,
            lastTool: { name: r.toolName, ok: true, turn: turns },
            sceneWritten: true,
          });
          break; // one checkpoint per turn is enough
        }
      }

      // Append tool results as user message
      messages.push({ role: "user", content: toolResults });

      // --- Unrecoverable error detection (immediate stop) ---
      const unrecoverable = allResults.find(r => r.errorInfo?.unrecoverable);
      if (unrecoverable) {
        const reason = unrecoverable.errorInfo.reason;
        log("System", `Unrecoverable error detected — stopping agent: ${reason}`, "warning");
        messages.push({
          role: "user",
          content: `SYSTEM: This is an UNRECOVERABLE ENVIRONMENT ERROR that cannot be fixed by editing code: "${reason}". DO NOT attempt to fix this by modifying the scene code — it will fail no matter what code you write. Instead, explain to the user what happened and suggest they refresh the page or switch backends. Respond in the user's language.`,
        });
        try {
          const finalResult = await callLLM({
            provider,
            apiKey,
            baseUrl: providerConfig.base_url,
            model: modelName,
            maxTokens: 1024,
            system: systemPrompt,
            messages,
            tools: [],
            signal,
          });
          const finalBlocks = (finalResult.contentBlocks || []).filter(b => b.type !== "thinking");
          for (const block of finalBlocks) {
            if (block.type === "text" && block.text?.trim()) {
              onText?.(block.text);
              lastText = block.text;
            }
          }
        } catch { /* best effort */ }
        break;
      }

      // --- Loop detection ---
      const loopResult = detectToolLoop(recentToolSigs, {
        warnThreshold: LOOP_WARN_THRESHOLD,
        breakThreshold: LOOP_BREAK_THRESHOLD,
      });

      if (loopResult.action === "break") {
        log("System", `Loop detected (${loopResult.count} identical calls) — stopping`, "warning");
        messages.push({
          role: "user",
          content: "SYSTEM: You are in an infinite loop calling the same tool repeatedly. STOP calling tools. Explain to the user what you were trying to do and why it keeps failing. Suggest an alternative approach.",
        });
        // Let the model produce one final explanatory response
        try {
          const finalResult = await callLLM({
            provider,
            apiKey,
            baseUrl: providerConfig.base_url,
            model: modelName,
            maxTokens: 2048,
            system: systemPrompt,
            messages,
            tools: [],
            signal,
          });
          const finalBlocks = (finalResult.contentBlocks || []).filter(b => b.type !== "thinking");
          for (const block of finalBlocks) {
            if (block.type === "text" && block.text?.trim()) {
              onText?.(block.text);
              lastText = block.text;
            }
          }
        } catch { /* best effort */ }
        break;
      }
      if (loopResult.action === "warn") {
        messages.push({
          role: "user",
          content: `WARNING: You have called the same tool ${loopResult.count} times. If you are stuck in a loop, try a different approach or respond to the user with what you have.`,
        });
      }

      // Improvement #1: error loop detection (same error, different code)
      const errorLoopResult = detectErrorLoop(recentErrors, {
        warnThreshold: 2,
        breakThreshold: 4,
      });
      if (errorLoopResult.action === "break") {
        log("System", `Error loop detected (${errorLoopResult.count}x same pattern) — stopping`, "warning");
        // Instead of silently breaking, tell the model to explain to the user
        messages.push({
          role: "user",
          content: `SYSTEM: You keep hitting the same error pattern ${errorLoopResult.count} times: "${errorLoopResult.pattern}". STOP retrying. Explain clearly to the user: (1) what error you keep hitting, (2) what you tried, (3) what approach might work differently. The user can then decide to retry with a different strategy or help you.`,
        });
        // Let the model produce one final explanatory response, then break
        try {
          const finalResult = await callLLM({
            provider,
            apiKey,
            baseUrl: providerConfig.base_url,
            model: modelName,
            maxTokens: 2048,
            system: systemPrompt,
            messages,
            tools: [],
            signal,
          });
          const finalBlocks = (finalResult.contentBlocks || []).filter(b => b.type !== "thinking");
          for (const block of finalBlocks) {
            if (block.type === "text" && block.text?.trim()) {
              onText?.(block.text);
              lastText = block.text;
            }
          }
        } catch { /* best effort — if this fails too, just stop */ }
        break;
      }
      if (errorLoopResult.action === "warn") {
        messages.push({
          role: "user",
          content: `SYSTEM: You are repeating the same error pattern: "${errorLoopResult.pattern}". Try a fundamentally different approach.`,
        });
      }

      // Improvement #2: auto-recommend debug subagent after 3 error-fix cycles
      if (errorFixCycles >= 5) {
        log("System", "Consecutive error threshold exceeded — forcing strategy reset", "warning");
        messages.push({
          role: "user",
          content: "SYSTEM OVERRIDE: 5+ consecutive errors across different patterns. " +
            "You MUST call clear_viewport now and start from a MINIMAL working scene. " +
            "Write the simplest possible version first (< 30 lines), verify with check_browser_errors, " +
            "then add features one at a time. Do NOT attempt the full implementation again.",
        });
        errorFixCycles = 0;
      } else if (errorFixCycles >= 3) {
        messages.push({
          role: "user",
          content: "SYSTEM: You have attempted to fix errors 3+ times without success. " +
            "STOP and simplify your approach: " +
            "(1) Revert to the last WORKING state (use write_scene with minimal code). " +
            "(2) Add ONE small feature at a time. " +
            "(3) check_browser_errors after EACH addition. " +
            "If the errors involve render targets, shaders, or pipelines — test each piece in isolation before combining. " +
            "Alternatively, call debug_with_subagent for a fresh root cause analysis.",
        });
      }

      // Improvement #10: check for injected setup errors between tool calls
      if (injectedMessages.length) {
        const combined = injectedMessages.splice(0).join("\n\n");
        log("System", "Injecting immediate error feedback", "info");
        messages.push({ role: "user", content: combined });
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      log("System", "Agent cancelled by user", "info");
    } else {
      throw err;
    }
  }

  // Agent loop completed — clear checkpoint
  _clearCheckpoint();

  return { chatText: lastText };
}

// ---------------------------------------------------------------------------
// Debug Sub-Agent
// ---------------------------------------------------------------------------

const DEBUG_SUBAGENT_MAX_TURNS = 10;
/** Tools available to the debug sub-agent (read-only + diagnostics + vision). */
const DEBUG_TOOLS_NAMES = new Set([
  "read_file", "list_files", "list_uploaded_files", "search_code", "check_browser_errors", "capture_viewport",
]);
const DEBUG_TOOLS = TOOLS.filter((t) => DEBUG_TOOLS_NAMES.has(t.name));

const DEBUG_SYSTEM_PROMPT = `You are a **debug specialist sub-agent** for a real-time WebGL/WebGPU visual creation tool called siljangnim.

Your job: Analyze errors, diagnose root causes, and return a clear, actionable diagnosis.

## Available tools
- read_file: Read workspace files (scene.json sections, uploads, .workspace/ files)
- list_files / list_uploaded_files: See what files exist
- search_code: Grep for strings/patterns across all workspace code
- check_browser_errors: Check for runtime errors in the browser

## Your workflow
1. Read the error information provided
2. Use tools to inspect the relevant code (setup, render, cleanup sections)
3. Search for related patterns if needed
4. Produce a DIAGNOSIS with:
   - **Root cause**: What exactly is wrong and why
   - **Location**: Which section (setup/render/cleanup) and which line(s)
   - **Fix**: Concrete code changes needed (show before→after)
   - **Confidence**: high / medium / low

## Rules
- You are READ-ONLY. You cannot modify files — only analyze.
- Be concise. The parent agent will apply your suggested fixes.
- Focus on the most likely root cause, not every theoretical possibility.
- If you need to see code, use read_file with section paths like "script.setup", "script.render".
- Always respond in the same language as the error context / user prompt.`;

/**
 * Run a debug sub-agent with its own conversation context.
 * Returns the final diagnosis text.
 */
export async function runDebugSubagent({
  apiKey,
  errorContext,
  log,
  broadcast,
  onStatus,
  errorCollector,
  signal,
  provider = "anthropic",
  providerConfig = {},
}) {
  // Use lightweight model for debug sub-agent (haiku for Anthropic, etc.)
  const { getSmallModel } = await import("./llmClient.js");
  const modelName = providerConfig.model || getSmallModel(provider) || "claude-haiku-4-5-20251001";
  const isAnthropic = provider === "anthropic";
  const useThinking = false; // lightweight model — no extended thinking
  const maxTokens = providerConfig.max_tokens || MODEL_COMPLEX_MAX;
  const visionEnabled = isVisionCapable(provider, modelName, providerConfig);

  // Auto-include current scene.json state for context
  let sceneContext = "";
  try {
    const storage = await import("./storage.js");
    const sceneJson = await storage.readJson("scene.json");
    if (sceneJson) {
      const summary = {};
      if (sceneJson.script?.setup) summary.setup = sceneJson.script.setup.slice(0, 500);
      if (sceneJson.script?.render) summary.render = sceneJson.script.render.slice(0, 1000);
      if (sceneJson.script?.cleanup) summary.cleanup = sceneJson.script.cleanup.slice(0, 300);
      if (sceneJson.uniforms) summary.uniforms = Object.keys(sceneJson.uniforms);
      if (sceneJson.backendTarget) summary.backendTarget = sceneJson.backendTarget;
      sceneContext = `\n\n--- Current scene.json (summary) ---\n${JSON.stringify(summary, null, 2)}`;
    }
  } catch { /* storage unavailable */ }

  const messages = [
    { role: "user", content: errorContext + sceneContext },
  ];

  // Filter tools based on vision capability
  const debugTools = visionEnabled ? DEBUG_TOOLS : DEBUG_TOOLS.filter(t => t.name !== "capture_viewport");

  let lastText = "";
  let turns = 0;

  log("Debug Agent", `Starting debug sub-agent (${modelName}${visionEnabled ? ", vision" : ""})...`, "info");
  onStatus?.("thinking", "디버그 분석 중...");

  try {
    while (turns < DEBUG_SUBAGENT_MAX_TURNS) {
      turns++;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      let contentBlocks, stopReason;
      try {
        const result = await callLLM({
          provider,
          apiKey,
          baseUrl: providerConfig.base_url,
          model: modelName,
          maxTokens,
          system: DEBUG_SYSTEM_PROMPT,
          messages,
          tools: debugTools,
          signal,
          callbacks: {
            onThinkingDelta() {},
            onTextDelta() {},
            onToolUseStart(name) {
              onStatus?.("thinking", `Debug agent: ${name}...`);
            },
            onContentBlockStop(type, data) {
              if (type === "thinking") {
                log("Debug Agent", data, "thinking");
              }
            },
          },
        });
        contentBlocks = result.contentBlocks;
        stopReason = result.stopReason;
      } catch (err) {
        if (err.name === "AbortError") throw err;
        log("Debug Agent", `LLM error: ${err.message}`, "error");
        return `Debug sub-agent failed: ${err.message}`;
      }

      if (!contentBlocks?.length) break;

      // Process content blocks
      for (const block of contentBlocks) {
        if (block.type === "text" && block.text?.trim()) {
          lastText = block.text;
        } else if (block.type === "tool_use") {
          log("Debug Agent", `Tool: ${block.name}`, "thinking");
        }
      }

      // Store assistant message (strip thinking)
      const storedBlocks = contentBlocks.filter(b => b.type !== "thinking");
      messages.push({
        role: "assistant",
        content: storedBlocks.length ? storedBlocks : [{ type: "text", text: "(analyzing)" }],
      });

      if (stopReason !== "tool_use") break;

      // Execute tool calls (read-only tools only)
      const toolBlocks = contentBlocks.filter(b => b.type === "tool_use");
      const toolResults = [];

      for (const block of toolBlocks) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        let result;
        let isError = false;
        try {
          if (!DEBUG_TOOLS_NAMES.has(block.name)) {
            result = `Error: tool '${block.name}' is not available to the debug sub-agent.`;
            isError = true;
          } else {
            result = await handleTool(block.name, block.input, broadcast, {
              errorCollector,
              engineRef: errorCollector.getEngineRef(),
            });
          }
        } catch (e) {
          result = `Error: ${e.message}`;
          isError = true;
        }

        // Handle image results from capture_viewport
        let tr;
        if (result && typeof result === "object" && result.__type === "image" && visionEnabled) {
          tr = {
            type: "tool_result",
            tool_use_id: block.id,
            content: [
              { type: "text", text: result.text || "Viewport capture:" },
              { type: "image", source: { type: "base64", media_type: result.media_type, data: result.data } },
            ],
          };
        } else {
          const resultStr = typeof result === "string" ? result : JSON.stringify(result);
          tr = {
            type: "tool_result",
            tool_use_id: block.id,
            content: resultStr || "(empty result)",
          };
        }
        if (isError) tr.is_error = true;
        toolResults.push(tr);
      }

      messages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      log("Debug Agent", "Cancelled", "info");
      return "Debug sub-agent was cancelled.";
    }
    return `Debug sub-agent error: ${err.message}`;
  }

  log("Debug Agent", lastText || "No diagnosis produced", "info");
  onStatus?.("thinking", "디버그 분석 완료");
  return lastText || "Debug sub-agent could not produce a diagnosis.";
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
async function runPlanner({ apiKey, userPrompt, conversation, currentState, log, onStatus, signal, provider = "anthropic", providerConfig = {} }) {
  onStatus?.("thinking", "작업 계획 중...");
  log("System", "Running planner for execution context rebuild", "info");

  const plannerMessages = buildPlannerMessages(userPrompt, conversation, currentState);

  try {
    const { getSmallModel } = await import("./llmClient.js");
    const plannerModel = provider === "anthropic" ? PLANNER_MODEL : (getSmallModel(provider) || providerConfig.model || PLANNER_MODEL);

    const result = await callLLM({
      provider,
      apiKey,
      baseUrl: providerConfig.base_url,
      model: plannerModel,
      maxTokens: PLANNER_MAX_TOKENS,
      system: PLANNER_SYSTEM,
      messages: plannerMessages,
      tools: [],
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
  onTextDelta,
  onTextFinalize,
  onStatus,
  files,
  messages, // original conversation (mutated)
  currentState, // { scene_json, ui_config, panels, assets }
  errorCollector,
  userAnswerPromise,
  preprocessPromise,
  recordingDonePromise,
  signal,
  injectedMessages = [],
  systemPromptAddition = "",
  assetContext = [],
  backendTarget = "auto",
  modelOverride,
  provider = "anthropic",
  providerConfig = {},
  toolResultCache,
  resumeContext = null,
}) {
  // --- Checkpoint resume: if we have a checkpoint with a written scene, resume from it ---
  if (resumeContext && resumeContext.checkpoint?.sceneWritten) {
    log("System", "Resuming from checkpoint — rebuilding context", "info");
    onStatus?.("thinking", "이전 작업에서 이어서 진행합니다...");

    const baseSystemPrompt = await buildAugmentedSystemPrompt(
      buildSystemPrompt(userPrompt, !!files?.length, detectPlatformType(), { backendTarget }),
      { userPrompt, backendTarget, assetContext, systemPromptAddition, conversationHistory: messages },
    );

    const { systemPrompt: resumeSystemPrompt, messages: resumeMessages } =
      buildResumeContext(resumeContext.checkpoint, resumeContext.currentScene, baseSystemPrompt);

    // Push user prompt to original conversation for history
    messages.push({ role: "user", content: userPrompt });

    const result = await _runAgentLoop({
      apiKey,
      systemPrompt: resumeSystemPrompt,
      messages: resumeMessages,
      log, broadcast, onText, onTextDelta, onTextFinalize, onStatus,
      errorCollector, userAnswerPromise, preprocessPromise, recordingDonePromise,
      signal, injectedMessages, modelOverride, provider, providerConfig, toolResultCache,
      _cpUserPrompt: userPrompt,
      _cpCompletedSteps: resumeContext.checkpoint.completedSteps || [],
    });

    const lastAssistant = resumeMessages.filter(m => m.role === "assistant").pop();
    if (lastAssistant) messages.push(lastAssistant);
    return result;
  }

  // Improvement #4: pass richer context to shouldPlan
  const recentErrorCount = messages.slice(-10).filter(m => {
    if (!Array.isArray(m.content)) return false;
    return m.content.some(b => b?.type === "tool_result" &&
      typeof b.content === "string" &&
      (b.content.includes("Script errors") || b.content.includes("FAILED")));
  }).length;
  const previousPrompt = messages.filter(m => m.role === "user" && typeof m.content === "string")
    .slice(-2, -1)[0]?.content || "";

  // Detect if a plan was recently executed (within last 6 messages).
  // The plan-based generator inserts "[Execution context rebuilt]" style messages,
  // but more reliably, check if the last few user messages include "Proceed with the execution plan."
  const recentPlanExecuted = messages.slice(-6).some(m =>
    m.role === "user" && typeof m.content === "string" &&
    m.content.includes("Proceed with the execution plan"));

  if (!shouldPlan(messages.length, userPrompt, { recentErrors: recentErrorCount, previousPrompt, recentPlanExecuted })) {
    return runAgent({
      apiKey, userPrompt, log, broadcast, onText, onTextDelta, onTextFinalize, onStatus,
      files, messages, errorCollector, userAnswerPromise, preprocessPromise, recordingDonePromise,
      signal, injectedMessages, systemPromptAddition, assetContext, backendTarget, modelOverride,
      provider, providerConfig, toolResultCache,
    });
  }

  // --- Phase 1: Plan ---
  const plan = await runPlanner({
    apiKey, userPrompt, conversation: messages, currentState,
    log, onStatus, signal, provider, providerConfig,
  });

  if (!plan) {
    // Fallback: direct execution
    return runAgent({
      apiKey, userPrompt, log, broadcast, onText, onTextDelta, onTextFinalize, onStatus,
      files, messages, errorCollector, userAnswerPromise, preprocessPromise, recordingDonePromise,
      signal, injectedMessages, systemPromptAddition, assetContext, backendTarget, modelOverride,
      provider, providerConfig, toolResultCache,
    });
  }

  // --- Phase 2: Rebuild execution context ---
  onStatus?.("thinking", "실행 컨텍스트 구성 중...");

  const baseSystemPrompt = await buildAugmentedSystemPrompt(
    buildSystemPrompt(userPrompt, !!files?.length, detectPlatformType(), { backendTarget }),
    { userPrompt, backendTarget, assetContext, systemPromptAddition, conversationHistory: messages },
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

  // Save plan checkpoint at plan start
  _saveCheckpoint({
    userPrompt,
    plan,
    completedSteps: [],
    lastTool: null,
    sceneWritten: false,
  });

  // Run the generator loop using the fresh execution context
  const result = await _runAgentLoop({
    apiKey,
    systemPrompt: execSystemPrompt,
    messages: execMessages,
    log,
    broadcast,
    onText,
    onTextDelta,
    onTextFinalize,
    onStatus,
    errorCollector,
    userAnswerPromise,
    preprocessPromise,
    recordingDonePromise,
    signal,
    injectedMessages,
    modelOverride,
    provider,
    providerConfig,
    toolResultCache,
    _cpUserPrompt: userPrompt,
    _cpCompletedSteps: [],
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
