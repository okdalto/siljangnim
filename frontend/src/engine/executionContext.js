/**
 * Execution Context Rebuild — Plan-based generation.
 *
 * After long conversations, the generator's context gets polluted with
 * discarded ideas, failed attempts, and verbose history. This module
 * introduces a planner→generator split:
 *
 *   1. Planner  — lightweight LLM call that reads the full conversation
 *                 and produces a structured execution plan.
 *   2. Rebuild  — creates a fresh, minimal context from the plan +
 *                 current workspace state snapshot.
 *   3. Generator — runs the normal agent loop with the rebuilt context
 *                 (no stale history).
 */

// ---------------------------------------------------------------------------
// Planner system prompt
// ---------------------------------------------------------------------------

const PLANNER_SYSTEM = `\
You are the planning module of siljangnim, a real-time visual creation tool with WebGL2 (default) and WebGPU backends.

Your job: analyse the user's request in the context of the current workspace and produce a structured JSON execution plan. A separate generator module will execute this plan — it will have NO access to the conversation history, only your plan and a workspace snapshot.

**Backend awareness**: The tool supports both WebGL2 and WebGPU. If the user requests WebGPU, compute shaders, WGSL, or the current scene has \`backendTarget: "webgpu"\`, the plan MUST specify WebGPU as the target backend. Include this in constraints (e.g., "use WebGPU backend with backendTarget: webgpu").

Output ONLY a JSON object (no markdown fences):
{
  "intent": "create" | "modify" | "fix" | "explain" | "configure",
  "summary": "1-2 sentence description of what to accomplish",
  "steps": ["concise step 1", "concise step 2", ...],
  "relevant_state": {
    "needs_current_scene": true/false,
    "needs_panels": true/false,
    "needs_assets": true/false
  },
  "constraints": ["things to preserve or avoid"],
  "style_notes": "visual / artistic direction if any"
}

Guidelines:
- Focus on WHAT to do, not HOW (the generator knows the tools).
- Keep steps actionable and ordered.
- If the request modifies existing work, set needs_current_scene=true.
- If the request references uploaded assets, set needs_assets=true.
- constraints should mention things the user explicitly wants preserved.
- Be concise — every token in the plan costs context for the generator.`;

// ---------------------------------------------------------------------------
// Planner model — use Haiku for speed/cost
// ---------------------------------------------------------------------------

const PLANNER_MODEL = "claude-haiku-4-5-20251001";
const PLANNER_MAX_TOKENS = 2048;

// ---------------------------------------------------------------------------
// Should we use planning?
// ---------------------------------------------------------------------------

/**
 * Heuristic: planning is valuable when the conversation is long enough
 * that context pollution becomes a concern.
 *
 * @param {number} conversationLength - number of messages in this.conversation
 * @param {string} userPrompt - the new user message
 * @returns {boolean}
 */
