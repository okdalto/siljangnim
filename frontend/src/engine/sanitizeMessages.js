/**
 * Orphaned tool_use sanitizer — fixes conversation history after stream drops.
 * Extracted from agentExecutor.js for modularity.
 */

/**
 * Scan conversation history and fix orphaned tool_use blocks.
 * An orphaned tool_use is an assistant message containing tool_use blocks
 * that are NOT followed by a user message with matching tool_result blocks.
 * This can happen after stream drops, max_tokens interruptions, or compaction.
 */
export function sanitizeOrphanedToolUse(messages, log) {
  const fixes = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

    const toolUseIds = msg.content
      .filter(b => b.type === "tool_use" && b.id)
      .map(b => b.id);
    if (!toolUseIds.length) continue;

    const nextMsg = messages[i + 1];
    if (nextMsg?.role === "user") {
      const blocks = Array.isArray(nextMsg.content) ? nextMsg.content : [];
      const resultIds = new Set(
        blocks.filter(b => b.type === "tool_result").map(b => b.tool_use_id)
      );
      const missingIds = toolUseIds.filter(id => !resultIds.has(id));
      if (missingIds.length) {
        fixes.push({ assistantIdx: i, missingIds, patchNext: true });
      }
    } else {
      fixes.push({ assistantIdx: i, missingIds: toolUseIds, patchNext: false });
    }
  }

  if (!fixes.length) return;

  const needsInsert = new Set();
  const needsPatch = new Map();

  for (const fix of fixes) {
    if (fix.patchNext) {
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

  const result = [];
  let totalPatched = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (needsPatch.has(i) && msg.role === "user") {
      const ids = needsPatch.get(i);
      if (!Array.isArray(msg.content)) {
        msg.content = [{ type: "text", text: msg.content || "" }];
      }
      msg.content.push(...makeSyntheticResults(ids));
      totalPatched += ids.length;
    }

    result.push(msg);

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
