/**
 * Agent Memory — automatic cross-session user preference learning.
 *
 * Stores lightweight preference entries in localStorage.
 * No LLM calls — uses rule-based extraction from chat history.
 */

import { loadJson, saveJson } from "../utils/localStorage.js";

const STORAGE_KEY = "siljangnim:memory";
const MAX_ENTRIES = 20;
const MAX_BYTES = 4096;

// ---------------------------------------------------------------------------
// Keyword / pattern dictionaries
// ---------------------------------------------------------------------------

const TECHNIQUE_KEYWORDS = {
  particle: "particle systems",
  particles: "particle systems",
  noise: "noise functions",
  perlin: "perlin noise",
  simplex: "simplex noise",
  fbm: "fractal brownian motion (fbm)",
  ray: "ray marching",
  raymarching: "ray marching",
  "ray marching": "ray marching",
  sdf: "signed distance fields (SDF)",
  bloom: "bloom / glow effects",
  glow: "bloom / glow effects",
  fluid: "fluid simulation",
  "reaction diffusion": "reaction-diffusion",
  voronoi: "voronoi patterns",
  fractal: "fractal patterns",
  metaball: "metaball / blob effects",
  displacement: "displacement mapping",
  postprocessing: "post-processing effects",
  "post processing": "post-processing effects",
  instancing: "instanced rendering",
  compute: "compute shaders",
  fft: "FFT audio analysis",
  audio: "audio-reactive visuals",
  "audio reactive": "audio-reactive visuals",
  mediapipe: "MediaPipe body tracking",
  midi: "MIDI input",
  webcam: "webcam input",
};

const BACKEND_KEYWORDS = {
  webgpu: "webgpu",
  wgsl: "webgpu",
  webgl: "webgl",
  glsl: "webgl",
};

const STYLE_KEYWORDS = {
  dark: "dark themes",
  minimal: "minimal / clean aesthetics",
  minimalist: "minimal / clean aesthetics",
  neon: "neon / vibrant colors",
  cyberpunk: "cyberpunk aesthetics",
  retro: "retro / vintage style",
  organic: "organic / natural forms",
  geometric: "geometric patterns",
  abstract: "abstract visuals",
  generative: "generative art",
};

const HEX_COLOR_RE = /#[0-9a-fA-F]{6}\b/g;

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export function loadMemory() {
  return loadJson(STORAGE_KEY, { entries: [], updated_at: null });
}

export function saveMemory(memory) {
  // Enforce size limits
  _pruneIfNeeded(memory);
  memory.updated_at = new Date().toISOString().slice(0, 10);
  saveJson(STORAGE_KEY, memory);
}

/**
 * Extract preferences from a completed chat session and merge into memory.
 * @param {Array<{role:string, text:string}>} chatHistory — UI chat history
 */
export function extractAndSave(chatHistory) {
  if (!chatHistory?.length) return;

  const memory = loadMemory();
  const userMessages = chatHistory
    .filter((m) => m.role === "user")
    .map((m) => (m.text || "").toLowerCase());

  if (userMessages.length === 0) return;

  const combined = userMessages.join(" ");

  // 1. Technique preferences
  for (const [keyword, label] of Object.entries(TECHNIQUE_KEYWORDS)) {
    const count = _countOccurrences(combined, keyword);
    if (count > 0) {
      _upsertEntry(memory, `technique:${label}`, `Frequently uses: ${label}`, count);
    }
  }

  // 2. Backend preference
  for (const [keyword, backend] of Object.entries(BACKEND_KEYWORDS)) {
    if (combined.includes(keyword)) {
      _upsertEntry(memory, `backend:${backend}`, `Preferred backend: ${backend}`, 2);
    }
  }

  // 3. Style preferences
  for (const [keyword, label] of Object.entries(STYLE_KEYWORDS)) {
    const count = _countOccurrences(combined, keyword);
    if (count > 0) {
      _upsertEntry(memory, `style:${label}`, `Prefers ${label}`, count);
    }
  }

  // 4. Color palette extraction (top 5 most used hex colors)
  const allColors = combined.match(HEX_COLOR_RE) || [];
  if (allColors.length >= 2) {
    const freq = {};
    for (const c of allColors) {
      const lower = c.toLowerCase();
      freq[lower] = (freq[lower] || 0) + 1;
    }
    const topColors = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c);
    _upsertEntry(memory, "palette:favorites", `Favorite colors: ${topColors.join(", ")}`, 1);
  }

  // 5. Language preference
  const hasKorean = /[\uAC00-\uD7AF]/.test(combined);
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(combined);
  if (hasKorean) _upsertEntry(memory, "lang:korean", "Communicates in Korean", 1);
  else if (hasJapanese) _upsertEntry(memory, "lang:japanese", "Communicates in Japanese", 1);

  saveMemory(memory);
}

