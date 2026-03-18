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
- Be concise — every token in the plan costs context for the generator.
- For complex scenes (particle systems, multi-pass rendering, fluid sim):
  Step 1 should ALWAYS be: write_scene with MINIMAL working skeleton (core structure + basic rendering, < 80 lines).
  Subsequent steps should add features ONE AT A TIME via edit_scene.
  Each step should be independently testable via check_browser_errors.
  NEVER plan to write more than 80 lines in a single write_scene call.`;

// ---------------------------------------------------------------------------
// Planner model — use Haiku for speed/cost
// ---------------------------------------------------------------------------

const PLANNER_MODEL = "claude-haiku-4-5-20251001";
const PLANNER_MAX_TOKENS = 2048;

function describeAttachedFiles(files = []) {
  if (!files.length) return "";
  return files
    .map(
      (f) =>
        `- ${f.name} (${f.size ?? "unknown"} bytes, ${f.mime_type || "unknown type"}) — ` +
        `read via uploads/${f.name}`
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Should we use planning?
// ---------------------------------------------------------------------------

/**
 * Detect simple edit requests that don't benefit from planning.
 * Uniform tweaks, parameter changes, small config edits, color changes, etc.
 */
const SIMPLE_EDIT_PATTERNS = [
  // Uniform / parameter changes
  /(?:uniform|파라미터|매개변수|변수|값|value)\s*.*(?:바꿔|바꾸|변경|수정|set|change|update|adjust)/i,
  /(?:바꿔|바꾸|변경|수정|set|change|update|adjust)\s*.*(?:uniform|파라미터|매개변수|변수|값|value)/i,
  // Specific value assignments
  /(?:u_\w+|speed|color|size|scale|opacity|alpha|radius|intensity|frequency|amplitude)\s*(?:를|을|을|로|=|to|→)\s*[\d.]+/i,
  /[\d.]+\s*(?:로|으로)\s*(?:바꿔|바꾸|변경|수정|설정|해줘|해)/i,
  // Color changes
  /(?:색|색상|color|배경|background)\s*.*(?:바꿔|바꾸|변경|수정|change)/i,
  /(?:바꿔|바꾸|변경|수정|change)\s*.*(?:색|색상|color|배경|background)/i,
  // Simple toggle/on-off
  /(?:켜|꺼|끄|활성|비활성|enable|disable|toggle|on|off)\s*(?:줘|해|해줘)?$/i,
  // Speed/size quick adjustments
  /(?:더\s*(?:빠르|느리|크|작|밝|어두)|(?:fast|slow|big|small|bright|dark)er)/i,
  // Short imperative edits (Korean)
  /^.{0,30}(?:해줘|해\s*$|바꿔|바꾸자|수정해|고쳐|변경해)/,
];

export function isSimpleEditRequest(text) {
  const t = text.trim();
  // Very long prompts are unlikely to be simple edits
  if (t.length > 120) return false;
  return SIMPLE_EDIT_PATTERNS.some(re => re.test(t));
}

/**
 * Extract simple topic keywords from text (words > 3 chars, lowercased).
 */
function extractTopicKeywords(text) {
  const stopWords = new Set([
    "this", "that", "with", "from", "have", "what", "make", "just",
    "want", "need", "like", "also", "please", "could", "would", "should",
    "으로", "에서", "하고", "해주", "해줘", "좀", "것", "거", "이것",
  ]);
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
}

/**
 * Compute keyword overlap ratio between two keyword sets.
 * Returns 0.0 (no overlap) to 1.0 (identical).
 */
function keywordOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const matches = a.filter(w => setB.has(w)).length;
  return matches / Math.max(a.length, b.length);
}

/**
 * Detect follow-up / continuation messages that should NOT trigger replanning.
 * These are short directives that refer to the agent's previous output.
 */
const FOLLOWUP_PATTERNS = [
  // Korean follow-ups
  /^(?:계속|계속해|계속하자|이어서|이어서\s*해|진행해|진행하자|반영해|그렇게\s*해|그래\s*해|ㄱㄱ)(?:\s*줘|주세요|요)?$/i,
  /^(?:응|네|ㅇㅇ|그래|좋아|알겠어|맞아)\s*.{0,20}(?:해줘|해|반영|진행|계속|적용)/i,
  /^(?:그거|그것|위에|방금)\s*.{0,15}(?:해줘|해|적용|반영|진행)/i,
  // English follow-ups
  /^(?:continue|go ahead|proceed|do it|apply|yes.*do|keep going|carry on)[\s.!]*$/i,
  /^(?:sounds good|looks good|lgtm|perfect|great|nice)[\s,.!]*(?:do it|go ahead|proceed|apply)?[\s.!]*$/i,
];

function isFollowUp(text) {
  const t = text.trim();
  if (t.length > 80) return false;
  return FOLLOWUP_PATTERNS.some(re => re.test(t));
}

/**
 * Heuristic: planning is valuable when the conversation is long enough
 * that context pollution becomes a concern, when the topic changes
 * dramatically, or when repeated failures suggest a fresh approach is needed.
 *
 * @param {number} conversationLength - number of messages in this.conversation
 * @param {string} userPrompt - the new user message
 * @param {Object} [opts] - additional context
 * @param {number} [opts.recentErrors] - number of recent error-fix cycles
 * @param {string} [opts.previousPrompt] - the previous user prompt for topic change detection
 * @param {boolean} [opts.recentPlanExecuted] - true if a plan was executed within the last few turns
 * @returns {boolean}
 */
export function shouldPlan(conversationLength, userPrompt, opts = {}) {
  const { recentErrors = 0, previousPrompt = "", recentPlanExecuted = false } = opts;

  const trimmed = userPrompt.trim();

  // Very short prompts are likely follow-ups ("네", "ok", "ㅇㅇ")
  if (trimmed.length < 10) return false;

  // Simple affirmatives / negatives
  const simple = ["yes", "no", "ok", "ㅇㅇ", "ㄴㄴ", "네", "아니요", "응", "ㅇ", "ㄴ"];
  if (simple.includes(trimmed.toLowerCase())) return false;

  // Follow-up / continuation messages — skip planning, continue current work
  if (isFollowUp(trimmed)) return false;

  // If a plan was recently executed and this is a short prompt (likely a follow-up
  // or minor adjustment), skip replanning to avoid cascading planner calls
  if (recentPlanExecuted && trimmed.length < 60) return false;

  // Improvement #4a: repeated failures → plan regardless of conversation length
  if (recentErrors >= 3 && conversationLength >= 6) return true;

  // Short conversations don't need planning — context is clean
  if (conversationLength < 10) return false;

  // Simple edit requests — uniform tweaks, parameter changes, small config edits
  if (isSimpleEditRequest(trimmed)) return false;

  // Improvement #4b: topic change detection — plan if the new prompt diverges significantly
  if (previousPrompt && conversationLength >= 6) {
    const prevKeywords = extractTopicKeywords(previousPrompt);
    const newKeywords = extractTopicKeywords(trimmed);
    if (newKeywords.length >= 2 && keywordOverlap(newKeywords, prevKeywords) < 0.2) {
      return true;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Build planner messages
// ---------------------------------------------------------------------------

/**
 * Build the messages array for the planner call.
 * Includes a condensed conversation summary + current state + new request.
 */
export function buildPlannerMessages(userPrompt, conversation, currentState, files = []) {
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
  // Include workspace file names so planner knows what code modules exist
  const wsFiles = currentState.workspaceFiles || {};
  const wsKeys = Object.keys(wsFiles);
  if (wsKeys.length) {
    parts.push(`Workspace files: ${wsKeys.join(", ")}`);
  }
  if (files.length) {
    parts.push(`Attached files:\n${describeAttachedFiles(files)}`);
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
export function buildExecutionContext(plan, currentState, baseSystemPrompt, files = []) {
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
    "",
    "IMPORTANT: Build the scene INCREMENTALLY.",
    "Phase 1: write_scene with minimal working code (< 80 lines).",
    "Phase 2: edit_scene to add features one at a time.",
    "Each edit_scene must be followed by check_browser_errors.",
  );

  systemPrompt += planSection.join("\n");

  // ---- Build user message with relevant state ----
  const contextParts = [];

  if (plan.relevant_state.needs_current_scene && currentState.scene_json) {
    const sceneStr = JSON.stringify(currentState.scene_json, null, 2);
    // Truncate very large scenes to keep context manageable
    const truncated = sceneStr.length > 8000 ? sceneStr.slice(0, 8000) + "\n...(truncated)" : sceneStr;
    contextParts.push(`Current scene.json:\n\`\`\`json\n${truncated}\n\`\`\``);

    // Include workspace files — shader modules, helper scripts, etc.
    // that the scene's setup/render scripts reference
    const wsFiles = currentState.workspaceFiles || {};
    const wsEntries = Object.entries(wsFiles);
    if (wsEntries.length > 0) {
      let wsSection = "## Workspace files (code modules used by the scene)";
      let totalChars = 0;
      const WS_BUDGET = 12000; // total char budget for workspace files
      for (const [path, content] of wsEntries) {
        if (totalChars >= WS_BUDGET) {
          wsSection += `\n\n... (${wsEntries.length - wsEntries.indexOf([path, content])} more files omitted)`;
          break;
        }
        const remaining = WS_BUDGET - totalChars;
        const trimmed = content.length > remaining ? content.slice(0, remaining) + "\n...(truncated)" : content;
        wsSection += `\n\n### ${path}\n\`\`\`\n${trimmed}\n\`\`\``;
        totalChars += trimmed.length;
      }
      contextParts.push(wsSection);
    }
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
  if (files.length) {
    contextParts.push(`Attached files for this request:\n${describeAttachedFiles(files)}`);
  }

  const userContent = contextParts.length
    ? `${contextParts.join("\n\n")}\n\nProceed with the execution plan.`
    : "Proceed with the execution plan.";

  const messages = [{ role: "user", content: userContent }];

  return { systemPrompt, messages };
}

