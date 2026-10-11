// Keyframe evaluation, ported from v1 KeyframeManager (cubic Hermite).
// Pure: used by the runtime every frame and by the app to show animated
// values on the controls.

export const EASES = ["smooth", "linear", "easeIn", "easeOut", "easeInOut", "step"] as const;
export type Ease = (typeof EASES)[number];

export interface Keyframe {
  time: number;
  value: number;
  /** How the segment arriving at this key is interpolated. Default "smooth". */
  ease?: Ease;
}

/** Keys sorted by time. Evaluation assumes this order. */
export function sortKeys(keys: readonly Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.time - b.time);
}

function hermite(p0: number, m0: number, p1: number, m1: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}

/**
 * Catmull-Rom slope (value per second) at key i, so "smooth" curves pass
 * through every key without stopping. The first and last keys get zero
 * slope, which eases in and out of the ends (and of loop points).
 */
function slopeAt(keys: readonly Keyframe[], i: number): number {
  const prev = keys[i - 1];
  const next = keys[i + 1];
  if (!prev || !next) return 0;
  const span = next.time - prev.time;
  return span > 0 ? (next.value - prev.value) / span : 0;
}

/** Value of a sorted track at `time`; holds the first/last value outside the keys. */
export function evaluateTrack(keys: readonly Keyframe[], time: number): number | null {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return null;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  let i = 0;
  while (i < keys.length - 2 && time >= keys[i + 1]!.time) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const dt = b.time - a.time;
  if (dt <= 0) return b.value;
  const t = (time - a.time) / dt;
  const delta = b.value - a.value;

  switch (b.ease ?? "smooth") {
    case "step":
      return a.value;
    case "linear":
      return a.value + delta * t;
    case "easeIn":
      return a.value + delta * t * t * t;
    case "easeOut":
      return a.value + delta * (1 - (1 - t) ** 3);
    case "easeInOut":
      return hermite(a.value, 0, b.value, 0, t);
    case "smooth":
      return hermite(a.value, slopeAt(keys, i) * dt, b.value, slopeAt(keys, i + 1) * dt, t);
  }
}

/** Every track's value at `time`, skipping names in `skip`. */
export function evaluateTracks(
  tracks: Readonly<Record<string, readonly Keyframe[]>>,
  time: number,
  skip?: ReadonlySet<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, keys] of Object.entries(tracks)) {
    if (skip?.has(name)) continue;
    const value = evaluateTrack(keys, time);
    if (value !== null) out[name] = value;
  }
  return out;
}

/** Add a key, replacing one within `tolerance` seconds of the same time. */
export function upsertKey(keys: readonly Keyframe[], key: Keyframe, tolerance = 1e-3): Keyframe[] {
  const kept = keys.filter((k) => Math.abs(k.time - key.time) > tolerance);
  // A replaced key keeps its ease unless a new one is given.
  const ease = key.ease ?? keys.find((k) => Math.abs(k.time - key.time) <= tolerance)?.ease;
  return sortKeys([...kept, ease ? { time: key.time, value: key.value, ease } : { time: key.time, value: key.value }]);
}

export function removeKeyAt(keys: readonly Keyframe[], time: number, tolerance = 1e-3): Keyframe[] {
  return keys.filter((k) => Math.abs(k.time - time) > tolerance);
}

/** The key within `tolerance` seconds of `time`, if any. */
export function keyAt(keys: readonly Keyframe[] | undefined, time: number, tolerance: number): Keyframe | undefined {
  return keys?.find((k) => Math.abs(k.time - time) <= tolerance);
}
