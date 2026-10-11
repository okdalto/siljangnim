import { describe, expect, it } from "vitest";
import { evaluateTrack, evaluateTracks, keyAt, removeKeyAt, sortKeys, upsertKey, type Keyframe } from "./gl/keyframes";
import { DEFAULT_SCENE, parseScene } from "./schema";

const track = (...keys: Keyframe[]) => sortKeys(keys);

describe("evaluateTrack", () => {
  it("holds the ends and returns null for an empty track", () => {
    const keys = track({ time: 1, value: 2 }, { time: 3, value: 6 });
    expect(evaluateTrack(keys, 0)).toBe(2);
    expect(evaluateTrack(keys, 5)).toBe(6);
    expect(evaluateTrack([], 1)).toBeNull();
  });

  it("interpolates each ease between two keys", () => {
    const at = (ease: Keyframe["ease"], t: number) => evaluateTrack(track({ time: 0, value: 0 }, { time: 2, value: 10, ease }), t)!;
    expect(at("linear", 0.5)).toBeCloseTo(2.5);
    expect(at("step", 1.99)).toBe(0);
    expect(at("easeIn", 1)).toBeCloseTo(1.25); // 10 * 0.5^3
    expect(at("easeOut", 1)).toBeCloseTo(8.75);
    expect(at("easeInOut", 1)).toBeCloseTo(5);
    expect(at("easeInOut", 0.5)).toBeLessThan(2.5); // slow start
    // Two keys: smooth has zero end slopes, same as easeInOut.
    expect(at(undefined, 0.5)).toBeCloseTo(at("easeInOut", 0.5));
  });

  it("passes through middle keys without stopping when smooth", () => {
    const keys = track({ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 2, value: 2 });
    // A straight line of keys stays (nearly) straight around the middle key.
    expect(evaluateTrack(keys, 0.9)!).toBeGreaterThan(0.85);
    expect(evaluateTrack(keys, 1.1)!).toBeLessThan(1.15);
    expect(evaluateTrack(keys, 1)).toBe(1);
  });

  it("evaluates several tracks and skips overridden ones", () => {
    const tracks = { u_a: track({ time: 0, value: 1 }), u_b: track({ time: 0, value: 2 }) };
    expect(evaluateTracks(tracks, 0, new Set(["u_b"]))).toEqual({ u_a: 1 });
  });
});

describe("key editing", () => {
  it("replaces a key at the same time, keeping its ease", () => {
    const keys = track({ time: 0, value: 0 }, { time: 1, value: 5, ease: "step" });
    expect(upsertKey(keys, { time: 1.0004, value: 7 })).toEqual([
      { time: 0, value: 0 },
      { time: 1.0004, value: 7, ease: "step" },
    ]);
    expect(upsertKey(keys, { time: 0.5, value: 2 }).map((k) => k.time)).toEqual([0, 0.5, 1]);
    expect(removeKeyAt(keys, 1)).toEqual([{ time: 0, value: 0 }]);
    expect(keyAt(keys, 1.02, 1 / 30)?.value).toBe(5);
    expect(keyAt(keys, 1.1, 1 / 30)).toBeUndefined();
  });
});

describe("timeline in the scene format", () => {
  const withSpeed = (extra: object) => parseScene({ ...DEFAULT_SCENE, ...extra });

  it("fills timeline defaults and keeps scenes without one valid", () => {
    const result = withSpeed({ timeline: { duration: 4 }, keyframes: { u_speed: [{ time: 0, value: 1 }] } });
    expect(result.ok && result.scene.timeline).toEqual({ duration: 4, loop: true, preserveStateOnLoop: false });
    const plain = parseScene({ version: 2, script: { render: "x" } });
    expect(plain.ok && plain.scene.keyframes).toEqual({});
  });

  it("explains invalid keyframes", () => {
    const errors = (extra: object) => {
      const r = withSpeed(extra);
      return r.ok ? "" : r.errors.join("\n");
    };
    expect(errors({ keyframes: { u_speed: [{ time: 0, value: 1 }] } })).toContain("keyframes need a timeline");
    expect(errors({ timeline: { duration: 4 }, keyframes: { u_nope: [{ time: 0, value: 1 }] } })).toContain('no uniform "u_nope"');
    expect(errors({ timeline: { duration: 4 }, keyframes: { u_tint: [{ time: 0, value: 1 }] } })).toContain("only float and int");
    expect(errors({ timeline: { duration: 4 }, keyframes: { u_speed: [{ time: 9, value: 1 }] } })).toContain("after the timeline end");
    expect(errors({ timeline: { duration: 4 }, keyframes: { u_speed: [{ time: 1, value: 1, ease: "bounce" }] } })).toContain("ease");
  });
});
