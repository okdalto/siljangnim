/**
 * assetProcessor.js — Browser-based asset analysis pipeline.
 *
 * When files are uploaded, this module extracts technical metadata
 * (dimensions, duration, dominant colors, BPM, vertex counts, etc.)
 * entirely in the browser using Web APIs.
 *
 * Every public function is wrapped in try/catch and never throws.
 * Partial results are returned on failure.
 */

import {
  ASSET_CATEGORY,
  categoryFromFilename,
} from "./assetDescriptor.js";
import { rgbToHex, colorDistance } from "../utils/colorUtils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ArrayBuffer to a Blob with the given MIME type.
 */
function toBlob(data, mimeType) {
  return new Blob([data], { type: mimeType });
}

/**
 * Create an object URL from an ArrayBuffer + mimeType.
 * Caller is responsible for revoking.
 */
function toBlobUrl(data, mimeType) {
  return URL.createObjectURL(toBlob(data, mimeType));
}

// ---------------------------------------------------------------------------
// 1. Image analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a raster image (PNG, JPEG, WebP, GIF, BMP).
 *
 * Extracts dimensions, alpha channel presence, dominant colors (top 5),
 * tileability heuristic, and texture-role candidates.
 *
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      mimeType - e.g. "image/png"
 * @returns {Promise<object>}    - Image metadata (never throws)
 */
export async function processImage(data, mimeType) {
  const result = {
    width: 0,
    height: 0,
    hasAlpha: false,
    dominantColors: [],
    isTileable: null,
    textureRoleCandidates: [],
  };

  try {
    // Load image -----------------------------------------------------------
    const blob = toBlob(data, mimeType);
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      // Fallback: load via <img>
      const url = URL.createObjectURL(blob);
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
    }

    result.width = bitmap.width;
    result.height = bitmap.height;

    // Draw onto a canvas to access pixel data ------------------------------
    const MAX_SAMPLE = 256; // down-sample large images for speed
    const sw = Math.min(bitmap.width, MAX_SAMPLE);
    const sh = Math.min(bitmap.height, MAX_SAMPLE);

    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, sw, sh);
    const imageData = ctx.getImageData(0, 0, sw, sh);
    const pixels = imageData.data; // Uint8ClampedArray RGBA

    // Alpha detection ------------------------------------------------------
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 255) {
        result.hasAlpha = true;
        break;
      }
    }

    // Dominant colors via frequency binning (quantise to 4-bit per channel)
    const colorBins = new Map();
    const STEP_X = Math.max(1, Math.floor(sw / 10));
    const STEP_Y = Math.max(1, Math.floor(sh / 10));

    for (let y = 0; y < sh; y += STEP_Y) {
      for (let x = 0; x < sw; x += STEP_X) {
        const idx = (y * sw + x) * 4;
        // Quantise to reduce unique colours
        const qr = pixels[idx] & 0xf0;
        const qg = pixels[idx + 1] & 0xf0;
        const qb = pixels[idx + 2] & 0xf0;
        const key = (qr << 16) | (qg << 8) | qb;
        colorBins.set(key, (colorBins.get(key) || 0) + 1);
      }
    }

    // Sort bins by frequency, pick top 5
    const sorted = [...colorBins.entries()].sort((a, b) => b[1] - a[1]);
    const topColors = sorted.slice(0, 5).map(([key]) => {
      const r = (key >> 16) & 0xff;
      const g = (key >> 8) & 0xff;
      const b = key & 0xff;
      return rgbToHex(r, g, b);
    });
    result.dominantColors = topColors;

    // Tileability heuristic ------------------------------------------------
    // Compare left edge vs right edge, and top edge vs bottom edge.
    result.isTileable = checkTileability(pixels, sw, sh);

    // Texture role candidates ----------------------------------------------
    result.textureRoleCandidates = detectTextureRoles(pixels, sw, sh, topColors);

    // Clean up bitmap if it supports close()
    if (typeof bitmap.close === "function") bitmap.close();
  } catch (err) {
    result._error = err.message;
  }

  return result;
}

/**
 * Simple tileability heuristic: compare edge pixels on opposite sides.
 * Returns true if the average color difference is below a threshold.
 */
