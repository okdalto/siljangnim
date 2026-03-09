/**
 * Log parsers — convert raw log entries into structured diagnosis objects.
 * Standalone functions (not class methods) accepting log data as parameters.
 */

import { GLSL_ERROR_LINE_RE } from "./patterns.js";

/**
 * Parse a shader compile error log into a diagnosis entry.
 * @param {{ shaderType: string, source: string, errorMsg: string }} log
 * @returns {object}
 */
export function parseCompileError(log) {
  const { shaderType, source, errorMsg } = log;
  const lineMatch = GLSL_ERROR_LINE_RE.exec(errorMsg);
  const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
  const shortMsg = lineMatch ? lineMatch[2].trim() : errorMsg;

  const type = shaderType === "wgsl" ? "wgsl_compile" : "glsl_compile";
  const suggestions = [];
  let autoFixable = false;

  if (/precision/i.test(errorMsg) || /no precision/i.test(errorMsg)) {
    suggestions.push('Add "precision highp float;" after the #version directive.');
    autoFixable = true;
  }

  if (/version/i.test(errorMsg)) {
    suggestions.push('Ensure the first line is "#version 300 es" for WebGL2.');
    autoFixable = true;
  }

  if (/gl_FragColor/i.test(errorMsg) || /gl_FragColor/.test(source ?? "")) {
    suggestions.push(
      'Replace gl_FragColor with a custom "out vec4 fragColor;" declaration and use fragColor instead.'
    );
    autoFixable = true;
  }

  if (/texture2D/i.test(errorMsg) || /texture2D/.test(source ?? "")) {
    suggestions.push("Replace texture2D() with texture() for GLSL ES 3.0.");
    autoFixable = true;
  }

  if (/attribute/i.test(errorMsg) || /varying/i.test(errorMsg)) {
    suggestions.push(
      'Replace "attribute" with "in" and "varying" with "in"/"out" for GLSL ES 3.0.'
    );
    autoFixable = true;
  }

  if (/undeclared|undeclared identifier/i.test(errorMsg)) {
    suggestions.push(
      "Check that the variable or function is declared before use."
    );
  }

  if (/type mismatch|cannot convert/i.test(errorMsg)) {
    suggestions.push(
      "Check operand types. Use explicit casts like float(), int(), vec3() as needed."
    );
  }

  // WGSL-specific heuristics
  if (/entry\s*point/i.test(errorMsg)) {
    suggestions.push(
      "Check that @vertex / @fragment annotations are present on the entry point functions."
    );
    autoFixable = false;
  }

  if (/type\s*mismatch/i.test(errorMsg) && shaderType === "wgsl") {
    suggestions.push(
      "Check WGSL type syntax: use f32, vec4f (or vec4<f32>), mat4x4f. Explicit casts required: f32(), i32(), u32()."
    );
  }

  if (/binding/i.test(errorMsg) && !/bind group/i.test(errorMsg)) {
    suggestions.push(
      "Check @group(0) @binding(N) declarations match the pipeline bind group layout."
    );
  }

  if (/storage/i.test(errorMsg) && /access/i.test(errorMsg)) {
    suggestions.push(
      "Check read/write access modes on var<storage> declarations (e.g. var<storage, read_write>)."
    );
  }

  if (/workgroup_size/i.test(errorMsg)) {
    suggestions.push(
      "Check @workgroup_size annotation on compute shader: e.g. @compute @workgroup_size(64)."
    );
  }

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

/**
 * Parse a validation log into a diagnosis entry.
 * @param {{ type: string, message: string }} log
 * @returns {object}
 */
export function parseValidationLog(log) {
  const { type, message } = log;
  const suggestions = [];
  let diagType = "pipeline_mismatch";
  let autoFixable = false;

  if (/uniform.*not found/i.test(message) || /location\s*=\s*-1/i.test(message)) {
    diagType = "uniform_mismatch";
    suggestions.push(
      "Ensure the uniform is declared in the shader and the name matches exactly."
    );
    autoFixable = true;
  } else if (/framebuffer/i.test(message) || type === "framebuffer") {
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
  } else if (/missing|not found|404/i.test(message) || type === "asset") {
    diagType = "missing_asset";
    suggestions.push(
      "Verify the asset path is correct and the file has been uploaded."
    );
  } else if (type === "pipeline" || /pipeline/i.test(message)) {
    diagType = "pipeline_mismatch";
    suggestions.push(
      "Check that vertex attributes and bind group layouts match the pipeline declaration."
    );
  } else if (/nan|infinity/i.test(message)) {
    diagType = "nan_artifact";
    suggestions.push(
      "A NaN or Infinity value was detected. Guard divisions and clamp inputs to math functions."
    );
  } else if (/GPUValidationError/i.test(message)) {
    diagType = "pipeline_mismatch";
    suggestions.push(
      "GPUValidationError: pipeline layout likely mismatches the shader's bind group layout or vertex attributes."
    );
  } else if (/bind\s*group/i.test(message)) {
    diagType = "pipeline_mismatch";
    suggestions.push(
      "Bind group layout mismatch: ensure @group/@binding declarations in the shader match the GPUBindGroupLayout entries."
    );
  } else if (/texture\s*format/i.test(message)) {
    diagType = "framebuffer_mismatch";
    suggestions.push(
      "Incompatible texture formats: check that render attachment formats match the pipeline's colorTargets and any sampled texture view formats."
    );
  } else if (/buffer/i.test(message) && /(offset|size|alignment)/i.test(message)) {
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

/**
 * Parse a performance log into a diagnosis entry.
 * @param {{ metric: string, value: number, threshold: number }} log
 * @returns {object}
 */
export function parsePerformanceLog(log) {
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

/**
 * Parse a runtime error log into a diagnosis entry.
 * @param {{ message: string, name: string, section: string }} log
 * @returns {object}
 */
export function parseRuntimeLog(log) {
  const { message, name, section } = log;
  const suggestions = [];

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
    severity: "error",
    title: `Runtime ${name} in ${section}`,
    detail: message,
    location: { section, line: null },
    suggestions,
    autoFixable: false,
  };
}
