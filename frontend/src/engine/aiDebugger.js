/**
 * AI-powered graphics debugger for Siljangnim.
 * Collects runtime/compile/validation/performance logs and uses heuristic
 * pattern matching to diagnose issues and suggest fixes.
 */

import { getByPath, setByPath, deepClone } from "../utils/objectUtils.js";
import { detectNaNRisk, detectPerformanceHotspots, simplifyErrorType } from "./debugger/patterns.js";
import { parseCompileError, parseValidationLog, parsePerformanceLog, parseRuntimeLog } from "./debugger/parsers.js";
import { generateGLSLPatch, generateUniformPatch } from "./debugger/glslPatches.js";

/* ------------------------------------------------------------------ */
/*  AIDebugger class                                                  */
/* ------------------------------------------------------------------ */

class AIDebugger {
  constructor() {
    this._runtimeLogs = [];
    this._compileLogs = [];
    this._validationLogs = [];
    this._performanceLogs = [];
    this._maxLogs = 200;
  }

  /* ---- Log Collection ------------------------------------------- */

  _push(arr, entry) {
    arr.push({ ...entry, timestamp: Date.now() });
    if (arr.length > this._maxLogs) {
      arr.splice(0, arr.length - this._maxLogs);
    }
  }

  addRuntimeLog(error, scriptSection) {
    this._push(this._runtimeLogs, {
      message: error?.message ?? String(error),
      name: error?.name ?? "Error",
      stack: error?.stack ?? null,
      section: scriptSection,
    });
  }

  addCompileLog(shaderType, source, errorMsg) {
    this._push(this._compileLogs, { shaderType, source, errorMsg });
  }

  addValidationLog(type, message) {
    this._push(this._validationLogs, { type, message });
  }

  addPerformanceLog(metric, value, threshold) {
    this._push(this._performanceLogs, { metric, value, threshold });
  }

  clearLogs() {
    this._runtimeLogs = [];
    this._compileLogs = [];
    this._validationLogs = [];
    this._performanceLogs = [];
  }

  getLogs() {
    return {
      runtime: [...this._runtimeLogs],
      compile: [...this._compileLogs],
      validation: [...this._validationLogs],
      performance: [...this._performanceLogs],
    };
  }

  /* ---- Diagnosis ------------------------------------------------ */