function checkTileability(pixels, w, h) {
  try {
    let diffSum = 0;
    let count = 0;
    const SAMPLE_COUNT = Math.min(w, 32);
    const SAMPLE_COUNT_V = Math.min(h, 32);

    // Horizontal: left col vs right col
    for (let i = 0; i < SAMPLE_COUNT_V; i++) {
      const y = Math.floor((i / SAMPLE_COUNT_V) * h);
      const lIdx = (y * w) * 4;
      const rIdx = (y * w + (w - 1)) * 4;
      diffSum += Math.abs(pixels[lIdx] - pixels[rIdx]);
      diffSum += Math.abs(pixels[lIdx + 1] - pixels[rIdx + 1]);
      diffSum += Math.abs(pixels[lIdx + 2] - pixels[rIdx + 2]);
      count += 3;
    }

    // Vertical: top row vs bottom row
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const x = Math.floor((i / SAMPLE_COUNT) * w);
      const tIdx = x * 4;
      const bIdx = ((h - 1) * w + x) * 4;
      diffSum += Math.abs(pixels[tIdx] - pixels[bIdx]);
      diffSum += Math.abs(pixels[tIdx + 1] - pixels[bIdx + 1]);
      diffSum += Math.abs(pixels[tIdx + 2] - pixels[bIdx + 2]);
      count += 3;
    }

    const avgDiff = diffSum / count;
    // Threshold: average per-channel difference < 20 → likely tileable
    return avgDiff < 20;
  } catch {
    return null;
  }
}

/**
 * Detect texture role candidates based on pixel statistics.
 *
 * - "diffuse"   — always a candidate for colour images
 * - "normal"    — dominant colour is bluish (high blue channel)
 * - "roughness" — mostly grayscale
 * - "height"    — mostly grayscale (single channel height data)
 * - "emissive"  — contains bright saturated colours
 */
function detectTextureRoles(pixels, w, h, dominantColors) {
  const roles = [];

  let totalR = 0, totalG = 0, totalB = 0;
  let grayscaleCount = 0;
  let brightCount = 0;
  let sampleCount = 0;

  const STEP = Math.max(1, Math.floor((w * h) / 1000));
  for (let i = 0; i < pixels.length; i += STEP * 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    totalR += r;
    totalG += g;
    totalB += b;
    sampleCount++;

    // Grayscale check: R, G, B within 15 of each other
    if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15) {
      grayscaleCount++;
    }

    // Bright saturated check
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    if (maxC > 200 && (maxC - minC) > 80) {
      brightCount++;
    }
  }

  const avgR = totalR / sampleCount;
  const avgG = totalG / sampleCount;
  const avgB = totalB / sampleCount;
  const grayscaleRatio = grayscaleCount / sampleCount;
  const brightRatio = brightCount / sampleCount;

  // Always a diffuse candidate
  roles.push("diffuse");

  // Normal map: bluish dominant (typical normal maps are mostly blue)
  if (avgB > avgR + 30 && avgB > avgG + 30 && avgB > 150) {
    roles.push("normal");
  }

  // Grayscale images → roughness / height candidates
  if (grayscaleRatio > 0.85) {
    roles.push("roughness");
    roles.push("height");
  }

  // Emissive: bright saturated pixels
  if (brightRatio > 0.1) {
    roles.push("emissive");
  }

  return roles;
}

// ---------------------------------------------------------------------------
// 2. Audio analysis
// ---------------------------------------------------------------------------

/**
 * Analyse an audio file (MP3, WAV, OGG, FLAC).
 *
 * Extracts duration, sample rate, channel count, estimated BPM,
 * loudness peaks, band energy (bass/mid/treble), and an FFT summary.
 *
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      mimeType - e.g. "audio/mpeg"
 * @returns {Promise<object>}    - Audio metadata (never throws)
 */
export async function processAudio(data, mimeType) {
  const result = {
    duration: 0,
    sampleRate: 0,
    channels: 0,
    bpm: null,
    peaks: [],
    bandEnergy: null,
    fftSummary: null,
  };

  let audioCtx = null;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(data.slice(0));

    result.duration = audioBuffer.duration;
    result.sampleRate = audioBuffer.sampleRate;
    result.channels = audioBuffer.numberOfChannels;

    // Work with the first channel for analysis
    const channelData = audioBuffer.getChannelData(0);

    // BPM detection --------------------------------------------------------
    result.bpm = detectBPM(channelData, audioBuffer.sampleRate);

    // Peak detection -------------------------------------------------------
    result.peaks = findPeaks(channelData, audioBuffer.sampleRate, 10);

    // Band energy ----------------------------------------------------------
    result.bandEnergy = computeBandEnergy(channelData, audioBuffer.sampleRate);

    // FFT summary (64 bins) ------------------------------------------------
    result.fftSummary = computeFFTSummary(channelData, audioBuffer.sampleRate, 64);
  } catch (err) {
    result._error = err.message;
  } finally {
    if (audioCtx) {
      try { await audioCtx.close(); } catch { /* ignore */ }
    }
  }

  return result;
}

