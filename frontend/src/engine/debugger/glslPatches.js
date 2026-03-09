/**
 * GLSL patch generation — standalone functions for auto-fix patch creation.
 */

/**
 * Generate GLSL fix patches for a compile error.
 * @param {object} err — diagnosis error entry
 * @param {Array} compileLogs — raw compile log entries
 * @returns {Array|null}
 */
export function generateGLSLPatch(err, compileLogs) {
  const patches = [];
  const detail = (err.detail ?? "") + " " + (err.title ?? "");

  const compileLog = compileLogs.find(
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
        description: "Replace gl_FragColor with out variable fragColor",
        patch: {
          old: "gl_FragColor",
          new: "fragColor",
        },
        safe: true,
        confidence: 0.85,
      });
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

  // varying -> in/out
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

/**
 * Generate a uniform fix patch for a missing uniform.
 * @param {object} err — diagnosis error entry
 * @returns {object|null}
 */
export function generateUniformPatch(err) {
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
