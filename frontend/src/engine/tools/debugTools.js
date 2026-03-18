/**
 * Debug and diagnostic tool handlers: error checking, sub-agent, preprocess, web fetch.
 */

import * as storage from "../storage.js";
import { storeSuccessPattern } from "./sceneTools.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECK_ERRORS_WAIT_MS = 3000;
const CHECK_ERRORS_LATE_WAIT_MS = 800;

function formatViewportState(viewportState, { includeNeutral = false } = {}) {
  if (!viewportState) return "";

  const parts = [];
  if (viewportState.error) {
    parts.push(`Viewport error overlay is visible RIGHT NOW:\n  - ${viewportState.error}`);
  }
  if (viewportState.safeModeActive) {
    parts.push("Viewport is currently in Safe Mode. Scene scripts are blocked until the project is trusted.");
  }
  if (viewportState.missingAssets?.length) {
    parts.push(
      "Missing assets overlay is visible:\n" +
      viewportState.missingAssets.map((asset) => `  - ${asset}`).join("\n")
    );
  }
  if (includeNeutral && !viewportState.error && !viewportState.safeModeActive && !viewportState.missingAssets?.length) {
    parts.push(viewportState.hasScene
      ? "Viewport has a loaded scene and no visible UI overlay errors."
      : "Viewport currently has no scene loaded.");
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Structured error parsing
// ---------------------------------------------------------------------------

function parseError(errorMsg) {
  const parsed = { raw: errorMsg, type: "unknown", summary: "" };

  // WebGPU validation errors
  const gpuMatch = errorMsg.match(/\[WebGPU (\w+)\] (.+)/);
  if (gpuMatch) {
    parsed.type = "webgpu_validation";
    parsed.summary = `[webgpu_${gpuMatch[1]}] ${gpuMatch[2].slice(0, 120)}`;
    return parsed;
  }

  // WGSL shader compilation errors
  const wgslMatch = errorMsg.match(/(?:Shader|WGSL).*?(?:error|Error).*?:(\d+):(\d+).*?(?:error:\s*)?(.+)/s);
  if (wgslMatch) {
    parsed.type = "wgsl_compilation";
    parsed.summary = `[wgsl] Line ${wgslMatch[1]}:${wgslMatch[2]}: ${wgslMatch[3].split("\n")[0].trim()}`;
    return parsed;
  }

  // GLSL shader compilation errors (e.g., "ERROR: 0:45: 'fragColor' : undeclared identifier")
  const glslMatch = errorMsg.match(/ERROR:\s*(\d+):(\d+):\s*(.+)/);
  if (glslMatch) {
    parsed.type = "shader_compilation";
    parsed.summary = `[glsl] Line ${glslMatch[2]}: ${glslMatch[3].trim()}`;
    return parsed;
  }

  // Standard JS errors: TypeError, ReferenceError, SyntaxError
  const jsMatch = errorMsg.match(/(TypeError|ReferenceError|SyntaxError):\s*(.+?)(?:\n|$)/);
  if (jsMatch) {
    parsed.type = jsMatch[1].toLowerCase();
    const locMatch = errorMsg.match(/at (\w+) .*?:(\d+):(\d+)/);
    if (locMatch) {
      parsed.summary = `[${parsed.type}] '${jsMatch[2].trim()}' at ${locMatch[1]}:${locMatch[2]}`;
    } else {
      parsed.summary = `[${parsed.type}] ${jsMatch[2].trim()}`;
    }
    return parsed;
  }

  // Fallback: first meaningful line
  parsed.summary = errorMsg.split("\n")[0].slice(0, 120);
  return parsed;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export async function toolCheckBrowserErrors(input, broadcast, ctx) {
  const errorCollector = ctx.errorCollector;
  // Wait for errors to arrive (waits for scene load first)
  const errors = await errorCollector.waitForErrors(CHECK_ERRORS_WAIT_MS);
  const viewportState = errorCollector.getViewportState?.() || null;

  // Second short wait to catch late-arriving WebGPU validation errors
  // (GPU shader compilation and pipeline creation are async)
  if (!errors.length || !errorCollector.isSetupReady()) {
    await new Promise((r) => setTimeout(r, CHECK_ERRORS_LATE_WAIT_MS));
    const late = errorCollector.drainLateErrors();
    for (const e of late) {
      if (!errors.includes(e)) errors.push(e);
    }
  }

  // Also consume any pending WebGPU validation errors from the renderer
  // (these are captured by the uncapturederror handler but may not have
  // been forwarded to console.error yet, e.g. during render loop)
  const gpuErrors = errorCollector.getValidationErrors();
  for (const e of gpuErrors) {
    const msg = `[WebGPU ${e.type}] ${e.message}`;
    if (!errors.includes(msg)) errors.push(msg);
  }

  const parts = [];
  const viewportSummary = formatViewportState(viewportState);
  if (viewportSummary) {
    parts.push(`Viewport UI state:\n${viewportSummary}`);
  }

  // Report setup status — helps diagnose white screens with "no errors"
  if (!errorCollector.isSetupReady()) {
    parts.push("⚠ Scene setup() FAILED — the render loop is NOT running. Check the errors below or verify your setup code.");
  }

  if (errors.length) {
    const engineErrs = errors.filter((e) => e.startsWith("[engine]"));
    const scriptErrs = errors.filter((e) => !e.startsWith("[engine]"));

    if (scriptErrs.length) {
      // Provide structured summary first, then raw errors
      const parsed = scriptErrs.map(parseError);
      const summaryLines = parsed.map((p, i) => `  ${i + 1}. ${p.summary}`);
      parts.push(
        `Script errors (${scriptErrs.length}) — structured summary:\n${summaryLines.join("\n")}\n\n` +
        `Raw errors:\n${scriptErrs.map((e) => `  - ${e}`).join("\n")}`
      );
    }
    if (engineErrs.length) {
      parts.push("Engine/infrastructure errors (NOT caused by your script — do NOT try to fix these):\n" + engineErrs.map((e) => `  - ${e}`).join("\n"));
    }
  }

  if (!parts.length) {
    // Improvement #8: store success pattern when scene runs without errors
    try {
      const scene = await storage.readJson("scene.json");
      if (scene?.script?.render) storeSuccessPattern(scene);
    } catch { /* ignore */ }
    return "No browser errors detected. Setup succeeded and render loop is running.";
  }
  return parts.join("\n\n");
}

export async function toolInspectViewportState(input, broadcast, ctx) {
  const viewportState = ctx.errorCollector?.getViewportState?.() || null;
  if (!viewportState) {
    return "Viewport state is unavailable in this context.";
  }

  const details = formatViewportState(viewportState, { includeNeutral: true });
  const backendLine = viewportState.backendName ? `\nBackend: ${viewportState.backendName}` : "";
  return `${details}${backendLine}`;
}

export async function toolDebugSubagent(input, broadcast, ctx) {
  const debugSubagentRunner = ctx.debugSubagentRunner;
  const errorContext = input.error_context;
  if (!errorContext) return "Error: 'error_context' is required.";
  if (!debugSubagentRunner) return "Error: debug sub-agent is not available in this context.";

  try {
    const result = await debugSubagentRunner(errorContext);
    return result || "Debug sub-agent returned no diagnosis.";
  } catch (err) {
    return `Debug sub-agent failed: ${err.message || String(err)}`;
  }
}

export async function toolRunPreprocess(input, broadcast, ctx) {
  const code = input.code;
  if (!code) return "Error: 'code' parameter is required.";

  // Send code to dispatcher, which runs it in GLEngine
  broadcast({ type: "run_preprocess", code });

  // Wait for result from the engine
  try {
    const result = await ctx.preprocessPromise();
    if (result === undefined || result === null) return "ok — preprocess completed (no return value).";
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  } catch (err) {
    return `Error during preprocess: ${err.message || String(err)}`;
  }
}

export async function toolWebFetch(input) {
  const url = input.url;
  if (!url || typeof url !== "string") return "Error: 'url' is required.";
  const maxLen = input.max_length ?? 50000;
  try {
    // Use server-side proxy to avoid CORS restrictions
    const resp = await fetch("/api/proxy?target=fetch", {
      method: "POST",
      headers: { "x-fetch-url": url },
    });
    if (!resp.ok) return `Error: HTTP ${resp.status} ${resp.statusText}`;
    const contentType = resp.headers.get("content-type") || "";
    let text = await resp.text();

    // Strip HTML tags for readability if it's an HTML page
    if (contentType.includes("text/html")) {
      // Parse with DOMParser for clean text extraction
      const doc = new DOMParser().parseFromString(text, "text/html");
      // Remove script/style elements
      for (const el of doc.querySelectorAll("script, style, nav, footer, header")) {
        el.remove();
      }
      text = doc.body?.innerText || doc.body?.textContent || text;
      // Collapse whitespace
      text = text.replace(/\n{3,}/g, "\n\n").trim();
    }

    if (text.length > maxLen) {
      text = text.slice(0, maxLen) + `\n\n... (truncated at ${maxLen} characters)`;
    }
    return text;
  } catch (err) {
    return `Error fetching URL: ${err.message || String(err)}`;
  }
}