/**
 * Simple BPM detection via energy-based onset detection.
 *
 * 1. Compute energy in short windows (e.g. 1024 samples).
 * 2. Find peaks in energy above a local average threshold.
 * 3. Compute average inter-onset interval → BPM.
 */
function detectBPM(channelData, sampleRate) {
  try {
    const WINDOW = 1024;
    const HOP = 512;
    const energies = [];

    for (let i = 0; i + WINDOW <= channelData.length; i += HOP) {
      let energy = 0;
      for (let j = i; j < i + WINDOW; j++) {
        energy += channelData[j] * channelData[j];
      }
      energies.push(energy / WINDOW);
    }

    // Local average with a sliding window of 43 frames (~1 second at 44100/512)
    const AVG_WINDOW = 43;
    const onsets = [];

    for (let i = AVG_WINDOW; i < energies.length; i++) {
      let localAvg = 0;
      for (let j = i - AVG_WINDOW; j < i; j++) {
        localAvg += energies[j];
      }
      localAvg /= AVG_WINDOW;

      // Onset if energy is 1.5x the local average
      if (energies[i] > localAvg * 1.5 && energies[i] > 0.001) {
        onsets.push(i);
      }
    }

    // Filter onsets: remove those too close together (< 0.2s apart)
    const MIN_GAP = Math.floor(0.2 * sampleRate / HOP);
    const filtered = [onsets[0]];
    for (let i = 1; i < onsets.length; i++) {
      if (onsets[i] - filtered[filtered.length - 1] >= MIN_GAP) {
        filtered.push(onsets[i]);
      }
    }

    if (filtered.length < 4) return null;

    // Average inter-onset interval
    const gaps = [];
    for (let i = 1; i < filtered.length; i++) {
      gaps.push(filtered[i] - filtered[i - 1]);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const secondsPerBeat = (avgGap * HOP) / sampleRate;
    const bpm = Math.round(60 / secondsPerBeat);

    // Sanity check: BPM between 40 and 220
    if (bpm >= 40 && bpm <= 220) return bpm;

    // Try halving/doubling if out of range
    if (bpm > 220 && bpm / 2 >= 40) return Math.round(bpm / 2);
    if (bpm < 40 && bpm * 2 <= 220) return Math.round(bpm * 2);

    return bpm;
  } catch {
    return null;
  }
}

/**
 * Find the top N loudest moments in the audio signal.
 *
 * @param {Float32Array} channelData
 * @param {number}       sampleRate
 * @param {number}       count - Number of peaks to return
 * @returns {Array<{time: number, amplitude: number}>}
 */
function findPeaks(channelData, sampleRate, count) {
  try {
    const WINDOW = 4096;
    const HOP = 2048;
    const windows = [];

    for (let i = 0; i + WINDOW <= channelData.length; i += HOP) {
      let maxAmp = 0;
      for (let j = i; j < i + WINDOW; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > maxAmp) maxAmp = abs;
      }
      windows.push({ time: (i + WINDOW / 2) / sampleRate, amplitude: maxAmp });
    }

    // Sort by amplitude descending
    windows.sort((a, b) => b.amplitude - a.amplitude);

    // Pick top N, ensuring they are at least 0.3s apart
    const peaks = [];
    for (const w of windows) {
      if (peaks.length >= count) break;
      const tooClose = peaks.some((p) => Math.abs(p.time - w.time) < 0.3);
      if (!tooClose) {
        peaks.push({
          time: Math.round(w.time * 1000) / 1000,
          amplitude: Math.round(w.amplitude * 10000) / 10000,
        });
      }
    }

    return peaks.sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

/**
 * Compute energy in three frequency bands using a simple DFT on a
 * representative chunk of the audio.
 *
 * Bands:
 *   bass   — 20 Hz to 200 Hz
 *   mid    — 200 Hz to 2000 Hz
 *   treble — 2000 Hz to 20000 Hz
 *
 * @returns {{ bass: number, mid: number, treble: number }} normalised 0-1
 */
function computeBandEnergy(channelData, sampleRate) {
  try {
    // Use a chunk from the middle of the track (up to 2^15 = 32768 samples)
    const FFT_SIZE = Math.min(32768, nextPow2(channelData.length));
    const start = Math.max(0, Math.floor((channelData.length - FFT_SIZE) / 2));
    const chunk = channelData.slice(start, start + FFT_SIZE);

    // Apply Hann window
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (chunk.length - 1)));
    }

    // Real-valued FFT (magnitude only, first half)
    const magnitudes = simpleMagnitudeFFT(chunk);
    const binHz = sampleRate / FFT_SIZE;

    let bass = 0, mid = 0, treble = 0;
    let bassCount = 0, midCount = 0, trebleCount = 0;

    for (let i = 0; i < magnitudes.length; i++) {
      const freq = i * binHz;
      const mag = magnitudes[i] * magnitudes[i]; // energy
      if (freq >= 20 && freq < 200) { bass += mag; bassCount++; }
      else if (freq >= 200 && freq < 2000) { mid += mag; midCount++; }
      else if (freq >= 2000 && freq <= 20000) { treble += mag; trebleCount++; }
    }

    // Average energy per bin, then normalise relative to max
    bass = bassCount > 0 ? bass / bassCount : 0;
    mid = midCount > 0 ? mid / midCount : 0;
    treble = trebleCount > 0 ? treble / trebleCount : 0;

    const maxE = Math.max(bass, mid, treble, 1e-10);
    return {
      bass: Math.round((bass / maxE) * 10000) / 10000,
      mid: Math.round((mid / maxE) * 10000) / 10000,
      treble: Math.round((treble / maxE) * 10000) / 10000,
    };
  } catch {
    return null;
  }
}