  diagnose() {
    const errors = [];
    let errIdx = 0;
    const nextId = () => `err_${String(++errIdx).padStart(3, "0")}`;

    for (const log of this._compileLogs) {
      errors.push({ id: nextId(), ...parseCompileError(log) });
    }

    for (const log of this._validationLogs) {
      errors.push({ id: nextId(), ...parseValidationLog(log) });
    }

    for (const log of this._performanceLogs) {
      errors.push({ id: nextId(), ...parsePerformanceLog(log) });
    }

    for (const log of this._runtimeLogs) {
      errors.push({ id: nextId(), ...parseRuntimeLog(log) });
    }

    // NaN detection across compile log sources
    const checkedSources = new Set();
    for (const log of this._compileLogs) {
      if (!log.source || checkedSources.has(log.source)) continue;
      checkedSources.add(log.source);
      const risks = detectNaNRisk(log.source);
      for (const risk of risks) {
        errors.push({
          id: nextId(),
          type: "nan_artifact",
          severity: "warning",
          title: "Potential NaN risk in shader",
          detail: risk.desc,
          location: { section: "render", line: risk.line },
          suggestions: [
            "Guard division with max(denominator, 0.001)",
            "Clamp values before passing to asin/acos/sqrt",
          ],
          autoFixable: false,
        });
      }
    }

    const errorCount = errors.filter((e) => e.severity === "error").length;
    const warningCount = errors.filter((e) => e.severity === "warning").length;
    const healthScore = Math.max(0, 100 - errorCount * 25 - warningCount * 5);

    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} error(s)`);
    if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
    const summary =
      parts.length === 0
        ? "No issues detected. Scene appears healthy."
        : `Found ${parts.join(" and ")}. Health score: ${healthScore}/100.`;

    return { errors, summary, healthScore };
  }

  /* ---- Auto-fix Patch Generation -------------------------------- */

  generatePatches(diagnosis) {
    const patches = [];

    for (const err of diagnosis.errors) {
      if (!err.autoFixable) continue;

      if (err.type === "glsl_compile") {
        const p = generateGLSLPatch(err, this._compileLogs);
        if (p) patches.push(...p);
      } else if (err.type === "uniform_mismatch") {
        const p = generateUniformPatch(err);
        if (p) patches.push(p);
      }
    }

    return patches;
  }

  /* ---- Apply Patch ---------------------------------------------- */

  applyPatch(patch, sceneJson) {
    const scene = deepClone(sceneJson);

    if (patch.patch.old !== undefined && patch.patch.new !== undefined) {
      const targetPath = patch.target;
      const current = getByPath(scene, targetPath);
      if (typeof current === "string") {
        const updated = current.split(patch.patch.old).join(patch.patch.new);
        setByPath(scene, targetPath, updated);
      }
    } else if (patch.patch.path !== undefined) {
      setByPath(scene, patch.patch.path, patch.patch.value);
    }

    return scene;
  }

  /* ---- Plain language explanation ------------------------------- */

  explainSimply(diagnosis) {
    if (diagnosis.errors.length === 0) {
      return "Everything looks good! Your scene has no detected issues.";
    }

    const lines = [];
    lines.push(
      `Your scene has a health score of ${diagnosis.healthScore} out of 100.`
    );
    lines.push("");

    const errorItems = diagnosis.errors.filter((e) => e.severity === "error");
    const warningItems = diagnosis.errors.filter((e) => e.severity === "warning");

    if (errorItems.length > 0) {
      lines.push(
        `There ${errorItems.length === 1 ? "is" : "are"} ${errorItems.length} error${errorItems.length === 1 ? "" : "s"} that need fixing:`
      );
      for (const err of errorItems) {
        lines.push(`  - ${simplifyErrorType(err.type)}: ${err.title}`);
        if (err.suggestions.length > 0) {
          lines.push(`    Suggestion: ${err.suggestions[0]}`);
        }
      }
      lines.push("");
    }

    if (warningItems.length > 0) {
      lines.push(
        `There ${warningItems.length === 1 ? "is" : "are"} ${warningItems.length} warning${warningItems.length === 1 ? "" : "s"} to be aware of:`
      );
      for (const w of warningItems) {
        lines.push(`  - ${simplifyErrorType(w.type)}: ${w.title}`);
      }
      lines.push("");
    }

    const fixable = diagnosis.errors.filter((e) => e.autoFixable);
    if (fixable.length > 0) {
      lines.push(
        `${fixable.length} of these issue${fixable.length === 1 ? "" : "s"} can be automatically fixed.`
      );
    }

    return lines.join("\n");
  }
}

/* ------------------------------------------------------------------ */
/*  LLM-powered deep diagnosis                                        */
/* ------------------------------------------------------------------ */

async function llmDiagnose(sceneJson, heuristicDiagnosis, opts = {}) {
  const { apiKey, provider = "anthropic", model, maxTokens = 2048 } = opts;
  if (!apiKey) {
    return { deepErrors: [], patches: [], explanation: "No API key available for deep diagnosis." };
  }

  const shaderSource = sceneJson?.script?.render || "";
  const setupSource = sceneJson?.script?.setup || "";
  const uniforms = sceneJson?.uniforms || {};

  const existingIssues = (heuristicDiagnosis?.errors || [])
    .map((e) => `- [${e.severity}] ${e.title}: ${e.detail}`)
    .join("\n");

  const prompt = `You are a WebGL2/GLSL ES 3.0 graphics debugger for a creative coding tool called Siljangnim.

Analyze the following shader scene and identify issues the heuristic checker may have missed.

## Setup Script (JavaScript):
\`\`\`js
${setupSource.slice(0, 2000)}
\`\`\`

## Render Script (GLSL fragment shader embedded in JS):
\`\`\`js
${shaderSource.slice(0, 3000)}
\`\`\`

## Uniforms:
${JSON.stringify(uniforms, null, 2).slice(0, 500)}

## Heuristic Diagnosis Already Found:
${existingIssues || "(none)"}

Respond with a JSON object (no markdown fences):
{
  "deepErrors": [
    {
      "type": "logic_error|perf_issue|visual_artifact|api_misuse|compatibility",
      "severity": "error|warning|info",
      "title": "Short title",
      "detail": "Detailed explanation",
      "suggestions": ["Fix suggestion 1"],
      "autoFixable": false
    }
  ],
  "patches": [
    {
      "type": "glsl_fix|js_fix|uniform_fix",
      "target": "script.render|script.setup|uniforms",
      "description": "What this patch does",
      "patch": { "old": "original code", "new": "fixed code" },
      "safe": true,
      "confidence": 0.8
    }
  ],
  "explanation": "Plain language summary of findings"
}

Rules:
- Only report NEW issues not already in the heuristic diagnosis
- Focus on logic errors, visual artifacts, and API misuse
- Patches must be exact string replacements
- Set confidence < 0.5 for uncertain fixes
- Keep patches minimal and safe`;