export function shouldPlan(conversationLength, userPrompt) {
  // Short conversations don't need planning — context is clean
  if (conversationLength < 10) return false;

  const trimmed = userPrompt.trim();

  // Very short prompts are likely follow-ups ("네", "ok", "ㅇㅇ")
  if (trimmed.length < 10) return false;

  // Simple affirmatives / negatives
  const simple = ["yes", "no", "ok", "ㅇㅇ", "ㄴㄴ", "네", "아니요", "응", "ㅇ", "ㄴ"];
  if (simple.includes(trimmed.toLowerCase())) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Build planner messages
// ---------------------------------------------------------------------------

/**
 * Build the messages array for the planner call.
 * Includes a condensed conversation summary + current state + new request.
 */
export function buildPlannerMessages(userPrompt, conversation, currentState) {
  const messages = [];

  // Include recent conversation exchanges (condensed)
  const recent = conversation.slice(-8);
  for (const msg of recent) {
    if (msg.role === "user") {
      const text = extractText(msg.content);
      if (text) messages.push({ role: "user", content: text.slice(0, 400) });
    } else if (msg.role === "assistant") {
      const text = extractAssistantText(msg.content);
      if (text) messages.push({ role: "assistant", content: text.slice(0, 300) });
    }
    // Skip tool_result messages entirely — planner doesn't need them
  }

  // Build state summary
  const parts = ["[Current workspace state]"];
  const scene = currentState.scene_json;
  if (scene?.script?.render) {
    parts.push(`Scene: active (render ${scene.script.render.length} chars)`);
    if (scene.uniforms) {
      parts.push(`Uniforms: ${Object.keys(scene.uniforms).join(", ")}`);
    }
  } else {
    parts.push("Scene: empty");
  }
  if (currentState.assets?.length) {
    parts.push(`Assets: ${currentState.assets.map((a) => a.semanticName || a.filename).join(", ")}`);
  }
  if (currentState.panels && Object.keys(currentState.panels).length) {
    parts.push(`Panels: ${Object.keys(currentState.panels).join(", ")}`);
  }

  messages.push({
    role: "user",
    content: `${parts.join("\n")}\n\n[New request]\n${userPrompt}`,
  });

  return messages;
}

// ---------------------------------------------------------------------------
// Parse planner response
// ---------------------------------------------------------------------------

/**
 * Extract the JSON plan from the planner's text response.
 * Returns null if parsing fails.
 */
export function parsePlan(text) {
  // Try to extract JSON object
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const plan = JSON.parse(match[0]);
    if (!plan.intent || !plan.summary || !Array.isArray(plan.steps)) return null;
    // Defaults
    plan.relevant_state = plan.relevant_state || {};
    plan.constraints = plan.constraints || [];
    plan.style_notes = plan.style_notes || "";
    return plan;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Execution context rebuild
// ---------------------------------------------------------------------------

/**
 * Build a fresh system prompt + messages array for the generator,
 * using ONLY the approved plan and current workspace state.
 *
 * @param {Object} plan - parsed execution plan
 * @param {Object} currentState - { scene_json, ui_config, panels, assets }
 * @param {string} baseSystemPrompt - the normal full system prompt
 * @returns {{ systemPrompt: string, messages: Array }}
 */
export function buildExecutionContext(plan, currentState, baseSystemPrompt) {
  // ---- Enhanced system prompt with plan ----
  let systemPrompt = baseSystemPrompt;

  const planSection = [
    "\n\n## EXECUTION PLAN (APPROVED)",
    `Intent: ${plan.intent}`,
    `Summary: ${plan.summary}`,
    "",
    "Steps:",
    ...plan.steps.map((s, i) => `${i + 1}. ${s}`),
  ];

  if (plan.constraints.length) {
    planSection.push("", "Constraints:");
    for (const c of plan.constraints) planSection.push(`- ${c}`);
  }
  if (plan.style_notes) {
    planSection.push("", `Style direction: ${plan.style_notes}`);
  }

  planSection.push(
    "",
    "Execute this plan step by step. Do not deviate from the approved steps.",
    "You do NOT have access to prior conversation — all relevant context is provided below.",
  );

  systemPrompt += planSection.join("\n");

  // ---- Build user message with relevant state ----
  const contextParts = [];

  if (plan.relevant_state.needs_current_scene && currentState.scene_json) {
    const sceneStr = JSON.stringify(currentState.scene_json, null, 2);
    // Truncate very large scenes to keep context manageable
    const truncated = sceneStr.length > 8000 ? sceneStr.slice(0, 8000) + "\n...(truncated)" : sceneStr;
    contextParts.push(`Current scene.json:\n\`\`\`json\n${truncated}\n\`\`\``);
  }

  if (plan.relevant_state.needs_panels && currentState.panels) {
    const panelKeys = Object.keys(currentState.panels);
    if (panelKeys.length) {
      contextParts.push(`Active panels: ${panelKeys.join(", ")}`);
    }
  }

  if (plan.relevant_state.needs_assets && currentState.assets?.length) {
    const assetLines = currentState.assets.map(
      (a) => `- "${a.semanticName}" (${a.filename}, ${a.category}${a.processingStatus !== "ready" ? `, ${a.processingStatus}` : ""})`
    );
    contextParts.push(`Workspace assets:\n${assetLines.join("\n")}`);
  }

  const userContent = contextParts.length
    ? `${contextParts.join("\n\n")}\n\nProceed with the execution plan.`
    : "Proceed with the execution plan.";

  const messages = [{ role: "user", content: userContent }];

  return { systemPrompt, messages };
}

// ---------------------------------------------------------------------------
// Exports for planner call configuration
// ---------------------------------------------------------------------------

export { PLANNER_SYSTEM, PLANNER_MODEL, PLANNER_MAX_TOKENS };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => typeof b === "string" || b?.type === "text");
    if (typeof textBlock === "string") return textBlock;
    return textBlock?.text || "";
  }
  return "";
}

function extractAssistantText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === "text")
      .map((b) => b.text)
      .join("\n")
      .slice(0, 300);
  }
  return "";
}
