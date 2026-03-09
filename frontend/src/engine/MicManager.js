import { uploadDataTexture, deleteTexture } from "./textureUtils.js";
import BaseManager from "./BaseManager.js";

/**
 * MicManager — Real-time microphone input with FFT analysis.
 *
 * Uses getUserMedia to capture microphone audio and provides per-frame
 * FFT data (frequency + waveform) as shader-ready textures and band energies.
 */

export default class MicManager extends BaseManager {
  constructor() {
    super();
    this._audioContext = null;
    this._analyser = null;
    this._stream = null;
    this._sourceNode = null;

    // FFT data arrays (allocated once analyser is ready)
    this.frequencyData = null; // Uint8Array[1024]
    this.waveformData = null;  // Uint8Array[1024]

    // Normalised band energies (updated each frame)
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;

    // WebGL FFT texture (lazily created in updateFrame)
    this.fftTexture = null;
    this._fftTextureWidth = 1024;
  }

  /**
   * Request microphone access and set up the audio processing chain.
   * Idempotent — calling multiple times is safe.
   */
  async init() {
    await this._guardedInit(async () => {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (this._audioContext.state === "suspended") {
        await this._audioContext.resume();
      }

      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = 2048; // frequencyBinCount = 1024
      this._analyser.smoothingTimeConstant = 0.8;

      this._sourceNode = this._audioContext.createMediaStreamSource(this._stream);
      this._sourceNode.connect(this._analyser);
      // Do NOT connect analyser to destination — avoid feedback loop

      this.frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
      this.waveformData = new Uint8Array(this._analyser.frequencyBinCount);
    });
  }

  /**
   * Called every frame by the engine. Reads FFT data, updates texture & band values.
   * @param {WebGL2RenderingContext} gl
   * @param {boolean} [isOffline=false] — skip live mic reads during offline rendering
   */
  updateFrame(gl, isOffline = false) {
    if (!this._analyser || !this.initialized) return;
    if (isOffline) return; // no live mic data during offline rendering

    // Read FFT data
    this._analyser.getByteFrequencyData(this.frequencyData);
    this._analyser.getByteTimeDomainData(this.waveformData);

    // Compute band energies
    this.bass = this._bandAverage(0, 10);
    this.mid = this._bandAverage(10, 100);
    this.treble = this._bandAverage(100, 400);
    this.energy = this._bandAverage(0, this.frequencyData.length);

    // Update FFT texture
    this._updateFFTTexture(gl);
  }

  // ---- Cleanup ----

  reset() {
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;

    if (this.frequencyData) this.frequencyData.fill(0);
    if (this.waveformData) this.waveformData.fill(128);
  }

  deleteTextures(gl) {
    deleteTexture(gl, this.fftTexture);
    this.fftTexture = null;
  }

  dispose() {
    this.reset();
    this.fftTexture = null;
    this.initialized = false;

    if (this._sourceNode) {
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }

    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }

    if (this._audioContext) {
      this._audioContext.close().catch(() => {});
      this._audioContext = null;
      this._analyser = null;
    }
  }

  // ---- Private helpers ----

  _bandAverage(from, to) {
    if (!this.frequencyData || this.frequencyData.length === 0) return 0;
    const end = Math.min(to, this.frequencyData.length);
    if (from >= end) return 0;
    let sum = 0;
    for (let i = from; i < end; i++) {
      sum += this.frequencyData[i];
    }
    return sum / ((end - from) * 255);
  }

  _updateFFTTexture(gl) {
    const w = this._fftTextureWidth;
    const combined = new Uint8Array(w * 2);
    combined.set(this.frequencyData, 0);
    combined.set(this.waveformData, w);
    this.fftTexture = uploadDataTexture(gl, this.fftTexture, w, 2, combined, {
      internalFormat: gl.R8,
      format: gl.RED,
      type: gl.UNSIGNED_BYTE,
      filter: gl.LINEAR,
    });
  }
}
