/**
 * System prompt sections — ported from prompts.py.
 * Removed: run_python, run_command references, multi-provider content.
 * Browser-only: /api/uploads/* served via Service Worker from IndexedDB.
 */

import { coreSections } from "./prompts/coreSections.js";
import { advancedSections } from "./prompts/advancedSections.js";
import { managerSections } from "./prompts/managerSections.js";
import { uiSections } from "./prompts/uiSections.js";

const PROMPT_SECTIONS = [
  ...coreSections,
  ...advancedSections,
  ...uiSections,
  ...managerSections,
];

// Full prompt (all sections)
const _FULL_PROMPT = PROMPT_SECTIONS.map((s) => s.content).join("\n\n") + "\n";

// File-related sections forced when files are attached
const _FILE_SECTIONS = new Set(["uploads"]);

// Improvement #6: pre-compute keyword specificity weights
// Keywords unique to one section score higher (more specific)
const _KEYWORD_WEIGHTS = (() => {
  const kwToSections = {};
  for (const s of PROMPT_SECTIONS) {
    if (!s.keywords) continue;
    for (const kw of s.keywords) {
      const lower = kw.toLowerCase();
      if (!kwToSections[lower]) kwToSections[lower] = [];
      kwToSections[lower].push(s.id);
    }
  }
  const weights = {};
  for (const [kw, sections] of Object.entries(kwToSections)) {
    weights[kw] = sections.length === 1 ? 2 : 1;
  }
  return weights;
})();

// Backend-specific section IDs
const _WEBGPU_SECTIONS = new Set(["wgsl_rules", "per_project_backend"]);
const _WEBGL_SECTIONS = new Set(["glsl_rules"]);

/**
 * Build system prompt with platform + keyword-based section filtering.
 * Core sections are always included. Non-core sections are included only
 * when the user prompt matches keywords with sufficient relevance score.
 *
 * Improvement #6: 2-stage matching with keyword specificity scoring
 * and backend-aware filtering.
 *
 * @param {string} userPrompt
 * @param {boolean} hasFiles
 * @param {string} [platform] — "web-desktop", "web-mobile", or "server"
 * @param {Object} [opts] - additional filtering options
 * @param {string} [opts.backendTarget] - "webgl", "webgpu", or "auto"
 */
export function buildSystemPrompt(userPrompt = "", hasFiles = false, platform = null, opts = {}) {
  const prompt = userPrompt.toLowerCase();
  const backendTarget = opts.backendTarget || "auto";

  const sections = PROMPT_SECTIONS.filter((s) => {
    // Core sections always included
    if (s.core) return true;
    // Platform filter
    if (platform && s.platforms && !s.platforms.includes(platform)) return false;
    // File-related sections forced when files are attached
    if (hasFiles && _FILE_SECTIONS.has(s.id)) return true;

    // Backend-aware filtering: exclude mismatched backend sections
    if (backendTarget === "webgl" && _WEBGPU_SECTIONS.has(s.id)) return false;
    if (backendTarget === "webgpu" && _WEBGL_SECTIONS.has(s.id)) return false;

    // Keyword matching with relevance scoring
    if (s.keywords && s.keywords.length > 0) {
      let score = 0;
      for (const kw of s.keywords) {
        if (prompt.includes(kw.toLowerCase())) {
          score += _KEYWORD_WEIGHTS[kw.toLowerCase()] || 1;
        }
      }
      // Require score >= 2 (either one unique keyword or two shared keywords)
      // Exceptions: sections with very few keywords (1-2) still pass with score >= 1
      const threshold = s.keywords.length <= 2 ? 1 : 2;
      return score >= threshold;
    }
    // Sections without keywords are always included
    return true;
  });
  return sections.map((s) => s.content).join("\n\n") + "\n";
}

export { PROMPT_SECTIONS };
export default _FULL_PROMPT;
