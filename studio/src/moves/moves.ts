// Moves: techniques media artists reach for (3D, volume rendering, PBR, path tracing, pixel sorting, beat sync…),
// suggested for the scene at hand. Each move says when it fits (scene traits) and how to apply it in this runtime;
// the agent reads the guide with move_get, the app shows the best few as cards after each change.
import { z } from "zod";
import type { Scene } from "../scene/schema";
import data from "./moves.json";

export const MOVE_CATEGORIES = ["dimension", "render", "motion", "image", "sound", "input", "output"] as const;

export const MoveSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  category: z.enum(MOVE_CATEGORIES),
  name: z.string(),
  name_ko: z.string(),
  summary: z.string(),
  summary_ko: z.string(),
  /** Scene traits that make this move a good next step; empty means it fits anything. */
  fits: z.array(z.string()),
  /** Traits that mean it's already there. */
  done: z.array(z.string()),
  /** light: runs in the scene as is; heavy: GPU-hungry; python: a runtime job; gpu-model: an ML model (slow without a GPU). */
  weight: z.enum(["light", "heavy", "python", "gpu-model"]),
  /** Catalog ids it builds on. */
  tools: z.array(z.string()),
  guide: z.string(),
  /** The guide was applied to an example scene and the frames checked (landscape and portrait). */
  verified: z.boolean().optional(),
});

export type Move = z.infer<typeof MoveSchema>;

export const MOVES: Move[] = z.object({ moves: z.array(MoveSchema) }).parse(data).moves;

/** What a scene's code and settings say about it, as rough labels the moves match against. */
const PATTERNS: Record<string, RegExp> = {
  "3d": /createOrbitCamera|mat4\.perspective|MESH_VERTEX_SHADER|createMesh\(|esm\.sh\/three@|@babylonjs|PerspectiveCamera|rayDir|ro\s*\+\s*rd/,
  field: /drawFullscreen|FULLSCREEN_VERTEX_SHADER|shadertoy\(/,
  particles: /particle|gl\.POINTS|drawArraysInstanced|instanceCount/i,
  mesh: /createMesh\(|geometry\.(box|sphere|plane)|\.obj['"\]]|\.glb['"\]]|gltf|Geometry\(|MeshBuilder/,
  lines: /gl\.LINES|LINE_STRIP|lineTo\(|polyline|stroke\(/,
  image: /loadTexture\(|createVideoTexture\(|createCameraTexture\(/,
  video: /createVideoTexture\(|createCameraTexture\(/,
  raymarch: /raymarch|sdScene|float map\(\s*vec3|sphere ?trac/i,
  volume: /transmittance|absorption|density\s*\(/i,
  pbr: /roughness|metallic|metalness|PBRMaterial|MeshStandardMaterial|MeshPhysicalMaterial/,
  pathtrace: /path ?trac|accumulat|samplesPerFrame/i,
  post: /bloom|vignette|filmGrain|grain\b|tonemap|ACES/i,
  feedback: /createPingPong|u_prev|feedback/i,
  sim: /reaction|advect|velocity|simulat|verlet|gray.?scott/i,
  splat: /splat/i,
  pointcloud: /point ?cloud/i,
  depth: /depth[-_ ]?anything|depth\.png/i,
  toon: /toon|cel[-_ ]?shad|outline/i,
  flowfield: /flow ?field|curl ?noise/i,
  rd: /reaction|gray.?scott/i,
  physics: /rapier|matter-js|cannon|verlet/i,
  pixelsort: /pixel ?sort/i,
  glitch: /datamosh|glitch/i,
  dither: /dither|halftone|bayer/i,
  ascii: /ascii|glyph ?atlas/i,
  audio: /ctx\.audio|u_audio|audioTexture|utils\.audio/,
  beat: /beats\.json|beat ?times|downbeat/i,
  stems: /stems\.json|demucs/i,
  midi: /ctx\.midi/,
  plotter: /vpype|plot\.svg/i,
  seamless: /seamless|loopPhase|phase\s*=\s*ctx\.time\s*\//i,
  musicvideo: /music ?video|sections\.json/i,
};

/** Every trait sceneTraits can report. */
export const TRAITS = new Set([...Object.keys(PATTERNS), "2d", "camera-input", "timeline"]);

export function sceneTraits(scene: Scene): Set<string> {
  const code = [scene.script.setup, scene.script.render, scene.panel?.html ?? ""].join("\n");
  const traits = new Set<string>();
  for (const [trait, pattern] of Object.entries(PATTERNS)) if (pattern.test(code)) traits.add(trait);
  if (!traits.has("3d")) traits.add("2d");
  const inputs = scene.inputs ?? [];
  if (inputs.includes("microphone")) traits.add("audio");
  if (inputs.includes("camera")) traits.add("camera-input").add("video");
  if (inputs.includes("midi")) traits.add("midi");
  if (scene.timeline) traits.add("timeline");
  return traits;
}

export interface SuggestOptions {
  /** Moves already applied in this project. */
  applied?: Iterable<string>;
  limit?: number;
}

export interface Suggestion {
  move: Move;
  /** Which traits made it fit, for the agent's reasoning. */
  because: string[];
}

/**
 * The moves worth offering next, best first: matching traits count, moves already present are left out, heavy and
 * install-needing ones rank a little lower, and the first picks come from different categories.
 */
export function suggestMoves(scene: Scene, options: SuggestOptions = {}): Suggestion[] {
  const traits = sceneTraits(scene);
  const applied = new Set(options.applied ?? []);
  const limit = options.limit ?? 4;
  const cost: Record<Move["weight"], number> = { light: 0, heavy: 0.3, python: 0.4, "gpu-model": 0.6 };
  const scored = MOVES.flatMap((move) => {
    if (applied.has(move.id) || move.done.some((t) => traits.has(t))) return [];
    const because = move.fits.filter((t) => traits.has(t));
    if (move.fits.length && !because.length) return [];
    // Anything-goes moves sit between a one-trait and a two-trait match.
    const score = (move.fits.length ? because.length : 1.5) - cost[move.weight];
    return [{ move, because, score }];
  });
  scored.sort((a, b) => b.score - a.score || MOVES.indexOf(a.move) - MOVES.indexOf(b.move));
  const picked: typeof scored = [];
  const categories = new Set<string>();
  for (const s of scored) {
    if (picked.length >= limit) break;
    if (categories.has(s.move.category)) continue;
    picked.push(s);
    categories.add(s.move.category);
  }
  for (const s of scored) {
    if (picked.length >= limit) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.map(({ move, because }) => ({ move, because }));
}

/** What the app sends the agent when the person picks a move. */
export function moveRequest(move: Move): string {
  return `[Move] Apply "${move.name}" (${move.id}) to the current scene: ${move.summary} Call move_get "${move.id}" for how, keep what makes the piece recognisable, and expose the new controls.`;
}