/**
 * Compute an average spectral shape summarised into N bins.
 *
 * @param {Float32Array} channelData
 * @param {number}       sampleRate
 * @param {number}       numBins - Number of output bins (default 64)
 * @returns {number[]|null}
 */
function computeFFTSummary(channelData, sampleRate, numBins = 64) {
  try {
    const FFT_SIZE = Math.min(8192, nextPow2(channelData.length));
    const start = Math.max(0, Math.floor((channelData.length - FFT_SIZE) / 2));
    const chunk = channelData.slice(start, start + FFT_SIZE);

    // Hann window
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (chunk.length - 1)));
    }

    const magnitudes = simpleMagnitudeFFT(chunk);
    const binsPerOutput = Math.floor(magnitudes.length / numBins);
    const summary = [];

    for (let b = 0; b < numBins; b++) {
      let sum = 0;
      const from = b * binsPerOutput;
      const to = Math.min(from + binsPerOutput, magnitudes.length);
      for (let i = from; i < to; i++) sum += magnitudes[i];
      summary.push(sum / (to - from));
    }

    // Normalise to 0-1
    const maxVal = Math.max(...summary, 1e-10);
    return summary.map((v) => Math.round((v / maxVal) * 10000) / 10000);
  } catch {
    return null;
  }
}

/**
 * Minimal magnitude-only DFT (not a true FFT, but sufficient for
 * small chunk sizes used here). For chunks up to 32768 samples
 * this runs fast enough on the main thread.
 *
 * Returns magnitude of the first N/2 frequency bins.
 */
function simpleMagnitudeFFT(realInput) {
  const N = realInput.length;
  const half = N >> 1;

  // Use the Cooley-Tukey radix-2 DIT FFT
  // Input must be power of 2
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = realInput[i];

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // FFT butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
        const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }

  const magnitudes = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return magnitudes;
}

/** Return the next power of 2 >= n. */
function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ---------------------------------------------------------------------------
// 3. Video analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a video file (MP4, WebM, MOV).
 *
 * Extracts duration, dimensions, approximate FPS, and captures the
 * first frame as a thumbnail data URL.
 *
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      mimeType - e.g. "video/mp4"
 * @returns {Promise<object>}    - Video metadata (never throws)
 */
export async function processVideo(data, mimeType) {
  const result = {
    duration: 0,
    width: 0,
    height: 0,
    fps: 0,
    thumbnailDataUrl: null,
  };

  let blobUrl = null;

  try {
    blobUrl = toBlobUrl(data, mimeType);

    const video = await loadVideo(blobUrl);

    result.duration = video.duration;
    result.width = video.videoWidth;
    result.height = video.videoHeight;

    // Approximate FPS using requestVideoFrameCallback if available,
    // otherwise fall back to metadata or a default estimate.
    result.fps = await estimateFPS(video);

    // Capture first frame as thumbnail
    result.thumbnailDataUrl = captureFrame(video);

  } catch (err) {
    result._error = err.message;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }

  return result;
}

/**
 * Load a <video> element from a blob URL and wait for metadata.
 */
function loadVideo(blobUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("Failed to load video"));

    video.src = blobUrl;
    video.load();
  });
}

/**
 * Attempt to estimate FPS.
 *
 * Uses requestVideoFrameCallback if supported (counts frames over 1 second),
 * otherwise returns 0 (unknown).
 */