// ---------------------------------------------------------------------------
// Resume context (checkpoint recovery)
// ---------------------------------------------------------------------------

/**
 * Build a fresh system prompt + messages for resuming from a checkpoint.
 * The agent sees what was already completed and continues from there.
 *
 * @param {Object} checkpoint - saved checkpoint data
 * @param {Object} currentScene - current scene.json from IndexedDB
 * @param {string} baseSystemPrompt - the normal full system prompt
 * @returns {{ systemPrompt: string, messages: Array }}
 */
export function buildResumeContext(checkpoint, currentScene, baseSystemPrompt) {
  const { plan, completedSteps = [], userPrompt } = checkpoint;

  let resumeSection = "\n\n## RESUME FROM CHECKPOINT";
  resumeSection += `\nThe previous session was interrupted. The user's original request: "${userPrompt}"`;

  if (plan && plan.steps) {
    const stepsWithStatus = plan.steps.map((s, i) =>
      completedSteps.includes(i) ? `${i + 1}. [DONE] ${s}` : `${i + 1}. ${s}`
    );
    const nextStep = completedSteps.length + 1;
    resumeSection += `\n\nPlan:\n${stepsWithStatus.join("\n")}`;
    resumeSection += `\n\nContinue from step ${nextStep}. Do NOT redo completed steps.`;
  } else {
    resumeSection += "\nA scene was already written. Review it and continue improving or adding features.";
  }

  const systemPrompt = baseSystemPrompt + resumeSection;

  // Provide the current scene code so the agent knows what exists
  const sceneStr = JSON.stringify(currentScene, null, 2);
  const truncated = sceneStr.length > 10000 ? sceneStr.slice(0, 10000) + "\n...(truncated)" : sceneStr;

  const messages = [{
    role: "user",
    content: `The following scene.json was already written before the interruption:\n\`\`\`json\n${truncated}\n\`\`\`\n\nContinue from where the previous session left off. Do NOT rewrite the scene from scratch — use edit_scene to add missing features or fix issues.`,
  }];

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
