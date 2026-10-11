// Pure parts of the scene inputs (inputs.ts): audio band levels and MIDI messages.

export const SPECTRUM_BINS = 256;
export const WAVEFORM_SAMPLES = 512;

export interface AudioState {
  /** Whether a source (microphone or file) is feeding the analyser. */
  active: boolean;
  source: "microphone" | "file" | null;
  /** 0..1 loudness of the waveform (RMS, scaled). */
  level: number;
  /** 0..1 average energy in roughly 20–250 Hz, 250–4000 Hz, 4–16 kHz. */
  bass: number;
  mid: number;
  treble: number;
  /** 0..1 per bin, linear frequency up to Nyquist. */
  spectrum: Float32Array;
  /** -1..1 samples. */
  waveform: Float32Array;
}

export function emptyAudio(): AudioState {
  return { active: false, source: null, level: 0, bass: 0, mid: 0, treble: 0, spectrum: new Float32Array(SPECTRUM_BINS), waveform: new Float32Array(WAVEFORM_SAMPLES) };
}

/** Average of `spectrum` (0..1 bins spanning 0..nyquist) between two frequencies. */
export function bandLevel(spectrum: Float32Array, nyquist: number, lowHz: number, highHz: number): number {
  const lo = Math.max(0, Math.floor((lowHz / nyquist) * spectrum.length));
  const hi = Math.min(spectrum.length, Math.max(lo + 1, Math.ceil((highHz / nyquist) * spectrum.length)));
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += spectrum[i]!;
  return sum / (hi - lo);
}

/** Fill the derived values from spectrum (0..1) and waveform (-1..1). */
export function updateBands(state: AudioState, nyquist: number): void {
  state.bass = bandLevel(state.spectrum, nyquist, 20, 250);
  state.mid = bandLevel(state.spectrum, nyquist, 250, 4000);
  state.treble = bandLevel(state.spectrum, nyquist, 4000, 16000);
  let sum = 0;
  for (const v of state.waveform) sum += v * v;
  // RMS of a full-scale sine is ~0.7; scale so loud input reaches ~1.
  state.level = Math.min(1, Math.sqrt(sum / state.waveform.length) * 1.5);
}

export interface MidiState {
  /** Control change values 0..1 by controller number (all channels merged). */
  cc: Float32Array;
  /** Note velocities 0..1 by note number; 0 when released. */
  notes: Float32Array;
  lastNote: { note: number; velocity: number; channel: number } | null;
  /** Pitch bend -1..1. */
  pitchBend: number;
}

export function emptyMidi(): MidiState {
  return { cc: new Float32Array(128), notes: new Float32Array(128), lastNote: null, pitchBend: 0 };
}

/** Apply one MIDI message (status, data1, data2) to the state. */
export function applyMidiMessage(state: MidiState, data: ArrayLike<number>): void {
  const status = data[0] ?? 0;
  const kind = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const a = data[1] ?? 0;
  const b = data[2] ?? 0;
  if (kind === 0x90 && b > 0) {
    state.notes[a] = b / 127;
    state.lastNote = { note: a, velocity: b / 127, channel };
  } else if (kind === 0x80 || (kind === 0x90 && b === 0)) {
    state.notes[a] = 0;
  } else if (kind === 0xb0) {
    state.cc[a] = b / 127;
  } else if (kind === 0xe0) {
    state.pitchBend = ((b << 7) | a) / 8192 - 1;
  }
}
