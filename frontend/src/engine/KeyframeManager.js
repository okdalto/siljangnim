/**
 * KeyframeManager — pure logic class for keyframe animation tracks.
 *
 * Each track is keyed by uniform name and stores an array of
 * {time, value, inTangent, outTangent} keyframes sorted by ascending time.
 * Tangents are slope values (value-per-second).
 * Interpolation uses cubic Hermite splines.
 */
export default class KeyframeManager {
  constructor() {
    /** @type {Object<string, Array<{time: number, value: number, inTangent: number, outTangent: number}>>} */
    this.tracks = {};
  }

  // ── Track CRUD ──────────────────────────────────────────

  setTrack(uniform, keyframes) {
    this.tracks[uniform] = [...keyframes]
      .map((kf) => ({
        time: kf.time,
        value: kf.value,
        inTangent: kf.inTangent ?? 0,
        outTangent: kf.outTangent ?? 0,
        linear: kf.linear ?? false,
      }))
      .sort((a, b) => a.time - b.time);
  }

  getTrack(uniform) {
    return this.tracks[uniform] || [];
  }

  hasKeyframes(uniform) {
    return (this.tracks[uniform]?.length ?? 0) > 0;
  }

  clearTrack(uniform) {
    delete this.tracks[uniform];
  }

  // ── Keyframe manipulation ───────────────────────────────

  addKeyframe(uniform, time, value, inTangent = 0, outTangent = 0) {
    if (!this.tracks[uniform]) this.tracks[uniform] = [];
    this.tracks[uniform].push({ time, value, inTangent, outTangent });
    this.tracks[uniform].sort((a, b) => a.time - b.time);
  }

  removeKeyframe(uniform, index) {
    const track = this.tracks[uniform];
    if (!track) return;
    track.splice(index, 1);
    if (track.length === 0) delete this.tracks[uniform];
  }

  moveKeyframe(uniform, index, time, value) {
    const track = this.tracks[uniform];
    if (!track || !track[index]) return;
    track[index].time = time;
    track[index].value = value;
    track.sort((a, b) => a.time - b.time);
  }

  // ── Evaluation (cubic Hermite spline) ───────────────────

  evaluate(uniform, time) {
    const track = this.tracks[uniform];
    if (!track || track.length === 0) return null;

    if (time <= track[0].time) return track[0].value;
    if (time >= track[track.length - 1].time) return track[track.length - 1].value;

    for (let i = 0; i < track.length - 1; i++) {
      const a = track[i];
      const b = track[i + 1];
      if (time >= a.time && time <= b.time) {
        const dt = b.time - a.time;
        if (dt === 0) return a.value;
        // If both endpoints are linear, just lerp
        if (a.linear && b.linear) {
          return a.value + ((time - a.time) / dt) * (b.value - a.value);
        }
        const t = (time - a.time) / dt;
        const t2 = t * t;
        const t3 = t2 * t;
        // Hermite basis functions
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        // Linear keyframes use straight-line slope instead of stored tangent
        const linearSlope = (b.value - a.value) / dt;
        const m0 = (a.linear ? linearSlope : a.outTangent) * dt;
        const m1 = (b.linear ? linearSlope : b.inTangent) * dt;
        return h00 * a.value + h10 * m0 + h01 * b.value + h11 * m1;
      }
    }

    return track[track.length - 1].value;
  }

  evaluateAll(time) {
    const result = {};
    for (const uniform of Object.keys(this.tracks)) {
      const v = this.evaluate(uniform, time);
      if (v !== null) result[uniform] = v;
    }
    return result;
  }
}
