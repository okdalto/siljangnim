/**
 * Scene tools — extracted from toolHandlers.js.
 * Handles scene creation, editing, clearing, templates, and success patterns.
 */

import * as storage from "../storage.js";

// ---------------------------------------------------------------------------
// Scene JSON validation
// ---------------------------------------------------------------------------

export function normalizeScriptStrings(scene) {
  const script = scene?.script;
  if (!script || typeof script !== "object") return;
  for (const key of ["setup", "render", "cleanup"]) {
    if (typeof script[key] === "string") {
      script[key] = script[key].replace(/\t/g, "    ");
    }
  }
}

export function validateSceneJson(scene) {
  const errors = [];
  if (!scene || typeof scene !== "object") return ["Scene JSON is not an object"];
  const script = scene.script;
  if (!script || typeof script !== "object") {
    errors.push("Missing 'script' object in scene JSON");
    return errors;
  }
  if (!script.render) {
    errors.push("Missing 'script.render' code in scene JSON");
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Inline shader extraction (helper for dry-run validation)
// ---------------------------------------------------------------------------

function _extractInlineShaders(jsCode) {
  const shaders = [];
  const templateRe = /`([^`]{20,})`/gs;
  let m;
  while ((m = templateRe.exec(jsCode)) !== null) {
    const content = m[1];
    if (/#version\s+300\s+es/.test(content) || /precision\s+(highp|mediump|lowp)\s+float/.test(content)) {
      shaders.push({ source: content, type: "glsl" });
    } else if (/@(?:vertex|fragment|compute|group)/.test(content)) {
      shaders.push({ source: content, type: "wgsl" });
    }
  }
  return shaders;
}

// ---------------------------------------------------------------------------
// Dry-run validation
// ---------------------------------------------------------------------------

async function _dryRunValidate(scene, context) {
  const errors = [];
  const checks = [];

  for (const key of ["setup", "render", "cleanup"]) {
    if (scene.script[key]) {
      try {
        new Function("ctx", scene.script[key]);
        checks.push(`${key} syntax`);
      } catch (e) {
        errors.push(`[${key}] SyntaxError: ${e.message}`);
      }
    }
  }

  const allCode = ["setup", "render", "cleanup"]
    .map((k) => scene.script[k] || "")
    .join("\n");
  const shaders = _extractInlineShaders(allCode);
  const glslShaders = shaders.filter((s) => s.type === "glsl");
  const wgslShaders = shaders.filter((s) => s.type === "wgsl");

  const gl = context?.engineRef?.current?.gl;
  if (gl && glslShaders.length > 0) {
    for (let i = 0; i < glslShaders.length; i++) {
      const src = glslShaders[i].source;
      const isVert = /gl_Position/.test(src);
      const type = isVert ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
      const shader = gl.createShader(type);
      try {
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(shader) || "unknown error";
          errors.push(`[glsl#${i}] ${log.trim()}`);
        } else {
          checks.push(`glsl#${i}`);
        }
      } finally {
        gl.deleteShader(shader);
      }
    }
  }

  const device = context?.engineRef?.current?._backend?.device;
  if (device && wgslShaders.length > 0) {
    for (let i = 0; i < wgslShaders.length; i++) {
      try {
        const mod = device.createShaderModule({ code: wgslShaders[i].source });
        if (mod.getCompilationInfo) {
          const info = await mod.getCompilationInfo();
          const errs = info.messages.filter((msg) => msg.type === "error");
          if (errs.length) {
            for (const e of errs) {
              errors.push(`[wgsl#${i}] L${e.lineNum}: ${e.message}`);
            }
          } else {
            checks.push(`wgsl#${i}`);
          }
        } else {
          checks.push(`wgsl#${i}`);
        }
      } catch (e) {
        errors.push(`[wgsl#${i}] ${e.message}`);
      }
    }
  }

  if (errors.length === 0) {
    const passed = checks.length ? checks.join(", ") : "schema";
    return `dry_run ok — validation passed (${passed} ✓).`;
  }
  return (
    `dry_run FAILED — ${errors.length} error(s):\n` +
    errors.map((e) => `  - ${e}`).join("\n")
  );
}

// ---------------------------------------------------------------------------
// write_scene
// ---------------------------------------------------------------------------

export async function toolWriteScene(input, broadcast, context) {
  const scene = { version: 1, render_mode: "script", script: {} };

  for (const key of ["setup", "render", "cleanup"]) {
    if (input[key]) scene.script[key] = input[key];
  }

  if (!scene.script.render) return "Error: 'render' is required.";

  if (input.uniforms) scene.uniforms = input.uniforms;
  if (input.clearColor) scene.clearColor = input.clearColor;
  if (input.backendTarget) {
    if ((input.backendTarget === "webgpu" || input.backendTarget === "hybrid") && typeof navigator !== "undefined" && !navigator.gpu) {
      return `Error: backendTarget "${input.backendTarget}" requires WebGPU, but this browser does not support WebGPU (navigator.gpu is not available). Use backendTarget "auto" (WebGL2) instead, or implement the simulation on CPU / Transform Feedback.`;
    }
    scene.backendTarget = input.backendTarget;
  }

  normalizeScriptStrings(scene);
  const errors = validateSceneJson(scene);
  if (errors.length) return "Validation errors:\n" + errors.map((e) => `  - ${e}`).join("\n");

  if (input.dry_run) {
    return _dryRunValidate(scene, context);
  }

  await storage.writeJson("scene.json", scene);
  broadcast({ type: "scene_update", scene_json: scene });
  if (scene.backendTarget) {
    broadcast({ type: "set_backend_target", backendTarget: scene.backendTarget });
  }
  return "ok — scene saved and broadcast. Errors will be reported automatically if setup fails. You may still call check_browser_errors for runtime verification.";
}

