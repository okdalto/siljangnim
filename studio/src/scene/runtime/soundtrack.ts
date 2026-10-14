// The audio file a scene plays (ctx.utils.audio.play) as its soundtrack: kept on the scene's clock (pause, seek,
// timeline loops), analysed from the decoded samples while recording offline (frames aren't rendered in real time,
// so a playing element can't line up with them), and cut to the recording's length to be muxed into the video.

/** Where the soundtrack should be at this scene time; null once a one-shot soundtrack has ended. */
export function soundtrackPosition(sceneTime: number, duration: number, loop: boolean): number | null {
  if (!(duration > 0)) return sceneTime;
  if (sceneTime < duration) return Math.max(0, sceneTime);
  return loop ? sceneTime % duration : null;
}

/** The soundtrack laid out over `seconds` from scene time 0: looped (or silent after it ends) and scaled by volume. */
export function fitSoundtrack(channels: Float32Array[], sampleRate: number, seconds: number, loop: boolean, volume: number): Float32Array[] {
  const length = Math.max(1, Math.round(seconds * sampleRate));
  return channels.map((source) => {
    const out = new Float32Array(length);
    if (!source.length) return out;
    for (let i = 0; i < length; i++) {
      const j = loop ? i % source.length : i;
      if (j >= source.length) break;
      out[i] = source[j]! * volume;
    }
    return out;
  });
}

/** Mono mix, for analysis. */
export function mixDown(channels: Float32Array[]): Float32Array {
  const length = channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) mono[i]! += channel[i]! / channels.length;
  return mono;
}

/** In-place radix-2 FFT of real input (im starts zeroed); n must be a power of two. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
      }
    }
  }
}

/**
 * What an AnalyserNode would report at `time` for these samples: the fftSize samples ending there, a Blackman window,
 * magnitudes smoothed against the previous call by `smoothing`, in dB (getFloatFrequencyData) and the raw waveform
 * (getFloatTimeDomainData). `smoothed` carries the state between calls (length fftSize / 2).
 */
export function analyseAt(
  mono: Float32Array,
  sampleRate: number,
  time: number,
  smoothing: number,
  smoothed: Float32Array,
  freqDb: Float32Array,
  wave: Float32Array,
): void {
  const n = wave.length;
  const end = Math.round(time * sampleRate);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = mono[end - n + i] ?? 0;
    wave[i] = s;
    // Blackman window, as the Web Audio analyser uses.
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
    re[i] = s * w;
  }
  fft(re, im);
  for (let k = 0; k < n / 2; k++) {
    const magnitude = Math.hypot(re[k]!, im[k]!) / n;
    smoothed[k] = smoothing * smoothed[k]! + (1 - smoothing) * magnitude;
    freqDb[k] = smoothed[k]! > 0 ? 20 * Math.log10(smoothed[k]!) : -Infinity;
  }
}