/**
 * LLM-enhanced memory extraction — uses a small model to extract semantic
 * preferences that keyword matching would miss (e.g. "불꽃이 흩날리는" → particle).
 * Falls back silently if API key unavailable.
 */
export async function extractWithLLM(chatHistory) {
  if (!chatHistory?.length || chatHistory.length < 2) return;

  const apiKey = sessionStorage.getItem("siljangnim:apiKey") || "";
  if (!apiKey) return;

  const userMsgs = chatHistory
    .filter((m) => m.role === "user")
    .map((m) => (m.text || "").slice(0, 200))
    .slice(-5);
  if (!userMsgs.length) return;

  try {
    const { callLLM, getSmallModel } = await import("./llmClient.js");
    const provider = sessionStorage.getItem("siljangnim:provider") || "anthropic";
    let providerConfig = {};
    try { providerConfig = JSON.parse(sessionStorage.getItem("siljangnim:providerConfig") || "{}"); } catch {}
    const model = getSmallModel(provider) || providerConfig.model || "claude-haiku-4-5-20251001";

    const result = await callLLM({
      provider, apiKey, baseUrl: providerConfig.base_url, model, maxTokens: 200,
      system: `Extract user preferences from these visual creative coding requests.
Output a JSON array of {id, text} objects. Categories:
- technique: visual techniques (e.g. "particle systems", "ray marching")
- style: aesthetic preferences (e.g. "dark themes", "neon colors")
- workflow: how they like to work (e.g. "prefers incremental edits")
Max 5 items. Only include clear, repeated preferences. Output ONLY valid JSON array.`,
      messages: [{ role: "user", content: userMsgs.join("\n") }],
      tools: [],
    });

    const text = result.contentBlocks?.find((b) => b.type === "text")?.text?.trim();
    if (!text) return;

    // Parse JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const items = JSON.parse(match[0]);
    if (!Array.isArray(items)) return;

    const memory = loadMemory();
    for (const item of items.slice(0, 5)) {
      if (item.id && item.text) {
        _upsertEntry(memory, `llm:${item.id}`, item.text, 2);
      }
    }
    saveMemory(memory);
  } catch { /* LLM memory extraction is non-critical */ }
}

/**
 * Build a short prompt section from stored memory entries.
 * Returns empty string if no memory exists.
 */
export function buildMemorySection() {
  const memory = loadMemory();
  if (!memory.entries?.length) return "";

  // Sort by score descending, take top 10
  const top = [...memory.entries]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const lines = top.map((e) => `- ${e.text}`);
  return `\n\n## USER PREFERENCES (from past sessions)\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _upsertEntry(memory, id, text, scoreAdd) {
  const existing = memory.entries.find((e) => e.id === id);
  if (existing) {
    existing.score += scoreAdd;
    existing.text = text; // update text in case format changed
    existing.updated = new Date().toISOString().slice(0, 10);
  } else {
    memory.entries.push({
      id,
      text,
      score: scoreAdd,
      created: new Date().toISOString().slice(0, 10),
      updated: new Date().toISOString().slice(0, 10),
    });
  }
}

function _countOccurrences(text, keyword) {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(keyword, idx)) !== -1) {
    count++;
    idx += keyword.length;
  }
  return count;
}

function _pruneIfNeeded(memory) {
  // Remove entries exceeding MAX_ENTRIES — drop lowest score first
  if (memory.entries.length > MAX_ENTRIES) {
    memory.entries.sort((a, b) => b.score - a.score);
    memory.entries = memory.entries.slice(0, MAX_ENTRIES);
  }

  // Check total size and prune if over budget
  let serialized = JSON.stringify(memory);
  while (new Blob([serialized]).size > MAX_BYTES && memory.entries.length > 0) {
    // Remove lowest scoring entry
    memory.entries.sort((a, b) => b.score - a.score);
    memory.entries.pop();
    serialized = JSON.stringify(memory);
  }
}