// ---------------------------------------------------------------------------
// edit_scene — surgical text-level edits within scene script sections
// ---------------------------------------------------------------------------

export async function toolEditScene(input, broadcast) {
  const edits = input.edits;
  if (!edits || !Array.isArray(edits) || !edits.length) {
    return "Error: 'edits' array is required. Each edit: { section, old_text, new_text }.";
  }

  let scene;
  try {
    scene = await storage.readJson("scene.json");
  } catch {
    return "Error: no scene.json exists. Use write_scene to create one first.";
  }

  if (!scene.script || typeof scene.script !== "object") {
    return "Error: scene.json has no 'script' object.";
  }

  const warnings = [];
  let appliedCount = 0;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const section = edit.section;
    const oldText = edit.old_text;
    const newText = edit.new_text ?? "";

    if (!section || !["setup", "render", "cleanup"].includes(section)) {
      warnings.push(`Edit ${i}: invalid section '${section}' — must be setup, render, or cleanup.`);
      continue;
    }
    if (oldText == null) {
      warnings.push(`Edit ${i}: 'old_text' is required.`);
      continue;
    }

    const code = scene.script[section];
    if (code == null) {
      warnings.push(`Edit ${i}: section '${section}' does not exist in current scene.`);
      continue;
    }

    if (!code.includes(oldText)) {
      // Provide a helpful preview of the section for debugging
      const preview = code.length > 200 ? code.slice(0, 200) + "..." : code;
      warnings.push(`Edit ${i}: old_text not found in script.${section}. Current content starts with:\n${preview}`);
      continue;
    }

    const occurrences = code.split(oldText).length - 1;
    if (occurrences > 1) {
      warnings.push(`Edit ${i}: old_text found ${occurrences} times in script.${section} — only first replaced. Provide more context for unique match.`);
    }

    scene.script[section] = code.replace(oldText, newText);
    appliedCount++;
  }

  if (appliedCount === 0 && warnings.length) {
    return "Error: no edits applied.\n" + warnings.map((w) => `  - ${w}`).join("\n");
  }

  normalizeScriptStrings(scene);
  const errors = validateSceneJson(scene);
  if (errors.length) {
    let result = "Validation errors after edits:\n" + errors.map((e) => `  - ${e}`).join("\n");
    if (warnings.length) result += "\nEdit warnings:\n" + warnings.map((w) => `  - ${w}`).join("\n");
    return result;
  }

  await storage.writeJson("scene.json", scene);
  broadcast({ type: "scene_update", scene_json: scene });

  let result = `ok — ${appliedCount} edit(s) applied to scene and broadcast.`;
  if (warnings.length) result += "\nWarnings:\n" + warnings.map((w) => `  - ${w}`).join("\n");
  return result;
}

// ---------------------------------------------------------------------------
// clear_viewport
// ---------------------------------------------------------------------------

export async function toolClearViewport(input, broadcast, ctx) {
  const engine = ctx.engineRef?.current;
  if (!engine) {
    return "Error: No viewport engine available.";
  }
  engine._disposeScene();
  // Reset GPU render error counter so new scenes start fresh
  engine._gpuRenderErrorCount = 0;

  // If WebGPU device was lost (e.g. from accumulated validation errors),
  // dispose the backend and re-initialize to get a fresh GPU device.
  const backend = engine._backend;
  if (backend?.backendType === "webgpu" && !backend.ready) {
    console.warn("[clear_viewport] WebGPU device lost — reinitializing backend");
    try {
      backend.dispose();
    } catch { /* best effort */ }
    engine._backend = null;
    engine._backendReady = false;
    try {
      await engine.initBackend();
    } catch (e) {
      console.error("[clear_viewport] Backend reinit failed:", e.message);
    }
  }

  // Clear canvas to black (only if context is alive)
  const gl = engine.gl;
  if (gl && !gl.isContextLost?.()) {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }
  // If context was lost, attempt recovery so subsequent write_scene can succeed
  if (engine._contextLost || gl?.isContextLost?.()) {
    await engine._tryRecoverContext();
  }
  broadcast({ type: "viewport_cleared" });
  return "ok — viewport cleared. All GPU resources released, canvas is black. Call write_scene to render a new scene.";
}

// ---------------------------------------------------------------------------
// use_template — load a pre-built scene template from the technique catalog
// ---------------------------------------------------------------------------

