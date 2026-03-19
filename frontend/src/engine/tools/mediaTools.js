/**
 * Media-related tool handlers: recording, capture, timeline.
 */

import * as storage from "../storage.js";

const CAPTURE_MAX_DIM = 1024;
const DEFAULT_SAMPLE_RATE = 44100;
const MAX_WAV_DURATION = 60;

function _clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function _noteToFrequency(note) {
  if (typeof note !== "string") return null;
  const match = note.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return null;
  const [, letterRaw, accidental, octaveRaw] = match;
  const letter = letterRaw.toUpperCase();
  const octave = Number(octaveRaw);
  const semitoneMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semitone = semitoneMap[letter];
  if (accidental === "#") semitone += 1;
  if (accidental === "b") semitone -= 1;
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function _resolveFrequency(noteDef, fallbackFrequency) {
  if (typeof noteDef?.frequency === "number" && noteDef.frequency > 0) return noteDef.frequency;
  if (typeof noteDef?.midi === "number") return 440 * Math.pow(2, (noteDef.midi - 69) / 12);
  const fromName = _noteToFrequency(noteDef?.note);
  if (fromName) return fromName;
  return fallbackFrequency;
}

function _waveSample(waveform, phase) {
  switch (waveform) {
    case "square":
      return phase < 0.5 ? 1 : -1;
    case "saw":
      return phase * 2 - 1;
    case "triangle":
      return 1 - 4 * Math.abs(phase - 0.5);
    case "noise":
      return Math.random() * 2 - 1;
    case "sine":
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

function _envelopeAt(localTime, noteDuration, env) {
  const attack = Math.max(0, env.attack || 0);
  const decay = Math.max(0, env.decay || 0);
  const sustain = _clamp(env.sustain ?? 0.8, 0, 1);
  const release = Math.max(0, env.release || 0);

  if (localTime < 0 || localTime > noteDuration) return 0;
  if (attack > 0 && localTime < attack) return localTime / attack;
  if (decay > 0 && localTime < attack + decay) {
    const t = (localTime - attack) / decay;
    return 1 + (sustain - 1) * t;
  }
  if (release > 0 && localTime > noteDuration - release) {
    const t = (noteDuration - localTime) / release;
    return sustain * _clamp(t, 0, 1);
  }
  return sustain;
}

function _encodeWav(channels, sampleRate) {
  const channelCount = channels.length;
  const frameCount = channels[0]?.length || 0;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < channelCount; ch++) {
      const sample = _clamp(channels[ch][i] || 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function _buildNotes(input) {
  if (Array.isArray(input.notes) && input.notes.length) return input.notes;
  return [{
    start: 0,
    duration: input.duration,
    frequency: input.frequency,
    waveform: input.waveform,
    volume: input.volume,
    pan: input.pan,
  }];
}

function _synthesizeWav(input) {
  const duration = Number(input.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_WAV_DURATION) {
    throw new Error(`duration must be between 0 and ${MAX_WAV_DURATION} seconds`);
  }

  const sampleRate = Math.round(Number(input.sample_rate) || DEFAULT_SAMPLE_RATE);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("sample_rate must be between 8000 and 96000");
  }

  const channels = input.channels === 2 ? 2 : 1;
  const frameCount = Math.max(1, Math.round(duration * sampleRate));
  const output = Array.from({ length: channels }, () => new Float32Array(frameCount));
  const defaultWaveform = input.waveform || "sine";
  const defaultFrequency = typeof input.frequency === "number" && input.frequency > 0 ? input.frequency : 440;
  const defaultVolume = _clamp(input.volume ?? 0.35, 0, 1);
  const globalEnv = {
    attack: input.attack ?? 0.01,
    decay: input.decay ?? 0.08,
    sustain: input.sustain ?? 0.8,
    release: input.release ?? 0.1,
  };

  for (const note of _buildNotes(input)) {
    const noteStart = Math.max(0, Number(note.start) || 0);
    const noteDuration = Math.max(0.01, Number(note.duration) || duration);
    const frequency = _resolveFrequency(note, defaultFrequency);
    if (!Number.isFinite(frequency) || frequency <= 0) continue;

    const waveform = note.waveform || defaultWaveform;
    const volume = _clamp(note.volume ?? defaultVolume, 0, 1);
    const pan = channels === 2 ? _clamp(note.pan ?? 0, -1, 1) : 0;
    const leftGain = channels === 2 ? Math.sqrt((1 - pan) * 0.5) : 1;
    const rightGain = channels === 2 ? Math.sqrt((1 + pan) * 0.5) : 1;
    const env = {
      attack: note.attack ?? globalEnv.attack,
      decay: note.decay ?? globalEnv.decay,
      sustain: note.sustain ?? globalEnv.sustain,
      release: note.release ?? globalEnv.release,
    };

    const startIndex = Math.floor(noteStart * sampleRate);
    const endIndex = Math.min(frameCount, Math.ceil((noteStart + noteDuration) * sampleRate));
    for (let i = startIndex; i < endIndex; i++) {
      const localTime = i / sampleRate - noteStart;
      const phase = (localTime * frequency) % 1;
      const amp = volume * _envelopeAt(localTime, noteDuration, env);
      const sample = _waveSample(waveform, phase) * amp;
      output[0][i] += sample * leftGain;
      if (channels === 2) output[1][i] += sample * rightGain;
    }
  }

  if (input.normalize !== false) {
    let peak = 0;
    for (const channel of output) {
      for (let i = 0; i < channel.length; i++) {
        peak = Math.max(peak, Math.abs(channel[i]));
      }
    }
    if (peak > 0.98) {
      const scale = 0.98 / peak;
      for (const channel of output) {
        for (let i = 0; i < channel.length; i++) channel[i] *= scale;
      }
    }
  }

  return {
    buffer: _encodeWav(output, sampleRate),
    sampleRate,
    channels,
    duration,
  };
}

export async function toolStartRecording(input, broadcast, ctx) {
  const resetTimeline = input.resetTimeline !== false;
  const msg = { type: "start_recording" };
  if (input.duration != null) msg.duration = input.duration;
  if (input.fps != null) msg.fps = input.fps;
  if (resetTimeline) msg.resetTimeline = true;
  broadcast(msg);
  const durationStr = input.duration ? ` for ${input.duration}s` : "";

  // If duration is specified and we have a promise factory, wait for recording to finish
  if (input.duration != null && ctx.recordingDonePromise) {
    const promise = ctx.recordingDonePromise();
    await promise;
    return `ok — recording finished (${input.duration}s)${resetTimeline ? " (timeline was reset to 0)" : ""}.`;
  }
  return `ok — recording started${durationStr}${resetTimeline ? " (timeline reset to 0)" : ""}.`;
}

export async function toolStopRecording(input, broadcast) {
  broadcast({ type: "stop_recording" });
  return "ok — recording stopped. The WebM file will auto-download in the user's browser.";
}

export async function toolGenerateWav(input, broadcast) {
  const filenameRaw = (input.filename || `generated_${Date.now()}.wav`).trim();
  const filename = filenameRaw.toLowerCase().endsWith(".wav") ? filenameRaw : `${filenameRaw}.wav`;
  const { buffer, duration, sampleRate, channels } = _synthesizeWav(input);

  await storage.saveUpload(filename, buffer, "audio/wav");
  broadcast({
    type: "files_uploaded",
    files: [{ name: filename, mime_type: "audio/wav", size: buffer.byteLength }],
  });

  return `ok — generated "${filename}" (${duration}s, ${sampleRate} Hz, ${channels} ch) and saved it to uploads. ` +
    `Use ctx.audio.load("/api/uploads/${filename}") in setup to attach it to the scene, then ctx.audio.play(0) when needed.`;
}

/**
 * Capture viewport tool — returns base64 JPEG image data.
 * Returns an object with { image: base64string } instead of a plain string,
 * so the executor can build image content blocks for vision-capable models.
 */
export async function toolCaptureViewport(input, broadcast, ctx) {
  const engine = ctx.engineRef?.current;
  if (!engine?.canvas) {
    return "Error: No viewport canvas available. Make sure a scene is loaded.";
  }

  // For WebGPU, the render output is on the 2D overlay canvas (or the
  // offscreen backend canvas), not the main canvas which stays idle/black.
  const canvas = engine._blitOverlay || engine.canvas;
  try {
    const maxDim = CAPTURE_MAX_DIM;
    let w = Math.min(input.width || canvas.width, maxDim);
    let h = Math.min(input.height || canvas.height, maxDim);

    // If canvas is larger than requested, downscale via offscreen canvas
    let dataUrl;
    if (w < canvas.width || h < canvas.height) {
      // Maintain aspect ratio if only one dimension specified
      if (!input.width && !input.height) {
        const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height, 1);
        w = Math.round(canvas.width * scale);
        h = Math.round(canvas.height * scale);
      }
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const octx = offscreen.getContext("2d");
      octx.drawImage(canvas, 0, 0, w, h);
      dataUrl = offscreen.toDataURL("image/jpeg", 0.8);
    } else {
      dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    }

    // Strip the data:image/jpeg;base64, prefix
    const base64 = dataUrl.split(",")[1];
    if (!base64) return "Error: Failed to capture canvas — empty image data.";

    // Return structured result — the executor will handle this specially
    return { __type: "image", media_type: "image/jpeg", base64, width: w, height: h };
  } catch (err) {
    return `Error capturing viewport: ${err.message}`;
  }
}

export async function toolSetTimeline(input, broadcast) {
  const updates = {};
  if (input.duration != null) updates.duration = Number(input.duration);
  if (input.loop != null) updates.loop = Boolean(input.loop);
  if (input.fps != null) {
    const f = Number(input.fps);
    if (f >= 1 && f <= 240) updates.fps = Math.round(f);
    else return "Error: fps must be between 1 and 240.";
  }
  if (Object.keys(updates).length === 0) return "Error: provide at least one of 'duration', 'loop', or 'fps'.";
  broadcast({ type: "set_timeline", ...updates });
  const parts = [];
  if (updates.duration != null) parts.push(`duration=${updates.duration}s`);
  if (updates.loop != null) parts.push(`loop=${updates.loop}`);
  if (updates.fps != null) parts.push(`fps=${updates.fps}`);
  return `ok — timeline updated: ${parts.join(", ")}.`;
}
