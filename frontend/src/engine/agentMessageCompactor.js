/**
 * Agent message compaction — strip thinking, truncate, summarize, trim.
 * Extracted from agentExecutor.js for modularity.
 */

import { sanitizeOrphanedToolUse } from "./sanitizeMessages.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function stripThinking(messages) {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if (!Array.isArray(msg.content)) continue;
    const filtered = msg.content.filter(
      (block) => !(typeof block === "object" && block.type === "thinking")
    );
    msg.content = filtered.length ? filtered : [{ type: "text", text: "(continued)" }];
  }
}

/** Identify landmark messages that should be preserved during compaction. */
export function findLandmarks(messages) {
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
export function summarizeFailedCycle(messages, startIdx, endIdx) {
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

function serializeForSummary(messages, maxChars) {
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

async function llmSummarize(messages, { apiKey, provider, providerConfig, log }) {
  const keepRecent = 6;
  const recentStart = Math.max(0, messages.length - keepRecent);

  const toSummarize = messages.slice(1, recentStart);
  if (toSummarize.length < 4) return;

  const serialized = serializeForSummary(toSummarize, 8000);

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
    if (!summary) return;

    const kept = [
      messages[0],
      { role: "user", content: `[CONVERSATION SUMMARY]\n${summary}` },
      { role: "assistant", content: [{ type: "text", text: "Understood. I have the context from the summary above." }] },
      ...messages.slice(recentStart),
    ];
    messages.length = 0;
    messages.push(...kept);
    if (log) log("System", `Conversation summarized (${toSummarize.length} messages → summary)`, "info");
  } catch (e) {
    if (log) log("System", `LLM summarization failed: ${e.message} — falling back to truncation`, "info");
  }
}

// ---------------------------------------------------------------------------
// Main compaction function
// ---------------------------------------------------------------------------

export async function compactMessages(messages, { apiKey, provider, providerConfig, log } = {}) {
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
    await llmSummarize(messages, { apiKey, provider, providerConfig, log });
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
        const summary = summarizeFailedCycle(messages, rangeStart, i - 1);
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

  // Final safety pass
  sanitizeOrphanedToolUse(messages);
}
