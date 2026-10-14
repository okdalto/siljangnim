import { describe, expect, it } from "vitest";
import { analyseAt, fitSoundtrack, mixDown, soundtrackPosition } from "./soundtrack";

describe("soundtrack", () => {
  it("follows the scene clock, looping or ending", () => {
    expect(soundtrackPosition(3, 10, false)).toBe(3);
    expect(soundtrackPosition(12, 10, true)).toBeCloseTo(2);
    expect(soundtrackPosition(12, 10, false)).toBeNull();
    // Not known yet (metadata still loading): follow the clock.
    expect(soundtrackPosition(4, Number.NaN, false)).toBe(4);
  });

  it("lays the soundtrack out over the recording: looped or silent after the end, scaled by volume", () => {
    const source = new Float32Array([1, 2, 3]);
    expect([...fitSoundtrack([source], 1, 7, true, 0.5)[0]!]).toEqual([0.5, 1, 1.5, 0.5, 1, 1.5, 0.5]);
    expect([...fitSoundtrack([source], 1, 5, false, 1)[0]!]).toEqual([1, 2, 3, 0, 0]);
    expect([...mixDown([new Float32Array([1, 3]), new Float32Array([3, 1])])]).toEqual([2, 2]);
  });

  it("finds a tone in the bin an AnalyserNode would, at a similar level", () => {
    const rate = 44100;
    const n = 1024;
    const bin = 40;
    const freq = (bin * rate) / n;
    const samples = Float32Array.from({ length: rate }, (_, i) => Math.sin((2 * Math.PI * freq * i) / rate));
    const smoothed = new Float32Array(n / 2);
    const db = new Float32Array(n / 2);
    const wave = new Float32Array(n);
    analyseAt(samples, rate, 0.5, 0, smoothed, db, wave);
    const peak = db.indexOf(Math.max(...db));
    expect(peak).toBe(bin);
    // A full-scale sine through a Blackman window: about 0.42 / 2 of full scale, ≈ −13.5 dB.
    expect(db[bin]).toBeGreaterThan(-15);
    expect(db[bin]).toBeLessThan(-12);
    expect(db[bin + 20]).toBeLessThan(-60);
    // Before the start: silence.
    analyseAt(samples, rate, 0, 0, smoothed.fill(0), db, wave);
    expect(Math.max(...wave.map(Math.abs))).toBe(0);
  });
});
