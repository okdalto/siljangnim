/**
 * AI-powered graphics debugger for Siljangnim.
 * Collects runtime/compile/validation/performance logs and uses heuristic
 * pattern matching to diagnose issues and suggest fixes.
 */

/* ------------------------------------------------------------------ */
/*  Helper: deep clone                                                */
/* ------------------------------------------------------------------ */

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ------------------------------------------------------------------ */
/*  Helper: resolve a dot-path on an object                           */
/* ------------------------------------------------------------------ */

function getByPath(obj, path) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setByPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/* ------------------------------------------------------------------ */
/*  Pattern catalogues                                                */
/* ------------------------------------------------------------------ */

const GLSL_ERROR_LINE_RE = /ERROR:\s*\d+:(\d+):\s*(.*)/i;

const NAN_RISK_PATTERNS = [
  { re: /\/\s*0(\.0*)?\b/, desc: "Literal division by zero" },
  {
    re: /\b(\w+)\s*\/\s*(\w+)/,
    desc: "Division that may produce NaN if divisor is zero",
    filter: (m) => m[1] !== m[2], // self/self is always 1 (unless 0/0)
  },
  { re: /sqrt\s*\(\s*-/, desc: "sqrt of a potentially negative value" },
  { re: /log\s*\(\s*0/, desc: "log of zero" },
  { re: /log2?\s*\(\s*[^)]*\)/, desc: "log/log2 call (verify argument > 0)" },
  { re: /pow\s*\(\s*0(\.0*)?\s*,\s*0(\.0*)?\s*\)/, desc: "pow(0, 0) is undefined" },
  { re: /inversesqrt\s*\(\s*0/, desc: "inversesqrt of zero" },
  { re: /asin\s*\((?!.*clamp)/, desc: "asin without clamp (domain -1..1)" },
  { re: /acos\s*\((?!.*clamp)/, desc: "acos without clamp (domain -1..1)" },
];

const PERF_HOTSPOT_PATTERNS = [
  { re: /for\s*\([^)]*\)\s*\{[^}]*for\s*\(/, desc: "Nested loop detected" },
  {
    re: /for\s*\([^)]*\)\s*\{[^}]*texture\s*\(/,
    desc: "Texture fetch inside loop (may be expensive)",
  },
  {
    re: /discard\b/,
    desc: "discard keyword may disable early-z optimization",
  },
  {
    re: /\bpow\s*\(/g,
    desc: "pow() calls can be expensive; consider multiplication when exponent is small integer",
    countThreshold: 4,
  },
  {
    re: /\bsin\s*\(|\bcos\s*\(|\btan\s*\(/g,
    desc: "Multiple trigonometric calls detected",
    countThreshold: 8,
  },
];

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

  /**
   * Add a runtime error from a scene script.
   * @param {Error} error
   * @param {"setup"|"render"|"cleanup"} scriptSection
   */
  addRuntimeLog(error, scriptSection) {
    this._push(this._runtimeLogs, {
      message: error?.message ?? String(error),
      name: error?.name ?? "Error",
      stack: error?.stack ?? null,
      section: scriptSection,
    });
  }

  /**
   * Add a shader compile error.
   * @param {"vertex"|"fragment"} shaderType
   * @param {string} source
   * @param {string} errorMsg
   */
  addCompileLog(shaderType, source, errorMsg) {
    this._push(this._compileLogs, { shaderType, source, errorMsg });
  }

  /**
   * Add a validation log.
   * @param {"bindgroup"|"framebuffer"|"pipeline"|"asset"|"other"} type
   * @param {string} message
   */
  addValidationLog(type, message) {
    this._push(this._validationLogs, { type, message });
  }

  /**
   * Add a performance warning.
   * @param {string} metric   e.g. "fps", "drawCalls", "textureBytes"
   * @param {number} value
   * @param {number} threshold
   */
  addPerformanceLog(metric, value, threshold) {
    this._push(this._performanceLogs, { metric, value, threshold });
  }

  /** Clear all logs. */
  clearLogs() {
    this._runtimeLogs = [];
    this._compileLogs = [];
    this._validationLogs = [];
    this._performanceLogs = [];
  }

  /** Return a snapshot of all logs. */
  getLogs() {
    return {
      runtime: [...this._runtimeLogs],
      compile: [...this._compileLogs],
      validation: [...this._validationLogs],
      performance: [...this._performanceLogs],
    };
  }

  /* ---- Diagnosis ------------------------------------------------ */

  /**
   * Analyse all collected logs and return a diagnosis object.
   */
  diagnose() {
    const errors = [];
    let errIdx = 0;
    const nextId = () => `err_${String(++errIdx).padStart(3, "0")}`;

    // --- GLSL / WGSL compile errors ---
    for (const log of this._compileLogs) {
      const parsed = this._parseCompileError(log);
      errors.push({ id: nextId(), ...parsed });
    }

    // --- Validation logs ---
    for (const log of this._validationLogs) {
      errors.push({ id: nextId(), ...this._parseValidationLog(log) });
    }

    // --- Performance logs ---
    for (const log of this._performanceLogs) {
      errors.push({ id: nextId(), ...this._parsePerformanceLog(log) });
    }

    // --- Runtime JS errors ---
    for (const log of this._runtimeLogs) {
      errors.push({ id: nextId(), ...this._parseRuntimeLog(log) });
    }

    // --- NaN detection across compile log sources ---
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
    const healthScore = Math.max(
      0,
      100 - errorCount * 25 - warningCount * 5
    );

    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} error(s)`);
    if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
    const summary =
      parts.length === 0
        ? "No issues detected. Scene appears healthy."
        : `Found ${parts.join(" and ")}. Health score: ${healthScore}/100.`;

    return { errors, summary, healthScore };
  }

  /* ---- Internal parsers ----------------------------------------- */

  _parseCompileError(log) {
    const { shaderType, source, errorMsg } = log;
    const lineMatch = GLSL_ERROR_LINE_RE.exec(errorMsg);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
    const shortMsg = lineMatch ? lineMatch[2].trim() : errorMsg;

    const type = shaderType === "wgsl" ? "wgsl_compile" : "glsl_compile";
    const suggestions = [];
    let autoFixable = false;

    // --- Heuristic: missing precision qualifier ---
    if (/precision/i.test(errorMsg) || /no precision/i.test(errorMsg)) {
      suggestions.push('Add "precision highp float;" after the #version directive.');
      autoFixable = true;
    }

    // --- Heuristic: wrong version ---
    if (/version/i.test(errorMsg)) {
      suggestions.push('Ensure the first line is "#version 300 es" for WebGL2.');
      autoFixable = true;
    }

    // --- Heuristic: gl_FragColor (GLSL ES 1.0 leftover) ---
    if (/gl_FragColor/i.test(errorMsg) || /gl_FragColor/.test(source ?? "")) {
      suggestions.push(
        'Replace gl_FragColor with a custom "out vec4 fragColor;" declaration and use fragColor instead.'
      );
      autoFixable = true;
    }

    // --- Heuristic: texture2D (GLSL ES 1.0 leftover) ---
    if (/texture2D/i.test(errorMsg) || /texture2D/.test(source ?? "")) {
      suggestions.push("Replace texture2D() with texture() for GLSL ES 3.0.");
      autoFixable = true;
    }

    // --- Heuristic: attribute/varying ---
    if (/attribute/i.test(errorMsg) || /varying/i.test(errorMsg)) {
      suggestions.push(
        'Replace "attribute" with "in" and "varying" with "in"/"out" for GLSL ES 3.0.'
      );
      autoFixable = true;
    }

    // --- Heuristic: undeclared identifier ---
    if (/undeclared|undeclared identifier/i.test(errorMsg)) {
      suggestions.push(
        "Check that the variable or function is declared before use."
      );
    }

    // --- Heuristic: type mismatch ---
    if (/type mismatch|cannot convert/i.test(errorMsg)) {
      suggestions.push(
        "Check operand types. Use explicit casts like float(), int(), vec3() as needed."
      );
    }

    // --- WGSL-specific heuristics ---

    // Entry point errors
    if (/entry\s*point/i.test(errorMsg)) {
      suggestions.push(
        "Check that @vertex / @fragment annotations are present on the entry point functions."
      );
      autoFixable = false;
    }

    // WGSL type mismatch (more specific than the generic one above)
    if (/type\s*mismatch/i.test(errorMsg) && shaderType === "wgsl") {
      suggestions.push(
        "Check WGSL type syntax: use f32, vec4f (or vec4<f32>), mat4x4f. Explicit casts required: f32(), i32(), u32()."
      );
    }

    // Binding errors
    if (/binding/i.test(errorMsg) && !/bind group/i.test(errorMsg)) {
      suggestions.push(
        "Check @group(0) @binding(N) declarations match the pipeline bind group layout."
      );
    }

    // Storage access mode errors
    if (/storage/i.test(errorMsg) && /access/i.test(errorMsg)) {
      suggestions.push(
        "Check read/write access modes on var<storage> declarations (e.g. var<storage, read_write>)."
      );
    }

    // Workgroup size errors
    if (/workgroup_size/i.test(errorMsg)) {
      suggestions.push(
        "Check @workgroup_size annotation on compute shader: e.g. @compute @workgroup_size(64)."
      );
    }

    // var<uniform> / var<storage> mismatch
    if (/var\s*<\s*(uniform|storage)/i.test(errorMsg)) {
      suggestions.push(
        "Check that var<uniform> and var<storage> declarations match the expected bind group layout and buffer types."
      );
    }

    if (suggestions.length === 0) {
      suggestions.push("Review the shader source around the reported line.");
    }

    return {
      type,
      severity: "error",
      title: `Shader compile error (${shaderType})${line ? ` at line ${line}` : ""}`,
      detail: shortMsg,
      location: { section: "render", line },
      suggestions,
      autoFixable,
    };
  }

  _parseValidationLog(log) {
    const { type, message } = log;
    const suggestions = [];
    let diagType = "pipeline_mismatch";
    let autoFixable = false;

    // --- Uniform / bind group mismatch ---
    if (/uniform.*not found/i.test(message) || /location\s*=\s*-1/i.test(message)) {
      diagType = "uniform_mismatch";
      suggestions.push(
        "Ensure the uniform is declared in the shader and the name matches exactly."
      );
      autoFixable = true;
    }
    // --- Framebuffer ---
    else if (/framebuffer/i.test(message) || type === "framebuffer") {
      diagType = "framebuffer_mismatch";
      const statusMatch = message.match(/status:\s*(0x[0-9A-Fa-f]+|\d+)/);
      if (statusMatch) {
        suggestions.push(
          `Framebuffer incomplete (status ${statusMatch[1]}). Check attachment dimensions and formats match.`
        );
      } else {
        suggestions.push(
          "Check that all framebuffer attachments have the same dimensions and compatible formats."
        );
      }
    }
    // --- Missing asset ---
    else if (/missing|not found|404/i.test(message) || type === "asset") {
      diagType = "missing_asset";
      suggestions.push(
        "Verify the asset path is correct and the file has been uploaded."
      );
    }
    // --- Pipeline ---
    else if (type === "pipeline" || /pipeline/i.test(message)) {
      diagType = "pipeline_mismatch";
      suggestions.push(
        "Check that vertex attributes and bind group layouts match the pipeline declaration."
      );
    }
    // --- NaN / Infinity ---
    else if (/nan|infinity/i.test(message)) {
      diagType = "nan_artifact";
      suggestions.push(
        "A NaN or Infinity value was detected. Guard divisions and clamp inputs to math functions."
      );
    }
    // --- WebGPU: GPUValidationError ---
    else if (/GPUValidationError/i.test(message)) {
      diagType = "pipeline_mismatch";
      suggestions.push(
        "GPUValidationError: pipeline layout likely mismatches the shader's bind group layout or vertex attributes."
      );
    }
    // --- WebGPU: bind group layout mismatch ---
    else if (/bind\s*group/i.test(message)) {
      diagType = "pipeline_mismatch";
      suggestions.push(
        "Bind group layout mismatch: ensure @group/@binding declarations in the shader match the GPUBindGroupLayout entries."
      );
    }
    // --- WebGPU: texture format incompatibility ---
    else if (/texture\s*format/i.test(message)) {
      diagType = "framebuffer_mismatch";
      suggestions.push(
        "Incompatible texture formats: check that render attachment formats match the pipeline's colorTargets and any sampled texture view formats."
      );
    }
    // --- WebGPU: buffer offset/size alignment ---
    else if (/buffer/i.test(message) && /(offset|size|alignment)/i.test(message)) {
      diagType = "pipeline_mismatch";
      suggestions.push(
        "Buffer alignment issue: ensure buffer offsets are multiples of 256 (uniform) or 4 (storage), and sizes match the shader struct layout."
      );
    }

    if (suggestions.length === 0) {
      suggestions.push("Review the validation message for details.");
    }

    return {
      type: diagType,
      severity: "error",
      title: `Validation issue (${type})`,
      detail: message,
      location: { section: "render", line: null },
      suggestions,
      autoFixable,
    };
  }

  _parsePerformanceLog(log) {
    const { metric, value, threshold } = log;
    const suggestions = [];

    if (metric === "fps") {
      suggestions.push(
        `FPS is ${value} (threshold: ${threshold}). Simplify shaders, reduce draw calls, or lower resolution.`
      );
    } else if (metric === "drawCalls") {
      suggestions.push(
        `${value} draw calls detected (threshold: ${threshold}). Consider instancing or batching.`
      );
    } else if (metric === "textureBytes" || metric === "textureSize") {
      suggestions.push(
        `Texture memory usage is high (${value}). Use smaller textures or compressed formats.`
      );
    } else {
      suggestions.push(
        `${metric} value ${value} exceeded threshold ${threshold}.`
      );
    }

    return {
      type: "performance",
      severity: "warning",
      title: `Performance warning: ${metric}`,
      detail: `${metric} = ${value} (threshold: ${threshold})`,
      location: { section: "render", line: null },
      suggestions,
      autoFixable: false,
    };
  }

  _parseRuntimeLog(log) {
    const { message, name, section } = log;
    const suggestions = [];
    let severity = "error";

    if (name === "TypeError") {
      suggestions.push(
        "A TypeError occurred. Check that all variables are defined and have expected types before use."
      );
    } else if (name === "ReferenceError") {
      suggestions.push(
        "A ReferenceError occurred. Check for typos or missing variable declarations."
      );
    } else if (name === "RangeError") {
      suggestions.push(
        "A RangeError occurred. Check array bounds and numeric ranges."
      );
    } else {
      suggestions.push("Review the error message and stack trace for details.");
    }

    return {
      type: "runtime",
      severity,
      title: `Runtime ${name} in ${section}`,
      detail: message,
      location: { section, line: null },
      suggestions,
      autoFixable: false,
    };
  }

  /* ---- Auto-fix Patch Generation -------------------------------- */

  /**
   * For each autoFixable error in the diagnosis, generate a patch object.
   * @param {{ errors: Array }} diagnosis - output from diagnose()
   * @returns {Array}
   */
  generatePatches(diagnosis) {
    const patches = [];

    for (const err of diagnosis.errors) {
      if (!err.autoFixable) continue;

      if (err.type === "glsl_compile") {
        const p = this._generateGLSLPatch(err);
        if (p) patches.push(...p);
      } else if (err.type === "uniform_mismatch") {
        const p = this._generateUniformPatch(err);
        if (p) patches.push(p);
      }
    }

    return patches;
  }

  _generateGLSLPatch(err) {
    const patches = [];
    const detail = (err.detail ?? "") + " " + (err.title ?? "");

    // Find corresponding compile log for source access
    const compileLog = this._compileLogs.find(
      (l) => l.errorMsg && (l.errorMsg.includes(err.detail) || err.detail.includes(l.errorMsg))
    );
    const source = compileLog?.source ?? "";

    // Missing precision qualifier
    if (/precision/i.test(detail) || (source && !/precision\s+(lowp|mediump|highp)\s+float/i.test(source))) {
      if (source && !/precision\s+(lowp|mediump|highp)\s+float/i.test(source)) {
        const versionLine = source.match(/(#version[^\n]*\n)/);
        if (versionLine) {
          patches.push({
            errorId: err.id,
            type: "glsl_fix",
            target: "script.render",
            description: 'Add "precision highp float;" after #version directive',
            patch: {
              old: versionLine[1],
              new: versionLine[1] + "precision highp float;\n",
            },
            safe: true,
            confidence: 0.95,
          });
        }
      }
    }

    // Wrong GLSL version
    if (/version/i.test(detail) && source) {
      const wrongVersion = source.match(/#version\s+\d+[^\n]*/);
      if (wrongVersion && !wrongVersion[0].includes("300 es")) {
        patches.push({
          errorId: err.id,
          type: "glsl_fix",
          target: "script.render",
          description: "Fix GLSL version to #version 300 es",
          patch: {
            old: wrongVersion[0],
            new: "#version 300 es",
          },
          safe: true,
          confidence: 0.9,
        });
      }
    }

    // gl_FragColor -> fragColor
    if (/gl_FragColor/i.test(detail) || /gl_FragColor/.test(source)) {
      if (source && /gl_FragColor/.test(source)) {
        patches.push({
          errorId: err.id,
          type: "glsl_fix",
          target: "script.render",
          description:
            "Replace gl_FragColor with out variable fragColor",
          patch: {
            old: "gl_FragColor",
            new: "fragColor",
          },
          safe: true,
          confidence: 0.85,
        });
        // Also add the out declaration if missing
        if (!/out\s+vec4\s+fragColor/.test(source)) {
          const precisionLine = source.match(/(precision\s+\w+\s+float\s*;\s*\n)/);
          if (precisionLine) {
            patches.push({
              errorId: err.id,
              type: "glsl_fix",
              target: "script.render",
              description: "Add out vec4 fragColor declaration",
              patch: {
                old: precisionLine[1],
                new: precisionLine[1] + "out vec4 fragColor;\n",
              },
              safe: true,
              confidence: 0.85,
            });
          }
        }
      }
    }

    // texture2D -> texture
    if (/texture2D/i.test(detail) || /texture2D/.test(source)) {
      if (source && /texture2D/.test(source)) {
        patches.push({
          errorId: err.id,
          type: "glsl_fix",
          target: "script.render",
          description: "Replace texture2D with texture for GLSL ES 3.0",
          patch: {
            old: "texture2D",
            new: "texture",
          },
          safe: true,
          confidence: 0.9,
        });
      }
    }

    // attribute -> in
    if (/attribute/i.test(detail) || /\battribute\b/.test(source)) {
      if (source && /\battribute\b/.test(source)) {
        patches.push({
          errorId: err.id,
          type: "glsl_fix",
          target: "script.render",
          description: 'Replace "attribute" with "in" for GLSL ES 3.0',
          patch: {
            old: "attribute ",
            new: "in ",
          },
          safe: true,
          confidence: 0.9,
        });
      }
    }

    // varying -> in/out (fragment uses in, vertex uses out)
    if (/varying/i.test(detail) || /\bvarying\b/.test(source)) {
      if (source && /\bvarying\b/.test(source)) {
        const replacement = compileLog?.shaderType === "vertex" ? "out " : "in ";
        patches.push({
          errorId: err.id,
          type: "glsl_fix",
          target: "script.render",
          description: `Replace "varying" with "${replacement.trim()}" for GLSL ES 3.0`,
          patch: {
            old: "varying ",
            new: replacement,
          },
          safe: true,
          confidence: 0.85,
        });
      }
    }

    return patches.length > 0 ? patches : null;
  }

  _generateUniformPatch(err) {
    // Try to extract the uniform name from the detail
    const nameMatch = (err.detail ?? "").match(/uniform\s+['"]?(\w+)['"]?/i);
    const uniformName = nameMatch ? nameMatch[1] : null;
    if (!uniformName) return null;

    return {
      errorId: err.id,
      type: "uniform_fix",
      target: "uniforms",
      description: `Add missing uniform "${uniformName}" with default value`,
      patch: {
        path: `uniforms.${uniformName}`,
        value: 0.0,
      },
      safe: true,
      confidence: 0.6,
    };
  }

  /* ---- Apply Patch ---------------------------------------------- */

  /**
   * Apply a single patch to a scene JSON object.
   * Returns a new scene JSON; does NOT mutate the original.
   * @param {object} patch
   * @param {object} sceneJson
   * @returns {object}
   */
  applyPatch(patch, sceneJson) {
    const scene = deepClone(sceneJson);

    if (patch.patch.old !== undefined && patch.patch.new !== undefined) {
      // String replacement patch
      const targetPath = patch.target; // e.g. "script.render"
      const current = getByPath(scene, targetPath);
      if (typeof current === "string") {
        // Replace all occurrences
        const updated = current.split(patch.patch.old).join(patch.patch.new);
        setByPath(scene, targetPath, updated);
      }
    } else if (patch.patch.path !== undefined) {
      // Dot-path value patch
      setByPath(scene, patch.patch.path, patch.patch.value);
    }

    return scene;
  }

  /* ---- Plain language explanation ------------------------------- */

  /**
   * Returns a plain-language explanation of the diagnosis for non-technical users.
   * @param {{ errors: Array, summary: string, healthScore: number }} diagnosis
   * @returns {string}
   */
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
        lines.push(`  - ${_simplifyErrorType(err.type)}: ${err.title}`);
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
        lines.push(`  - ${_simplifyErrorType(w.type)}: ${w.title}`);
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
/*  Standalone utility functions                                      */
/* ------------------------------------------------------------------ */

/**
 * Static analysis of shader source for potential NaN-producing patterns.
 * @param {string} shaderSource
 * @returns {Array<{line: number|null, desc: string, pattern: string}>}
 */
function detectNaNRisk(shaderSource) {
  if (!shaderSource) return [];
  const results = [];
  const lines = shaderSource.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    // Skip comments
    const trimmed = lineText.trim();
    if (trimmed.startsWith("//")) continue;

    for (const pat of NAN_RISK_PATTERNS) {
      const m = pat.re.exec(lineText);
      if (m) {
        if (pat.filter && !pat.filter(m)) continue;
        results.push({
          line: i + 1,
          desc: pat.desc,
          pattern: m[0],
        });
      }
    }
  }

  return results;
}

/**
 * Static analysis for expensive shader patterns.
 * @param {string} shaderSource
 * @returns {Array<{line: number|null, desc: string, severity: "warning"|"info"}>}
 */
function detectPerformanceHotspots(shaderSource) {
  if (!shaderSource) return [];
  const results = [];
  const lines = shaderSource.split("\n");

  for (const pat of PERF_HOTSPOT_PATTERNS) {
    if (pat.countThreshold) {
      // Count occurrences across entire source
      const matches = shaderSource.match(pat.re);
      if (matches && matches.length >= pat.countThreshold) {
        results.push({
          line: null,
          desc: `${pat.desc} (${matches.length} occurrences)`,
          severity: "warning",
        });
      }
    } else {
      // Find first occurrence per-line for line reporting
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("//")) continue;
        if (pat.re.test(lines[i])) {
          results.push({
            line: i + 1,
            desc: pat.desc,
            severity: "warning",
          });
          // Reset regex lastIndex if global
          pat.re.lastIndex = 0;
          break; // one report per pattern
        }
        pat.re.lastIndex = 0;
      }
    }
  }

  return results;
}

/* ---- Private helpers -------------------------------------------- */

function _simplifyErrorType(type) {
  const map = {
    glsl_compile: "Shader code error",
    wgsl_compile: "Shader code error",
    uniform_mismatch: "Missing connection between code and settings",
    framebuffer_mismatch: "Rendering target problem",
    pipeline_mismatch: "Graphics pipeline mismatch",
    missing_asset: "Missing file or resource",
    nan_artifact: "Math error causing visual glitches",
    performance: "Performance issue",
    runtime: "Script error",
  };
  return map[type] ?? "Issue";
}

/* ------------------------------------------------------------------ */
/*  LLM-powered deep diagnosis                                        */
/* ------------------------------------------------------------------ */

/**
 * Use the LLM to diagnose complex issues that heuristics can't catch.
 *
 * @param {object} sceneJson - Current scene JSON
 * @param {{ errors: Array, summary: string }} heuristicDiagnosis
 * @param {object} opts - { apiKey, provider, model, maxTokens }
 * @returns {Promise<{ deepErrors: Array, patches: Array, explanation: string }>}
 */
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
  // Try proxy first (available on Vercel), fall back to direct browser access
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
    // If proxy returns 404 or network error page, fall through to direct
    if (res.status === 404 || res.status === 403) throw new Error("proxy unavailable");
  } catch {
    // Proxy not available (e.g. GitHub Pages) — use direct browser access
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
  // OpenAI supports browser CORS natively
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

/**
 * Repair branch: diagnose + auto-fix in one step.
 * Returns a new sceneJson with all safe patches applied.
 */
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
