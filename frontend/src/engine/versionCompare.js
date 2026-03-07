/**
 * Version Compare — diff utilities for comparing two node states.
 *
 * Produces structured diffs for: shaders, uniforms, prompts, timelines,
 * and metadata. Used by VersionComparePanel for visual + code comparison.
 */

// ---------------------------------------------------------------------------
// Text diff (line-level, for shader code)
// ---------------------------------------------------------------------------

/**
 * Simple line-level diff using LCS.
 * Returns array of { type: "same" | "add" | "remove", line: string }
 */
export function diffLines(oldText, newText) {
  if (oldText === newText) return [{ type: "same", text: oldText }];
  if (!oldText && newText) return newText.split("\n").map((l) => ({ type: "add", line: l }));
  if (oldText && !newText) return oldText.split("\n").map((l) => ({ type: "remove", line: l }));

  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");

  // LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "same", line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", line: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "remove", line: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Shader diff
// ---------------------------------------------------------------------------

function extractShaderSource(sceneJson) {
  if (!sceneJson) return { setup: "", render: "", cleanup: "" };
  const script = sceneJson.script || {};
  return {
    setup: script.setup || "",
    render: script.render || "",
    cleanup: script.cleanup || "",
  };
}

export function diffShaders(stateA, stateB) {
  const a = extractShaderSource(stateA.scene_json);
  const b = extractShaderSource(stateB.scene_json);

  return {
    setup: { changed: a.setup !== b.setup, diff: diffLines(a.setup, b.setup) },
    render: { changed: a.render !== b.render, diff: diffLines(a.render, b.render) },
    cleanup: { changed: a.cleanup !== b.cleanup, diff: diffLines(a.cleanup, b.cleanup) },
    hasChanges: a.setup !== b.setup || a.render !== b.render || a.cleanup !== b.cleanup,
  };
}

// ---------------------------------------------------------------------------
// Uniform diff
// ---------------------------------------------------------------------------

export function diffUniforms(stateA, stateB) {
  const uA = stateA.scene_json?.uniforms || {};
  const uB = stateB.scene_json?.uniforms || {};
  const allKeys = new Set([...Object.keys(uA), ...Object.keys(uB)]);

  const changes = [];
  for (const key of allKeys) {
    const a = uA[key];
    const b = uB[key];
    const aVal = a ? JSON.stringify(a.value) : undefined;
    const bVal = b ? JSON.stringify(b.value) : undefined;

    if (!a && b) {
      changes.push({ uniform: key, type: "added", oldValue: null, newValue: b.value, oldDef: null, newDef: b });
    } else if (a && !b) {
      changes.push({ uniform: key, type: "removed", oldValue: a.value, newValue: null, oldDef: a, newDef: null });
    } else if (aVal !== bVal) {
      changes.push({ uniform: key, type: "changed", oldValue: a.value, newValue: b.value, oldDef: a, newDef: b });
    }
  }

  return { changes, hasChanges: changes.length > 0 };
}

// ---------------------------------------------------------------------------
// Prompt diff
// ---------------------------------------------------------------------------

export function diffPrompts(stateA, stateB) {
  const msgsA = stateA.chat_history || [];
  const msgsB = stateB.chat_history || [];

  // Find messages that are in B but not in A (new messages)
  const newMessages = msgsB.slice(msgsA.length);
  const removedMessages = msgsA.slice(msgsB.length);

  // Check if shared prefix matches
  const sharedLen = Math.min(msgsA.length, msgsB.length);
  const modifiedIndices = [];
  for (let i = 0; i < sharedLen; i++) {
    if (msgsA[i]?.content !== msgsB[i]?.content || msgsA[i]?.text !== msgsB[i]?.text) {
      modifiedIndices.push(i);
    }
  }

  return {
    totalA: msgsA.length,
    totalB: msgsB.length,
    newMessages,
    removedMessages,
    modifiedIndices,
    hasChanges: newMessages.length > 0 || removedMessages.length > 0 || modifiedIndices.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Timeline / workspace state diff
// ---------------------------------------------------------------------------

export function diffTimeline(stateA, stateB) {
  const wsA = stateA.workspace_state || {};
  const wsB = stateB.workspace_state || {};

  const durationChanged = wsA.duration !== wsB.duration;
  const loopChanged = wsA.loop !== wsB.loop;

  // Keyframe tracks diff
  const kfA = wsA.keyframes || {};
  const kfB = wsB.keyframes || {};
  const allTracks = new Set([...Object.keys(kfA), ...Object.keys(kfB)]);

  const trackChanges = [];
  for (const track of allTracks) {
    const a = JSON.stringify(kfA[track] || []);
    const b = JSON.stringify(kfB[track] || []);
    if (a !== b) {
      trackChanges.push({
        track,
        oldKeyframes: kfA[track] || [],
        newKeyframes: kfB[track] || [],
      });
    }
  }

  return {
    durationChanged,
    loopChanged,
    oldDuration: wsA.duration,
    newDuration: wsB.duration,
    oldLoop: wsA.loop,
    newLoop: wsB.loop,
    trackChanges,
    hasChanges: durationChanged || loopChanged || trackChanges.length > 0,
  };
}

// ---------------------------------------------------------------------------
// UI controls diff
// ---------------------------------------------------------------------------

export function diffControls(stateA, stateB) {
  const cA = stateA.ui_config?.controls || [];
  const cB = stateB.ui_config?.controls || [];

  const namesA = new Set(cA.map((c) => c.uniform || c.label));
  const namesB = new Set(cB.map((c) => c.uniform || c.label));

  const added = cB.filter((c) => !namesA.has(c.uniform || c.label));
  const removed = cA.filter((c) => !namesB.has(c.uniform || c.label));

  return {
    added,
    removed,
    totalA: cA.length,
    totalB: cB.length,
    hasChanges: added.length > 0 || removed.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Metadata diff
// ---------------------------------------------------------------------------

export function diffMetadata(nodeA, nodeB) {
  const metaA = nodeA?.metadata || {};
  const metaB = nodeB?.metadata || {};
  const allKeys = new Set([...Object.keys(metaA), ...Object.keys(metaB)]);

  const changes = [];
  for (const key of allKeys) {
    if (JSON.stringify(metaA[key]) !== JSON.stringify(metaB[key])) {
      changes.push({ key, oldValue: metaA[key], newValue: metaB[key] });
    }
  }

  return { changes, hasChanges: changes.length > 0 };
}

// ---------------------------------------------------------------------------
// Asset diff
// ---------------------------------------------------------------------------

export function diffAssets(stateA, stateB) {
  const assetsA = stateA.workspace_state?.assets || {};
  const assetsB = stateB.workspace_state?.assets || {};
  const idsA = new Set(Object.keys(assetsA));
  const idsB = new Set(Object.keys(assetsB));

  const added = [];
  const removed = [];
  const changed = [];

  for (const id of idsB) {
    if (!idsA.has(id)) {
      added.push({ id, descriptor: assetsB[id] });
    }
  }
  for (const id of idsA) {
    if (!idsB.has(id)) {
      removed.push({ id, descriptor: assetsA[id] });
    }
  }
  for (const id of idsA) {
    if (idsB.has(id) && JSON.stringify(assetsA[id]) !== JSON.stringify(assetsB[id])) {
      changed.push({ id, oldDescriptor: assetsA[id], newDescriptor: assetsB[id] });
    }
  }

  return { added, removed, changed, hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0 };
}

// ---------------------------------------------------------------------------
// Backend diff
// ---------------------------------------------------------------------------

export function diffBackend(stateA, stateB) {
  const targetA = stateA.scene_json?.backendTarget || "auto";
  const targetB = stateB.scene_json?.backendTarget || "auto";
  const codeA = [stateA.scene_json?.script?.setup, stateA.scene_json?.script?.render, stateA.scene_json?.script?.cleanup].filter(Boolean).join("\n");
  const codeB = [stateB.scene_json?.script?.setup, stateB.scene_json?.script?.render, stateB.scene_json?.script?.cleanup].filter(Boolean).join("\n");

  const hasWgslA = codeA.includes("@vertex") || codeA.includes("@fragment") || codeA.includes("@compute");
  const hasWgslB = codeB.includes("@vertex") || codeB.includes("@fragment") || codeB.includes("@compute");
  const shaderLangA = hasWgslA ? "wgsl" : "glsl";
  const shaderLangB = hasWgslB ? "wgsl" : "glsl";

  return {
    targetChanged: targetA !== targetB,
    oldTarget: targetA,
    newTarget: targetB,
    shaderLangChanged: shaderLangA !== shaderLangB,
    oldShaderLang: shaderLangA,
    newShaderLang: shaderLangB,
    hasChanges: targetA !== targetB || shaderLangA !== shaderLangB,
  };
}

// ---------------------------------------------------------------------------
// Diff summary — human-readable description of changes
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable summary string from a structured compare result.
 * Example: "Added bloom post-processing, changed palette from warm to cool tones, increased animation speed."
 */
export function generateDiffSummary(compareResult) {
  const parts = [];

  // Shader changes
  const { shaders } = compareResult;
  if (shaders.hasChanges) {
    const sections = [];
    for (const section of ["setup", "render", "cleanup"]) {
      if (shaders[section].changed) {
        const diff = shaders[section].diff;
        const added = diff.filter((d) => d.type === "add").length;
        const removed = diff.filter((d) => d.type === "remove").length;
        const desc = [];
        if (added > 0) desc.push(`+${added}`);
        if (removed > 0) desc.push(`-${removed}`);
        sections.push(`${section} (${desc.join("/")} lines)`);
      }
    }
    if (sections.length > 0) {
      parts.push(`Shader changes in ${sections.join(", ")}`);
    }
  }

  // Uniform changes
  const { uniforms } = compareResult;
  if (uniforms.hasChanges) {
    const added = uniforms.changes.filter((c) => c.type === "added").map((c) => c.uniform);
    const removed = uniforms.changes.filter((c) => c.type === "removed").map((c) => c.uniform);
    const changed = uniforms.changes.filter((c) => c.type === "changed").map((c) => c.uniform);
    const desc = [];
    if (added.length > 0) desc.push(`added ${added.join(", ")}`);
    if (removed.length > 0) desc.push(`removed ${removed.join(", ")}`);
    if (changed.length > 0) desc.push(`changed ${changed.join(", ")}`);
    parts.push(`Uniforms: ${desc.join("; ")}`);
  }

  // Timeline changes
  const { timeline } = compareResult;
  if (timeline.hasChanges) {
    const desc = [];
    if (timeline.durationChanged) desc.push(`duration ${timeline.oldDuration}s \u2192 ${timeline.newDuration}s`);
    if (timeline.loopChanged) desc.push(`loop ${timeline.oldLoop} \u2192 ${timeline.newLoop}`);
    if (timeline.trackChanges.length > 0) desc.push(`${timeline.trackChanges.length} keyframe track(s) modified`);
    parts.push(`Timeline: ${desc.join(", ")}`);
  }

  // Prompt changes
  const { prompts } = compareResult;
  if (prompts.hasChanges) {
    const desc = [];
    if (prompts.newMessages.length > 0) desc.push(`${prompts.newMessages.length} new message(s)`);
    if (prompts.removedMessages.length > 0) desc.push(`${prompts.removedMessages.length} removed`);
    if (prompts.modifiedIndices.length > 0) desc.push(`${prompts.modifiedIndices.length} modified`);
    parts.push(`Prompts: ${desc.join(", ")}`);
  }

  // Asset changes
  const { assets } = compareResult;
  if (assets?.hasChanges) {
    const desc = [];
    if (assets.added.length > 0) desc.push(`${assets.added.length} added`);
    if (assets.removed.length > 0) desc.push(`${assets.removed.length} removed`);
    if (assets.changed.length > 0) desc.push(`${assets.changed.length} modified`);
    parts.push(`Assets: ${desc.join(", ")}`);
  }

  // Backend changes
  const { backend } = compareResult;
  if (backend?.hasChanges) {
    const desc = [];
    if (backend.targetChanged) desc.push(`target ${backend.oldTarget} → ${backend.newTarget}`);
    if (backend.shaderLangChanged) desc.push(`shader lang ${backend.oldShaderLang} → ${backend.newShaderLang}`);
    parts.push(`Backend: ${desc.join(", ")}`);
  }

  if (parts.length === 0) return "No significant changes detected.";
  return parts.join(". ") + ".";
}

/**
 * Generate an AI-powered diff summary using a lightweight LLM call.
 * Falls back to the rule-based summary on error.
 */
export async function generateAIDiffSummary(compareResult, apiKey) {
  if (!apiKey) return generateDiffSummary(compareResult);

  const ruleBased = generateDiffSummary(compareResult);

  // Build a compact context for the LLM
  const context = [];
  if (compareResult.shaders.hasChanges) {
    context.push(`Shader changes: setup=${compareResult.shaders.setup.changed}, render=${compareResult.shaders.render.changed}, cleanup=${compareResult.shaders.cleanup.changed}`);
  }
  if (compareResult.uniforms.hasChanges) {
    const uChanges = compareResult.uniforms.changes.map(c => `${c.uniform}: ${c.type}${c.type === "changed" ? ` (${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)})` : ""}`);
    context.push(`Uniform changes: ${uChanges.join(", ")}`);
  }
  if (compareResult.timeline?.hasChanges) {
    context.push(`Timeline changes: ${ruleBased.match(/Timeline: .+/)?.[0] || "modified"}`);
  }
  if (compareResult.assets?.hasChanges) {
    const a = compareResult.assets;
    context.push(`Asset changes: ${a.added.length} added, ${a.removed.length} removed, ${a.changed.length} modified`);
  }
  if (compareResult.backend?.hasChanges) {
    context.push(`Backend: ${compareResult.backend.oldTarget} → ${compareResult.backend.newTarget}`);
  }

  if (context.length === 0) return ruleBased;

  const prompt = `You are a creative coding assistant. Summarize the differences between two versions of a visual/shader project in 1-2 natural sentences. Focus on the creative and visual impact, not technical details.\n\nChanges:\n${context.join("\n")}\n\nNode A title: "${compareResult.nodeA?.title || "A"}"\nNode B title: "${compareResult.nodeB?.title || "B"}"\n\nWrite a concise, human-friendly summary:`;

  try {
    const { callAnthropic } = await import("./anthropicClient.js");
    const result = await callAnthropic({
      apiKey,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 150,
      system: "You summarize visual project version differences in 1-2 concise sentences. Be specific about visual changes.",
      messages: [{ role: "user", content: prompt }],
      tools: [],
    });
    const text = result.contentBlocks?.find(b => b.type === "text")?.text?.trim();
    return text || ruleBased;
  } catch {
    return ruleBased;
  }
}

// ---------------------------------------------------------------------------
// Full comparison
// ---------------------------------------------------------------------------

/**
 * Compare two reconstructed states and their node metadata.
 * Returns a structured diff object with all comparison results.
 */
export function compareStates(stateA, stateB, nodeA, nodeB) {
  return {
    shaders: diffShaders(stateA, stateB),
    uniforms: diffUniforms(stateA, stateB),
    prompts: diffPrompts(stateA, stateB),
    timeline: diffTimeline(stateA, stateB),
    controls: diffControls(stateA, stateB),
    metadata: diffMetadata(nodeA, nodeB),
    assets: diffAssets(stateA, stateB),
    backend: diffBackend(stateA, stateB),
    nodeA,
    nodeB,
  };
}