  try {
    let response;
    if (provider === "anthropic") {
      response = await _callAnthropic(apiKey, model || "claude-haiku-4-5-20251001", prompt, maxTokens);
    } else if (provider === "openai") {
      response = await _callOpenAI(apiKey, model || "gpt-4o-mini", prompt, maxTokens);
    } else {
      return { deepErrors: [], patches: [], explanation: `Unsupported provider: ${provider}` };
    }

    const parsed = _parseJsonResponse(response);
    if (!parsed) {
      return { deepErrors: [], patches: [], explanation: "Failed to parse LLM response." };
    }

    const deepErrors = (parsed.deepErrors || []).map((e, i) => ({
      id: `llm_${String(i + 1).padStart(3, "0")}`,
      ...e,
      source: "llm",
    }));

    const patches = (parsed.patches || []).map((p, i) => ({
      errorId: `llm_patch_${i + 1}`,
      ...p,
    }));

    return {
      deepErrors,
      patches,
      explanation: parsed.explanation || "LLM analysis complete.",
    };
  } catch (err) {
    return { deepErrors: [], patches: [], explanation: `LLM diagnosis failed: ${err.message}` };
  }
}

async function _callAnthropic(apiKey, model, prompt, maxTokens) {
  const proxyUrl = import.meta.env.DEV
    ? `http://${window.location.hostname}:8000/api/proxy`
    : "/api/proxy";

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  let res;
  try {
    res = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    });
    if (res.status === 404 || res.status === 403) throw new Error("proxy unavailable");
  } catch {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body,
    });
  }
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function _callOpenAI(apiKey, model, prompt, maxTokens) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function _parseJsonResponse(text) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return null;
  }
}

async function createRepairBranch(sceneJson, opts = {}) {
  const debugger_ = new AIDebugger();

  const renderSrc = sceneJson?.script?.render || "";
  if (renderSrc) {
    const nanRisks = detectNaNRisk(renderSrc);
    for (const risk of nanRisks) {
      debugger_.addValidationLog("nan", `Line ${risk.line}: ${risk.desc}`);
    }
    const perfIssues = detectPerformanceHotspots(renderSrc);
    for (const issue of perfIssues) {
      debugger_.addPerformanceLog("hotspot", issue.line || 0, 0);
    }
  }

  const hDiag = debugger_.diagnose();
  const hPatches = debugger_.generatePatches(hDiag);

  let llmResult = { deepErrors: [], patches: [], explanation: "" };
  if (opts.apiKey) {
    llmResult = await llmDiagnose(sceneJson, hDiag, opts);
  }

  const allErrors = [...hDiag.errors, ...llmResult.deepErrors];
  const allPatches = [...hPatches, ...llmResult.patches];

  let repairedScene = deepClone(sceneJson);
  const appliedPatches = [];

  for (const patch of allPatches) {
    if (!patch.safe) continue;
    if ((patch.confidence || 0) < 0.6) continue;
    try {
      const candidate = debugger_.applyPatch(patch, repairedScene);
      if (JSON.stringify(candidate) !== JSON.stringify(repairedScene)) {
        repairedScene = candidate;
        appliedPatches.push(patch);
      }
    } catch { /* skip failed patches */ }
  }

  return {
    repairedScene,
    diagnosis: {
      errors: allErrors,
      summary: `Heuristic: ${hDiag.errors.length} issues. LLM: ${llmResult.deepErrors.length} additional. Applied ${appliedPatches.length} fixes.`,
      healthScore: Math.max(0, 100 - allErrors.filter((e) => e.severity === "error").length * 25 - allErrors.filter((e) => e.severity === "warning").length * 5),
    },
    appliedPatches,
    explanation: llmResult.explanation || debugger_.explainSimply(hDiag),
  };
}

/* ------------------------------------------------------------------ */
/*  Exports                                                           */
/* ------------------------------------------------------------------ */

export default AIDebugger;
export { AIDebugger, detectNaNRisk, detectPerformanceHotspots, llmDiagnose, createRepairBranch };
