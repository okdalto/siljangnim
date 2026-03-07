// promptMode.js — Prompt interpretation modes for Siljangnim WebGL2 visual creation tool

export const PROMPT_MODES = {
  TECHNICAL: "technical",
  HYBRID: "hybrid",
  ART: "art",
};

// ---------------------------------------------------------------------------
// Keyword mapping tables
// ---------------------------------------------------------------------------

const MOOD_KEYWORDS = {
  dreamy: ["dreamy", "ethereal", "floating", "꿈같은", "몽환적"],
  energetic: ["energetic", "explosive", "intense", "역동적", "강렬한"],
  dark: ["dark", "ominous", "deep", "어두운", "음울한"],
  peaceful: ["peaceful", "calm", "serene", "평화로운", "고요한"],
  chaotic: ["glitch", "broken", "digital", "혼란", "글리치"],
  minimal: ["minimal", "simple", "clean", "미니멀", "심플"],
  psychedelic: ["psychedelic", "trippy", "acid", "환각적", "사이키델릭"],
  organic: ["organic", "natural", "growth", "유기적", "자연적"],
  geometric: ["geometric", "clean", "sharp", "기하학적", "날카로운"],
  retro: ["retro", "vintage", "80s", "crt", "레트로", "빈티지"],
};

const MOOD_MOTION_MAP = {
  dreamy: { speed: "slow", behavior: "breathing", energy: 0.3 },
  energetic: { speed: "fast", behavior: "explosive", energy: 0.9 },
  dark: { speed: "slow", behavior: "drifting", energy: 0.2 },
  peaceful: { speed: "slow", behavior: "flowing", energy: 0.2 },
  chaotic: { speed: "fast", behavior: "pulsing", energy: 0.8 },
  minimal: { speed: "still", behavior: null, energy: 0.1 },
  psychedelic: { speed: "moderate", behavior: "pulsing", energy: 0.6 },
  organic: { speed: "moderate", behavior: "flowing", energy: 0.5 },
  geometric: { speed: "moderate", behavior: "orbiting", energy: 0.4 },
  retro: { speed: "moderate", behavior: "oscillating", energy: 0.5 },
};

const COLOR_KEYWORDS = {
  warm: {
    words: ["fire", "warm", "sunset", "따뜻한", "불", "노을"],
    palette: { primary: "#ff6b35", secondary: "#f7931e", accent: "#fff275", temperature: "warm" },
  },
  cool: {
    words: ["ocean", "cool", "ice", "차가운", "바다", "얼음"],
    palette: { primary: "#1a535c", secondary: "#4ecdc4", accent: "#f7fff7", temperature: "cool" },
  },
  dark: {
    words: ["night", "dark", "shadow", "밤", "어둠", "그림자"],
    palette: { primary: "#0d1b2a", secondary: "#1b263b", accent: "#415a77", temperature: "cool" },
  },
  neon: {
    words: ["neon", "electric", "cyber", "네온", "사이버", "전기"],
    palette: { primary: "#ff006e", secondary: "#8338ec", accent: "#3a86ff", temperature: "cool" },
  },
  pastel: {
    words: ["pastel", "soft", "gentle", "파스텔", "부드러운", "은은한"],
    palette: { primary: "#ffd6ff", secondary: "#e7c6ff", accent: "#c8b6ff", temperature: "warm" },
  },
  earth: {
    words: ["earth", "natural", "forest", "흙", "자연", "숲"],
    palette: { primary: "#606c38", secondary: "#283618", accent: "#dda15e", temperature: "warm" },
  },
};

const TECHNIQUE_KEYWORDS = {
  volumetric_cloud: ["cloud", "sky", "atmosphere", "구름", "하늘"],
  bloom: ["glow", "bloom", "light", "빛", "발광"],
  fluid_distortion: ["distort", "warp", "morph", "왜곡", "변형"],
  particle_burst: ["particle", "dust", "sparkle", "입자", "먼지", "반짝"],
  crt_scanline: ["retro", "crt", "vhs", "레트로"],
  reaction_diffusion: ["pattern", "fractal", "cellular", "패턴", "프랙탈"],
  metaball: ["blob", "liquid", "organic", "액체", "방울"],
};

const TECHNICAL_KEYWORDS = [
  "raymarch", "sdf", "bloom", "particle", "fluid", "noise", "perlin",
  "simplex", "voronoi", "fbm", "fract", "smoothstep", "fresnel",
  "phong", "pbr", "ssao", "dof", "bokeh", "volumetric", "fbo",
  "ping-pong", "compute", "instancing", "billboard", "quad",
  "displacement", "normal map", "cubemap", "environment map",
  "post-process", "shader", "vertex", "fragment", "glsl",
];