async function estimateFPS(video) {
  // Try requestVideoFrameCallback-based estimation
  if (typeof video.requestVideoFrameCallback === "function") {
    try {
      return await new Promise((resolve) => {
        let frameCount = 0;
        let startTime = null;
        const MAX_DURATION_MS = 1500; // sample 1.5s max

        video.currentTime = 0;
        video.playbackRate = 2; // speed up sampling

        const onFrame = (_now, metadata) => {
          if (startTime === null) startTime = metadata.mediaTime;
          frameCount++;
          const elapsed = (metadata.mediaTime - startTime) * 1000;

          if (elapsed >= MAX_DURATION_MS || video.ended) {
            video.pause();
            const seconds = elapsed / 1000;
            resolve(seconds > 0 ? Math.round(frameCount / seconds) : 0);
            return;
          }
          video.requestVideoFrameCallback(onFrame);
        };

        video.requestVideoFrameCallback(onFrame);

        // Timeout fallback
        const timeout = setTimeout(() => {
          video.pause();
          resolve(0);
        }, 3000);

        video.play().then(() => {}).catch(() => {
          clearTimeout(timeout);
          resolve(0);
        });
      });
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Capture the current frame of a video as a PNG data URL.
 */
function captureFrame(video) {
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return null;

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    // OffscreenCanvas does not have toDataURL; use convertToBlob workaround
    // For synchronous thumbnail, use a regular canvas instead.
    const regularCanvas = document.createElement("canvas");
    regularCanvas.width = Math.min(w, 640); // limit thumbnail size
    regularCanvas.height = Math.min(h, Math.round((Math.min(w, 640) / w) * h));
    const rctx = regularCanvas.getContext("2d");
    rctx.drawImage(video, 0, 0, regularCanvas.width, regularCanvas.height);

    return regularCanvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. SVG analysis
// ---------------------------------------------------------------------------

/**
 * Analyse an SVG file.
 *
 * Parses the SVG DOM to count elements, paths, shapes, and extract viewBox.
 *
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      mimeType - e.g. "image/svg+xml"
 * @returns {Promise<object>}    - SVG metadata (never throws)
 */
export async function processSvg(data, mimeType) {
  const result = {
    elementCount: 0,
    pathCount: 0,
    shapeCount: 0,
    viewBox: null,
  };

  try {
    const text = new TextDecoder("utf-8").decode(data);
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");

    // Check for parse errors
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      result._error = "SVG parse error";
      return result;
    }

    const svgRoot = doc.querySelector("svg");
    if (!svgRoot) {
      result._error = "No <svg> root element found";
      return result;
    }

    // viewBox
    const vb = svgRoot.getAttribute("viewBox");
    if (vb) result.viewBox = vb;

    // Count all elements
    const allElements = svgRoot.querySelectorAll("*");
    result.elementCount = allElements.length;

    // Paths
    result.pathCount = svgRoot.querySelectorAll("path").length;

    // Shapes: rect, circle, ellipse, line, polyline, polygon
    const shapeSelectors = "rect, circle, ellipse, line, polyline, polygon";
    result.shapeCount = svgRoot.querySelectorAll(shapeSelectors).length;
  } catch (err) {
    result._error = err.message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 5. 3D Model analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a 3D model file (GLB/glTF/OBJ).
 *
 * For GLB: parse the binary header and JSON chunk to extract basic stats.
 * For OBJ: count vertex, face, and normal lines.
 *
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      mimeType - MIME type
 * @param {string}      filename - Original filename (for extension detection)
 * @returns {Promise<object>}    - Model metadata (never throws)
 */
export async function processModel3d(data, mimeType, filename = "") {
  const result = {
    vertexCount: 0,
    faceCount: 0,
    materialCount: 0,
    meshCount: 0,
    hasTextures: false,
    textureCount: 0,
    hasSkeleton: false,
    boneCount: 0,
    animationCount: 0,
    animationNames: [],
    boundingBox: null,
    format: "",
  };

  try {
    const ext = (filename.split(".").pop() || "").toLowerCase();

    if (ext === "glb") {
      Object.assign(result, parseGLB(data));
    } else if (ext === "gltf") {
      Object.assign(result, parseGLTFJson(data));
    } else if (ext === "obj") {
      Object.assign(result, parseOBJ(data));
    } else {
      result.format = ext || "unknown";
    }
  } catch (err) {
    result._error = err.message;
  }

  return result;
}

/**
 * Parse a GLB binary file to extract basic stats.
 *
 * GLB structure:
 *   12-byte header: magic (u32), version (u32), length (u32)
 *   Chunk 0: JSON chunk (type 0x4E4F534A)
 *   Chunk 1+: BIN chunks
 */
function parseGLB(data) {
  const stats = { format: "glb", vertexCount: 0, faceCount: 0, materialCount: 0 };

  try {
    const view = new DataView(data);
    const magic = view.getUint32(0, true);

    // Verify GLB magic: 0x46546C67 = "glTF"
    if (magic !== 0x46546C67) {
      stats._error = "Not a valid GLB file";
      return stats;
    }

    // Read JSON chunk
    const chunkLength = view.getUint32(12, true);
    const chunkType = view.getUint32(16, true);

    // JSON chunk type: 0x4E4F534A
    if (chunkType !== 0x4E4F534A) {
      stats._error = "First chunk is not JSON";
      return stats;
    }

    const jsonBytes = new Uint8Array(data, 20, chunkLength);
    const jsonStr = new TextDecoder("utf-8").decode(jsonBytes);
    const gltf = JSON.parse(jsonStr);

    return extractGltfStats(gltf, stats);
  } catch {
    return stats;
  }
}

/**
 * Parse a plain glTF JSON file.
 */
function parseGLTFJson(data) {
  const stats = { format: "gltf", vertexCount: 0, faceCount: 0, materialCount: 0 };
  try {
    const jsonStr = new TextDecoder("utf-8").decode(data);
    const gltf = JSON.parse(jsonStr);
    return extractGltfStats(gltf, stats);
  } catch {
    return stats;
  }
}

/**
 * Extract stats from a parsed glTF JSON object.
 */
function extractGltfStats(gltf, stats) {
  // Materials
  if (Array.isArray(gltf.materials)) {
    stats.materialCount = gltf.materials.length;
  }

  // Meshes
  stats.meshCount = gltf.meshes?.length || 0;

  // Textures
  stats.hasTextures = !!(gltf.textures && gltf.textures.length > 0);
  stats.textureCount = gltf.textures?.length || 0;

  // Skeleton / Skins
  stats.hasSkeleton = !!(gltf.skins && gltf.skins.length > 0);
  stats.boneCount = 0;
  if (Array.isArray(gltf.skins)) {
    for (const skin of gltf.skins) {
      stats.boneCount += skin.joints?.length || 0;
    }
  }

  // Animations
  stats.animationCount = gltf.animations?.length || 0;
  stats.animationNames = [];
  if (Array.isArray(gltf.animations)) {
    stats.animationNames = gltf.animations.map((a, i) => a.name || `Animation ${i}`);
  }

  // Estimate vertex count and bounding box from accessors
  if (Array.isArray(gltf.meshes) && Array.isArray(gltf.accessors)) {
    let totalVertices = 0;
    let totalFaces = 0;
    let bboxMin = [Infinity, Infinity, Infinity];
    let bboxMax = [-Infinity, -Infinity, -Infinity];

    for (const mesh of gltf.meshes) {
      if (!Array.isArray(mesh.primitives)) continue;
      for (const prim of mesh.primitives) {
        if (prim.attributes && prim.attributes.POSITION != null) {
          const acc = gltf.accessors[prim.attributes.POSITION];
          if (acc && acc.count) totalVertices += acc.count;
          // Extract bounding box from accessor min/max
          if (acc?.min && acc?.max) {
            for (let i = 0; i < 3; i++) {
              if (acc.min[i] < bboxMin[i]) bboxMin[i] = acc.min[i];
              if (acc.max[i] > bboxMax[i]) bboxMax[i] = acc.max[i];
            }
          }
        }
        if (prim.indices != null) {
          const acc = gltf.accessors[prim.indices];
          if (acc && acc.count) totalFaces += Math.floor(acc.count / 3);
        }
      }
    }

    stats.vertexCount = totalVertices;
    stats.faceCount = totalFaces;

    if (bboxMin[0] !== Infinity) {
      stats.boundingBox = {
        min: bboxMin.map(v => Math.round(v * 1000) / 1000),
        max: bboxMax.map(v => Math.round(v * 1000) / 1000),
      };
    }
  }

  return stats;
}

/**
 * Parse an OBJ text file — count vertices, faces, and normals.
 */
function parseOBJ(data) {
  const stats = { format: "obj", vertexCount: 0, faceCount: 0, normalCount: 0, materialCount: 0 };

  try {
    const text = new TextDecoder("utf-8").decode(data);
    const lines = text.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("v ")) stats.vertexCount++;
      else if (trimmed.startsWith("f ")) stats.faceCount++;
      else if (trimmed.startsWith("vn ")) stats.normalCount++;
      else if (trimmed.startsWith("usemtl ")) stats.materialCount++;
    }
  } catch {
    // Return partial stats
  }

  return stats;
}

// ---------------------------------------------------------------------------
// 6. Font analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a font file (TTF, OTF, WOFF, WOFF2).
 *
 * Uses the FontFace API to load the font and extract the family name.
 *
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      mimeType - e.g. "font/ttf"
 * @param {string}      filename - Original filename
 * @returns {Promise<object>}    - Font metadata (never throws)
 */
export async function processFont(data, mimeType, filename = "") {
  const result = {
    family: "",
    loaded: false,
  };

  try {
    // Derive a test family name from the filename
    const baseName = filename.split(".").slice(0, -1).join(".") || "TestFont";
    const testFamily = `__assetProc_${baseName}_${Date.now()}`;

    const fontFace = new FontFace(testFamily, data);
    const loadedFace = await fontFace.load();

    result.loaded = true;
    result.family = loadedFace.family.replace(/^__assetProc_/, "");

    // Clean up: remove from document fonts if added
    // (We don't add it, so no cleanup needed)
  } catch (err) {
    result._error = err.message;
    // Even on error, try to extract family from filename
    result.family = filename.split(".").slice(0, -1).join(".") || "";
  }

  return result;
}

// ---------------------------------------------------------------------------
// 7. Data file analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a data file (JSON, CSV, TXT, XML, YAML, etc.).
 *
 * Extracts line count, format, key count (for JSON), and a truncated preview.
 *
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      filename - Original filename
 * @returns {object}             - Data metadata (never throws)
 */
export function processData(data, filename) {
  const result = {
    lineCount: 0,
    keyCount: 0,
    format: null,
    preview: null,
  };

  try {
    const text = new TextDecoder("utf-8").decode(data);
    const lines = text.split("\n");
    result.lineCount = lines.length;

    const ext = (filename.split(".").pop() || "").toLowerCase();
    result.format = ext;

    // For JSON: count top-level keys and generate pretty preview
    if (ext === "json") {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          result.keyCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
        }
        const pretty = JSON.stringify(parsed, null, 2);
        result.preview = pretty.length > 2000 ? pretty.slice(0, 2000) + "\n..." : pretty;
      } catch {
        // Invalid JSON — just show raw text
        result.preview = text.length > 2000 ? text.slice(0, 2000) + "\n..." : text;
      }
    } else {
      // For other text formats, show raw content truncated
      result.preview = text.length > 2000 ? text.slice(0, 2000) + "\n..." : text;
    }
  } catch (err) {
    result._error = err.message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 8. Main entry point
// ---------------------------------------------------------------------------

/**
 * Process an uploaded asset and extract metadata.
 *
 * Determines the asset category from filename/mimeType and delegates
 * to the appropriate processor. Never throws — always returns at least
 * partial results.
 *
 * @param {string}      filename - Original filename
 * @param {ArrayBuffer} data     - Raw file bytes
 * @param {string}      mimeType - MIME type string
 * @returns {Promise<{ processor: string, outputs: any[], metadata: object }>}
 */
export async function processAsset(filename, data, mimeType) {
  const category = categoryFromFilename(filename);
  let processor = "unknown";
  let outputs = [];
  let metadata = {};

  try {
    switch (category) {
      case ASSET_CATEGORY.IMAGE: {
        processor = "image";
        metadata = await processImage(data, mimeType);
        outputs = [{ type: "technicalInfo", data: metadata }];
        break;
      }

      case ASSET_CATEGORY.AUDIO: {
        processor = "audio";
        metadata = await processAudio(data, mimeType);
        outputs = [{ type: "technicalInfo", data: metadata }];
        break;
      }

      case ASSET_CATEGORY.VIDEO: {
        processor = "video";
        metadata = await processVideo(data, mimeType);
        // Include thumbnail as a separate output
        const thumbnailUrl = metadata.thumbnailDataUrl || null;
        outputs = [
          { type: "technicalInfo", data: metadata },
          ...(thumbnailUrl ? [{ type: "thumbnail", dataUrl: thumbnailUrl }] : []),
        ];
        break;
      }

      case ASSET_CATEGORY.SVG: {
        processor = "svg";
        metadata = await processSvg(data, mimeType);
        outputs = [{ type: "technicalInfo", data: metadata }];
        break;
      }

      case ASSET_CATEGORY.MODEL_3D: {
        processor = "model3d";
        metadata = await processModel3d(data, mimeType, filename);
        outputs = [{ type: "technicalInfo", data: metadata }];
        break;
      }

      case ASSET_CATEGORY.FONT: {
        processor = "font";
        metadata = await processFont(data, mimeType, filename);
        outputs = [{ type: "technicalInfo", data: metadata }];
        break;
      }

      case ASSET_CATEGORY.DATA: {
        processor = "data";
        metadata = processData(data, filename);
        outputs = [{ type: "technicalInfo", data: metadata }];
        break;
      }

      default: {
        processor = "unknown";
        metadata = { category: "unknown", filename };
        outputs = [];
        break;
      }
    }
  } catch (err) {
    metadata._error = err.message;
  }

  return { processor, outputs, metadata };
}

// ---------------------------------------------------------------------------
// 8. Uniform binding suggestions
// ---------------------------------------------------------------------------

/**
 * Given an asset descriptor, suggest how the asset could be bound as
 * shader uniforms.
 *
 * @param {object} descriptor - An AssetDescriptor (from assetDescriptor.js)
 * @returns {Array<{ uniformName: string, uniformType: string, description: string }>}
 */
export function suggestUniformBindings(descriptor) {
  const suggestions = [];

  try {
    const category = descriptor.category;
    const techInfo = descriptor.technicalInfo || {};
    const roles = techInfo.textureRoleCandidates || [];

    switch (category) {
      case ASSET_CATEGORY.IMAGE: {
        // Base texture binding
        suggestions.push({
          uniformName: "u_texture",
          uniformType: "sampler2D",
          description: `Diffuse/color texture from "${descriptor.filename}" (${techInfo.width}x${techInfo.height})`,
        });

        // Role-specific suggestions
        if (roles.includes("normal")) {
          suggestions.push({
            uniformName: "u_normalMap",
            uniformType: "sampler2D",
            description: "Normal map (detected bluish dominant color)",
          });
        }
        if (roles.includes("roughness")) {
          suggestions.push({
            uniformName: "u_roughnessMap",
            uniformType: "sampler2D",
            description: "Roughness map (detected grayscale image)",
          });
        }
        if (roles.includes("height")) {
          suggestions.push({
            uniformName: "u_heightMap",
            uniformType: "sampler2D",
            description: "Height/displacement map (detected grayscale image)",
          });
        }
        if (roles.includes("emissive")) {
          suggestions.push({
            uniformName: "u_emissiveMap",
            uniformType: "sampler2D",
            description: "Emissive map (detected bright saturated colors)",
          });
        }

        // Resolution uniform
        suggestions.push({
          uniformName: "u_textureResolution",
          uniformType: "vec2",
          description: `Texture resolution: ${techInfo.width} x ${techInfo.height}`,
        });
        break;
      }

      case ASSET_CATEGORY.AUDIO: {
        suggestions.push(
          {
            uniformName: "u_bass",
            uniformType: "float",
            description: "Bass band energy (20-200 Hz), normalised 0-1",
          },
          {
            uniformName: "u_mid",
            uniformType: "float",
            description: "Mid band energy (200-2000 Hz), normalised 0-1",
          },
          {
            uniformName: "u_treble",
            uniformType: "float",
            description: "Treble band energy (2000-20000 Hz), normalised 0-1",
          },
          {
            uniformName: "u_volume",
            uniformType: "float",
            description: "Overall volume/amplitude, normalised 0-1",
          },
        );

        if (techInfo.bpm) {
          suggestions.push({
            uniformName: "u_bpm",
            uniformType: "float",
            description: `Detected BPM: ${techInfo.bpm}`,
          });
        }

        suggestions.push({
          uniformName: "u_fft",
          uniformType: "sampler2D",
          description: "FFT spectrum data as a 1D texture (64 bins)",
        });
        break;
      }

      case ASSET_CATEGORY.VIDEO: {
        suggestions.push(
          {
            uniformName: "u_videoTexture",
            uniformType: "sampler2D",
            description: `Video frame texture from "${descriptor.filename}"`,
          },
          {
            uniformName: "u_videoResolution",
            uniformType: "vec2",
            description: `Video resolution: ${techInfo.width} x ${techInfo.height}`,
          },
          {
            uniformName: "u_videoTime",
            uniformType: "float",
            description: `Current playback time (duration: ${techInfo.duration?.toFixed(1)}s)`,
          },
        );
        break;
      }

      case ASSET_CATEGORY.SVG: {
        suggestions.push({
          uniformName: "u_svgTexture",
          uniformType: "sampler2D",
          description: "SVG rendered to texture",
        });
        break;
      }

      case ASSET_CATEGORY.MODEL_3D: {
        suggestions.push(
          {
            uniformName: "u_modelMatrix",
            uniformType: "mat4",
            description: `Model transform for "${descriptor.filename}" (${techInfo.vertexCount || "?"} vertices)`,
          },
          {
            uniformName: "u_normalMatrix",
            uniformType: "mat3",
            description: "Normal matrix (inverse transpose of model-view)",
          },
        );
        break;
      }

      case ASSET_CATEGORY.FONT: {
        suggestions.push({
          uniformName: "u_fontAtlas",
          uniformType: "sampler2D",
          description: `Font atlas texture for "${techInfo.family || descriptor.filename}"`,
        });
        break;
      }

      default:
        break;
    }
  } catch {
    // Return whatever suggestions we have so far
  }

  return suggestions;
}