export async function toolUseTemplate(input, broadcast) {
  const templateId = input.template_id;
  if (!templateId) return "Error: 'template_id' is required.";

  let getTechniqueById;
  try {
    const mod = await import("../techniqueKnowledgeBase.js");
    getTechniqueById = mod.getTechniqueById;
  } catch (e) {
    return `Error: failed to load technique catalog: ${e.message}`;
  }

  const technique = getTechniqueById(templateId);
  if (!technique) return `Error: template '${templateId}' not found in the technique catalog.`;
  if (!technique.template) return `Error: template '${templateId}' has no template code.`;

  const tmpl = technique.template;
  const scene = {
    version: 1,
    render_mode: "script",
    script: {},
  };
  if (tmpl.setup) scene.script.setup = tmpl.setup;
  if (tmpl.render) scene.script.render = tmpl.render;
  if (tmpl.cleanup) scene.script.cleanup = tmpl.cleanup;
  if (tmpl.uniforms) scene.uniforms = tmpl.uniforms;
  if (tmpl.clearColor) scene.clearColor = tmpl.clearColor;
  if (tmpl.backendTarget) {
    if ((tmpl.backendTarget === "webgpu" || tmpl.backendTarget === "hybrid") && typeof navigator !== "undefined" && !navigator.gpu) {
      return `Error: template '${templateId}' requires WebGPU (backendTarget: "${tmpl.backendTarget}"), but this browser does not support WebGPU. Use a WebGL2-based template instead.`;
    }
    scene.backendTarget = tmpl.backendTarget;
  }

  if (!scene.script.render) return `Error: template '${templateId}' is missing a render function.`;

  normalizeScriptStrings(scene);
  const errors = validateSceneJson(scene);
  if (errors.length) return "Template validation errors:\n" + errors.map((e) => `  - ${e}`).join("\n");

  await storage.writeJson("scene.json", scene);
  broadcast({ type: "scene_update", scene_json: scene });
  if (scene.backendTarget) {
    broadcast({ type: "set_backend_target", backendTarget: scene.backendTarget });
  }

  // Build response with template info
  const uniformList = scene.uniforms
    ? Object.entries(scene.uniforms).map(([k, v]) => `  - ${k}: ${v.type} = ${JSON.stringify(v.value)}`).join("\n")
    : "  (none)";
  return `ok — template "${technique.name}" loaded and broadcast.\n` +
    `Description: ${technique.description}\n` +
    `Category: ${technique.category}\n` +
    `Uniforms:\n${uniformList}\n` +
    `You can now customize it with edit_scene.`;
}

// ---------------------------------------------------------------------------
// Success pattern extraction and storage
// ---------------------------------------------------------------------------

export const TECHNIQUE_PATTERNS = [
  [/createPingPong|ping.?pong/i, "ping-pong FBO"],
  [/beginComputePass|computePipeline/i, "compute shader"],
  [/createOrbitCamera|orbit/i, "3D orbit camera"],
  [/noise\.|simplex|perlin/i, "noise functions"],
  [/raymarching|rayMarch|sdf/i, "raymarching/SDF"],
  [/createVerletSystem|verlet/i, "verlet physics"],
  [/bloom|glow/i, "bloom/glow"],
  [/createRenderTarget|framebuffer|FBO/i, "render targets"],
  [/createMesh|geometry/i, "3D mesh"],
  [/texImage2D.*video|video.*texture/i, "video texture"],
  [/ctx\.audio|analyser|fft/i, "audio reactive"],
  [/mediapipe|pose|hand.*track/i, "body tracking"],
  [/particle/i, "particles"],
  [/instanc/i, "instancing"],
];

export function extractPatternMetadata(scene) {
  const scripts = [scene.script?.setup || "", scene.script?.render || "", scene.script?.cleanup || ""];
  const combined = scripts.join("\n");
  const techniques = [];
  for (const [re, name] of TECHNIQUE_PATTERNS) {
    if (re.test(combined)) techniques.push(name);
  }
  return {
    backend: scene.backendTarget || "auto",
    techniques,
    uniforms: scene.uniforms ? Object.keys(scene.uniforms) : [],
    scriptSize: combined.length,
    timestamp: Date.now(),
  };
}

/**
 * Store a successful scene pattern for future reference.
 * Called after check_browser_errors confirms no errors.
 */
export async function storeSuccessPattern(scene) {
  try {
    const pattern = extractPatternMetadata(scene);
    if (!pattern.techniques.length) return; // no interesting patterns to store

    let patterns = [];
    try {
      const existing = await storage.readTextFile(".workspace/success_patterns.json");
      patterns = JSON.parse(existing);
    } catch { /* empty */ }

    // Keep at most 20 patterns, dedup by techniques signature
    const sig = pattern.techniques.sort().join(",");
    patterns = patterns.filter(p => (p.techniques || []).sort().join(",") !== sig);
    patterns.push(pattern);
    if (patterns.length > 20) patterns = patterns.slice(-20);

    await storage.writeTextFile(".workspace/success_patterns.json", JSON.stringify(patterns, null, 2));
  } catch { /* non-critical, ignore */ }
}
