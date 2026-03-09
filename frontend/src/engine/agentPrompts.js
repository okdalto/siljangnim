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

/**
 * Build system prompt with platform + keyword-based section filtering.
 * Core sections are always included. Non-core sections are included only
 * when the user prompt contains at least one of their keywords, or when
 * they have file-attached content and files are present.
 * @param {string} userPrompt
 * @param {boolean} hasFiles
 * @param {string} [platform] — "web-desktop", "web-mobile", or "server". If omitted, all platforms allowed.
 */
export function buildSystemPrompt(userPrompt = "", hasFiles = false, platform = null) {
  const prompt = userPrompt.toLowerCase();
  const sections = PROMPT_SECTIONS.filter((s) => {
    // Core sections always included
    if (s.core) return true;
    // Platform filter
    if (platform && s.platforms && !s.platforms.includes(platform)) return false;
    // File-related sections forced when files are attached
    if (hasFiles && _FILE_SECTIONS.has(s.id)) return true;
    // Keyword matching — include only if user prompt mentions a keyword
    if (s.keywords && s.keywords.length > 0) {
      return s.keywords.some((kw) => prompt.includes(kw.toLowerCase()));
    }
    // Sections without keywords are always included
    return true;
  });
  return sections.map((s) => s.content).join("\n\n") + "\n";
}

export { PROMPT_SECTIONS };
export default _FULL_PROMPT;
