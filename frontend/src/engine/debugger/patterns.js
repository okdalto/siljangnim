/**
 * Pattern catalogues and standalone analysis functions for the AI debugger.
 */

export const GLSL_ERROR_LINE_RE = /ERROR:\s*\d+:(\d+):\s*(.*)/i;

export const NAN_RISK_PATTERNS = [
  { re: /\/\s*0(\.0*)?\b/, desc: "Literal division by zero" },
  {
    re: /\b(\w+)\s*\/\s*(\w+)/,
    desc: "Division that may produce NaN if divisor is zero",
    filter: (m) => m[1] !== m[2],
  },
  { re: /sqrt\s*\(\s*-/, desc: "sqrt of a potentially negative value" },
  { re: /log\s*\(\s*0/, desc: "log of zero" },
  { re: /log2?\s*\(\s*[^)]*\)/, desc: "log/log2 call (verify argument > 0)" },
  { re: /pow\s*\(\s*0(\.0*)?\s*,\s*0(\.0*)?\s*\)/, desc: "pow(0, 0) is undefined" },
  { re: /inversesqrt\s*\(\s*0/, desc: "inversesqrt of zero" },
  { re: /asin\s*\((?!.*clamp)/, desc: "asin without clamp (domain -1..1)" },
  { re: /acos\s*\((?!.*clamp)/, desc: "acos without clamp (domain -1..1)" },
];

export const PERF_HOTSPOT_PATTERNS = [
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

/**
 * Static analysis of shader source for potential NaN-producing patterns.
 * @param {string} shaderSource
 * @returns {Array<{line: number|null, desc: string, pattern: string}>}
 */
export function detectNaNRisk(shaderSource) {
  if (!shaderSource) return [];
  const results = [];
  const lines = shaderSource.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
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
export function detectPerformanceHotspots(shaderSource) {
  if (!shaderSource) return [];
  const results = [];
  const lines = shaderSource.split("\n");

  for (const pat of PERF_HOTSPOT_PATTERNS) {
    if (pat.countThreshold) {
      const matches = shaderSource.match(pat.re);
      if (matches && matches.length >= pat.countThreshold) {
        results.push({
          line: null,
          desc: `${pat.desc} (${matches.length} occurrences)`,
          severity: "warning",
        });
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("//")) continue;
        if (pat.re.test(lines[i])) {
          results.push({
            line: i + 1,
            desc: pat.desc,
            severity: "warning",
          });
          pat.re.lastIndex = 0;
          break;
        }
        pat.re.lastIndex = 0;
      }
    }
  }

  return results;
}

/**
 * Map error type codes to plain-language descriptions.
 * @param {string} type
 * @returns {string}
 */
export function simplifyErrorType(type) {
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