const RENDER_APPROACH_HINTS = {
  fullscreen_quad: ["raymarch", "sdf", "post-process", "fullscreen", "2d", "shader"],
  "3d_scene": ["3d", "scene", "camera", "orbit", "mesh", "geometry", "model"],
  particle: ["particle", "dust", "sparkle", "emitter", "point"],
  simulation: ["fluid", "simulation", "compute", "ping-pong", "reaction", "cellular"],
};

const MOTION_KEYWORDS = {
  still: ["still", "static", "frozen", "정지"],
  slow: ["slow", "gentle", "drift", "느린", "천천히"],
  moderate: ["moderate", "steady", "보통"],
  fast: ["fast", "rapid", "quick", "빠른"],
  frenetic: ["frenetic", "frantic", "crazy", "미친", "광란"],
};

const BEHAVIOR_KEYWORDS = {
  flowing: ["flow", "stream", "river", "흐름"],
  pulsing: ["pulse", "beat", "throb", "맥박", "펄스"],
  orbiting: ["orbit", "revolve", "circle", "궤도"],
  expanding: ["expand", "grow", "inflate", "팽창"],
  oscillating: ["oscillate", "wave", "swing", "진동"],
  drifting: ["drift", "wander", "float", "표류"],
  explosive: ["explode", "burst", "bang", "폭발"],
  breathing: ["breathe", "inhale", "exhale", "숨", "호흡"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lowercase(text) {
  return text.toLowerCase();
}

function matchKeywords(text, wordList) {
  const t = lowercase(text);
  return wordList.some((w) => t.includes(lowercase(w)));
}

function detectMood(text) {
  const t = lowercase(text);
  let best = null;
  let bestCount = 0;
  for (const [mood, words] of Object.entries(MOOD_KEYWORDS)) {
    const count = words.filter((w) => t.includes(lowercase(w))).length;
    if (count > bestCount) {
      bestCount = count;
      best = mood;
    }
  }
  return best;
}

function detectPalette(text) {
  const t = lowercase(text);
  for (const group of Object.values(COLOR_KEYWORDS)) {
    if (group.words.some((w) => t.includes(lowercase(w)))) {
      return { ...group.palette };
    }
  }
  return { primary: null, secondary: null, accent: null, temperature: "neutral" };
}

function detectMotion(text) {
  const t = lowercase(text);

  let speed = "moderate";
  for (const [s, words] of Object.entries(MOTION_KEYWORDS)) {
    if (words.some((w) => t.includes(lowercase(w)))) {
      speed = s;
      break;
    }
  }

  let behavior = null;
  for (const [b, words] of Object.entries(BEHAVIOR_KEYWORDS)) {
    if (words.some((w) => t.includes(lowercase(w)))) {
      behavior = b;
      break;
    }
  }

  const speedEnergy = { still: 0, slow: 0.25, moderate: 0.5, fast: 0.75, frenetic: 1.0 };
  const energy = speedEnergy[speed] ?? 0.5;

  return { speed, behavior, energy };
}

function detectTechniques(text) {
  const t = lowercase(text);
  const found = [];
  for (const [techId, words] of Object.entries(TECHNIQUE_KEYWORDS)) {
    if (words.some((w) => t.includes(lowercase(w)))) {
      found.push(techId);
    }
  }
  return found;
}

function detectTechnicalKeywords(text) {
  const t = lowercase(text);
  return TECHNICAL_KEYWORDS.filter((kw) => t.includes(kw));
}

function detectRenderApproach(text, techniques) {
  const t = lowercase(text);
  for (const [approach, words] of Object.entries(RENDER_APPROACH_HINTS)) {
    if (words.some((w) => t.includes(w))) {
      return approach;
    }
  }
  // Infer from detected techniques
  if (techniques.includes("particle_burst")) return "particle";
  if (techniques.includes("reaction_diffusion")) return "simulation";
  return "fullscreen_quad";
}

function estimateComplexity(techniques, technicalKws) {
  const total = techniques.length + technicalKws.length;
  if (total <= 1) return "simple";
  if (total <= 3) return "moderate";
  return "complex";
}

function detectStyle(text, mood) {
  const aestheticFromMood = {
    dreamy: "abstract",
    energetic: "abstract",
    dark: "abstract",
    peaceful: "minimal",
    chaotic: "glitch",
    minimal: "minimal",
    psychedelic: "abstract",
    organic: "organic",
    geometric: "geometric",
    retro: "retro",
  };

  const aesthetic = aestheticFromMood[mood] || null;

  const t = lowercase(text);
  let density = "moderate";
  if (["sparse", "empty", "few", "희소"].some((w) => t.includes(w))) density = "sparse";
  else if (["dense", "packed", "many", "빽빽"].some((w) => t.includes(w))) density = "dense";

  let contrast = "medium";
  if (["low contrast", "flat", "soft"].some((w) => t.includes(w))) contrast = "low";
  else if (["high contrast", "stark", "sharp", "bold"].some((w) => t.includes(w))) contrast = "high";

  return { aesthetic, density, contrast };
}

// ---------------------------------------------------------------------------
// Main interpretation function
// ---------------------------------------------------------------------------

export function interpretPrompt(userPrompt, mode = PROMPT_MODES.HYBRID) {
  const technicalKws = detectTechnicalKeywords(userPrompt);
  const artTechniques = detectTechniques(userPrompt);
  const allTechniqueIds = [...new Set(artTechniques)];
  const renderApproach = detectRenderApproach(userPrompt, allTechniqueIds);
  const complexity = estimateComplexity(allTechniqueIds, technicalKws);

  const result = {
    mode,
    original: userPrompt,
    technical: {
      techniques: [...new Set([...technicalKws, ...allTechniqueIds])],
      renderApproach,
      complexity,
    },
    artDirection: null,
    suggestedTechniques: allTechniqueIds,
    systemPromptAddition: "",
  };

  if (mode === PROMPT_MODES.TECHNICAL) {
    // Minimal art direction
    result.systemPromptAddition = buildTechnicalSystemAddition(result);
    return result;
  }

  // Hybrid and Art modes get full art direction
  const mood = detectMood(userPrompt);
  const palette = detectPalette(userPrompt);
  const style = detectStyle(userPrompt, mood);

  let motion;
  if (mode === PROMPT_MODES.ART && mood && MOOD_MOTION_MAP[mood]) {
    // In art mode, prefer mood-driven motion defaults, then override with explicit words
    const moodMotion = MOOD_MOTION_MAP[mood];
    const explicitMotion = detectMotion(userPrompt);
    motion = {
      speed: explicitMotion.speed !== "moderate" ? explicitMotion.speed : moodMotion.speed,
      behavior: explicitMotion.behavior || moodMotion.behavior,
      energy: explicitMotion.behavior ? explicitMotion.energy : moodMotion.energy,
    };
  } else {
    motion = detectMotion(userPrompt);
  }

  // If palette has no temperature set from color detection, infer from mood
  if (palette.temperature === "neutral" && mood) {
    const warmMoods = ["energetic", "retro", "organic"];
    const coolMoods = ["dark", "peaceful", "chaotic"];
    if (warmMoods.includes(mood)) palette.temperature = "warm";
    else if (coolMoods.includes(mood)) palette.temperature = "cool";
  }

  result.artDirection = {
    mood: mood || null,
    palette,
    motion,
    style,
  };

  // In art mode, also infer techniques from mood if none were explicitly detected
  if (mode === PROMPT_MODES.ART && allTechniqueIds.length === 0 && mood) {
    const moodTechniques = {
      dreamy: ["volumetric_cloud", "bloom"],
      energetic: ["particle_burst", "bloom"],
      dark: ["volumetric_cloud"],
      peaceful: ["bloom"],
      chaotic: ["fluid_distortion"],
      minimal: [],
      psychedelic: ["reaction_diffusion", "bloom"],
      organic: ["metaball", "reaction_diffusion"],
      geometric: [],
      retro: ["crt_scanline"],
    };
    result.suggestedTechniques = moodTechniques[mood] || [];
  }

  result.systemPromptAddition = buildModeSystemPrompt(result);

  return result;
}

// ---------------------------------------------------------------------------
// System prompt builders
// ---------------------------------------------------------------------------

function buildTechnicalSystemAddition(interpretation) {
  const { techniques, renderApproach, complexity } = interpretation.technical;
  const lines = [];
  if (techniques.length > 0) {
    lines.push(`Techniques referenced: ${techniques.join(", ")}.`);
  }
  lines.push(`Render approach: ${renderApproach}. Complexity: ${complexity}.`);
  lines.push("Treat the prompt as precise technical instructions. Implement exactly as described.");
  return lines.join(" ");
}

export function buildModeSystemPrompt(interpretation) {
  const { mode, technical, artDirection, suggestedTechniques } = interpretation;

  if (mode === PROMPT_MODES.TECHNICAL) {
    return buildTechnicalSystemAddition(interpretation);
  }

  const lines = [];

  // Technical layer
  lines.push(`Render approach: ${technical.renderApproach}. Complexity: ${technical.complexity}.`);

  if (suggestedTechniques.length > 0) {
    lines.push(`Suggested WebGL2 techniques: ${suggestedTechniques.join(", ")}.`);
  }

  if (!artDirection) return lines.join(" ");

  // Art direction
  if (artDirection.mood) {
    lines.push(`Mood/atmosphere: ${artDirection.mood}.`);
  }

  const { palette } = artDirection;
  if (palette.primary) {
    lines.push(
      `Color palette: primary ${palette.primary}, secondary ${palette.secondary}, accent ${palette.accent}. Temperature: ${palette.temperature}.`
    );
  } else if (palette.temperature !== "neutral") {
    lines.push(`Color temperature: ${palette.temperature}.`);
  }

  const { motion } = artDirection;
  lines.push(
    `Motion: speed=${motion.speed}, behavior=${motion.behavior || "none"}, energy=${motion.energy}.`
  );

  const { style } = artDirection;
  if (style.aesthetic) {
    lines.push(`Style: ${style.aesthetic}, density=${style.density}, contrast=${style.contrast}.`);
  }

  if (mode === PROMPT_MODES.ART) {
    lines.push(
      "The user described their vision in artistic language. Interpret their intent creatively and translate it into compelling WebGL2 visuals. Prioritise mood and feeling over literal interpretation."
    );
  } else {
    lines.push(
      "The user mixed technical and artistic language. Honour explicit technical requests while filling in artistic gaps based on the detected mood and style."
    );
  }

  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Metadata helper
// ---------------------------------------------------------------------------

export function generateArtMetadata(interpretation) {
  const { mode, artDirection, suggestedTechniques } = interpretation;
  return {
    mode,
    mood: artDirection?.mood || null,
    palette: artDirection?.palette
      ? {
          primary: artDirection.palette.primary,
          secondary: artDirection.palette.secondary,
          accent: artDirection.palette.accent,
        }
      : null,
    motion: artDirection?.motion
      ? {
          speed: artDirection.motion.speed,
          behavior: artDirection.motion.behavior,
          energy: artDirection.motion.energy,
        }
      : null,
    techniques: suggestedTechniques || [],
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Style presets
// ---------------------------------------------------------------------------

export const STYLE_PRESETS = {
  "Dreamy Clouds": {
    mood: "dreamy",
    palette: { primary: "#e0c3fc", secondary: "#8ec5fc", accent: "#f7fff7", temperature: "cool" },
    motion: { speed: "slow", behavior: "breathing", energy: 0.3 },
    techniques: ["volumetric_cloud", "bloom"],
  },
  "Neon Geometry": {
    mood: "geometric",
    palette: { primary: "#ff006e", secondary: "#8338ec", accent: "#3a86ff", temperature: "cool" },
    motion: { speed: "moderate", behavior: "orbiting", energy: 0.5 },
    techniques: ["bloom"],
  },
  "Organic Flow": {
    mood: "organic",
    palette: { primary: "#606c38", secondary: "#283618", accent: "#dda15e", temperature: "warm" },
    motion: { speed: "moderate", behavior: "flowing", energy: 0.5 },
    techniques: ["metaball", "reaction_diffusion"],
  },
  "Retro CRT": {
    mood: "retro",
    palette: { primary: "#f72585", secondary: "#b5179e", accent: "#7209b7", temperature: "warm" },
    motion: { speed: "moderate", behavior: "oscillating", energy: 0.5 },
    techniques: ["crt_scanline"],
  },
  "Dark Energy": {
    mood: "dark",
    palette: { primary: "#0d1b2a", secondary: "#1b263b", accent: "#415a77", temperature: "cool" },
    motion: { speed: "slow", behavior: "drifting", energy: 0.2 },
    techniques: ["volumetric_cloud", "bloom"],
  },
  "Particle Storm": {
    mood: "energetic",
    palette: { primary: "#ff6b35", secondary: "#f7931e", accent: "#fff275", temperature: "warm" },
    motion: { speed: "fast", behavior: "explosive", energy: 0.9 },
    techniques: ["particle_burst", "bloom"],
  },
};
