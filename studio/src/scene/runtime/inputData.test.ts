import { describe, expect, it } from "vitest";
import { applyMidiMessage, applyOscMessages, bandLevel, emptyAudio, emptyMidi, emptyOsc, updateBands } from "./inputData";

describe("audio bands", () => {
  it("averages the bins in each band", () => {
    const spectrum = new Float32Array(256);
    spectrum.fill(1, 0, 3); // 0..~258 Hz at 22050 Hz Nyquist
    expect(bandLevel(spectrum, 22050, 20, 250)).toBeCloseTo(1);
    expect(bandLevel(spectrum, 22050, 4000, 16000)).toBe(0);
    const state = emptyAudio();
    state.spectrum.set(spectrum);
    state.waveform.fill(0.5);
    updateBands(state, 22050);
    expect(state.bass).toBeCloseTo(1);
    expect(state.treble).toBe(0);
    expect(state.level).toBeCloseTo(0.75);
  });
});

describe("midi", () => {
  it("tracks notes, control changes and pitch bend", () => {
    const m = emptyMidi();
    applyMidiMessage(m, [0x91, 60, 127]); // note on, channel 2
    expect(m.notes[60]).toBe(1);
    expect(m.lastNote).toEqual({ note: 60, velocity: 1, channel: 2 });
    applyMidiMessage(m, [0x90, 60, 0]); // note on with velocity 0 = off
    expect(m.notes[60]).toBe(0);
    applyMidiMessage(m, [0xb0, 7, 64]);
    expect(m.cc[7]).toBeCloseTo(64 / 127);
    applyMidiMessage(m, [0xe0, 0, 64]); // center
    expect(m.pitchBend).toBe(0);
    applyMidiMessage(m, [0xe0, 0x7f, 0x7f]);
    expect(m.pitchBend).toBeCloseTo(1, 3);
  });
});

describe("osc", () => {
  it("keeps the latest values per address and this frame's messages", () => {
    const osc = emptyOsc();
    const frame: typeof osc.messages = [];
    applyOscMessages(osc, frame, [["/fader/1", [0.25]], ["/toggle", [true]], ["/fader/1", [0.75, "x"]]]);
    expect(osc.get("/fader/1")).toBe(0.75);
    expect(osc.get("/fader/1", 1, -1)).toBe(-1);
    expect(osc.get("/toggle")).toBe(1);
    expect(osc.get("/missing", 0, 0.5)).toBe(0.5);
    expect(osc.last).toEqual({ address: "/fader/1", args: [0.75, "x"] });
    expect(frame).toHaveLength(3);
  });
});
