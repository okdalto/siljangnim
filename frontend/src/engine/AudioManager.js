import { uploadDataTexture, deleteTexture } from "./textureUtils.js";

/**
 * AudioManager — Web Audio API wrapper for real-time audio playback & FFT analysis.
 *
 * Provides engine-time-synchronized playback and per-frame FFT data
 * that can be used as shader uniforms or a texture (Shadertoy-style).
 */

export default class AudioManager {
  constructor() {
    this._audioContext = null; // created lazily on first load (autoplay policy)
    this._analyser = null;
    this._gainNode = null;
    this._source = null; // current BufferSourceNode (recreated on every play)
    this._buffer = null; // decoded AudioBuffer

    // Playback bookkeeping
    this._playing = false;
    this._startContextTime = 0; // audioContext.currentTime when source started
    this._startOffset = 0; // offset into the audio file at start

    // FFT data arrays (allocated once analyser is ready)
    this.frequencyData = null; // Uint8Array[1024]
    this.waveformData = null; // Uint8Array[1024]

    // Normalised band energies (updated each frame)
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;

    // WebGL FFT texture (lazily created in updateFrame)
    this.fftTexture = null;
    this._fftTextureWidth = 1024;

    // Volume
    this.volume = 1;
    this._hasScriptAudioUsage = false;
  }

  // ---- Computed properties ----

  get isLoaded() {
    return this._buffer !== null;
  }

  get isPlaying() {
    return this._playing;
  }

  get duration() {
    return this._buffer ? this._buffer.duration : 0;
  }

  get currentTime() {
    if (!this._buffer) return 0;
    if (!this._playing) return this._startOffset;
    const elapsed = this._audioContext.currentTime - this._startContextTime;
    const t = this._startOffset + elapsed;
    // Wrap if looping
    if (this._buffer.duration > 0) {
      return t % this._buffer.duration;
    }
    return t;
  }

  // ---- Core methods ----

  _ensureContext() {
    if (!this._audioContext) {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = 2048; // frequencyBinCount = 1024
      this._analyser.smoothingTimeConstant = 0.8;
      this._gainNode = this._audioContext.createGain();
      this._analyser.connect(this._gainNode);
      this._gainNode.connect(this._audioContext.destination);

      // Recording stream destination (audio capture for MediaRecorder)
      this._streamDest = this._audioContext.createMediaStreamDestination();
      this._gainNode.connect(this._streamDest);

      // Pass-through node for script-generated audio → speakers + recording
      this._scriptGain = this._audioContext.createGain();
      this._scriptGain.connect(this._audioContext.destination);
      this._scriptGain.connect(this._streamDest);

      this.frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
      this.waveformData = new Uint8Array(this._analyser.frequencyBinCount);
    }
  }

  /**
   * Load an audio file from a URL.
   * @param {string} url
   * @returns {Promise<void>}
   */
  async load(url) {
    this._ensureContext();
    this.stop();

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._buffer = await this._audioContext.decodeAudioData(arrayBuffer);
    this._startOffset = 0;
  }

  /**
   * Start or resume playback.
   * @param {number} [offset] — start position in seconds (defaults to current offset)
   */
  play(offset) {
    if (!this._buffer) return;
    this._ensureContext();

    // Stop any existing source
    this._stopSource();

    if (offset !== undefined) {
      this._startOffset = offset;
    }

    // Resume AudioContext if suspended (autoplay policy)
    if (this._audioContext.state === "suspended") {
      this._audioContext.resume();
    }

    const source = this._audioContext.createBufferSource();
    source.buffer = this._buffer;
    source.loop = true;
    source.connect(this._analyser);
    source.start(0, this._startOffset);

    this._source = source;
    this._startContextTime = this._audioContext.currentTime;
    this._playing = true;
  }

  pause() {
    if (!this._playing) return;
    // Record current position before stopping
    this._startOffset = this.currentTime;
    this._stopSource();
    this._playing = false;
  }

  stop() {
    this._stopSource();
    this._playing = false;
    this._startOffset = 0;
  }

  setVolume(v) {
    this.volume = v;
    if (this._gainNode) {
      this._gainNode.gain.value = v;
    }
  }

  /**
   * Return the AudioContext, creating it if needed.
   */
  getAudioContext() {
    this._ensureContext();
    return this._audioContext;
  }

  /**
   * Return a destination node for script-generated audio.
   * Audio connected here routes to both speakers and recording.
   */
  getRecordingDestination() {
    this._ensureContext();
    this._hasScriptAudioUsage = true;
    return this._scriptGain;
  }

  get hasScriptAudioUsage() {
    return this._hasScriptAudioUsage;
  }

  /**
   * Return the audio MediaStream for recording, or null if unavailable.
   */
  getAudioStream() {
    this._ensureContext();
    return this._streamDest?.stream ?? null;
  }

  /**
   * Return the decoded AudioBuffer for offline rendering, or null.
   */
  getAudioBuffer() {
    return this._buffer ?? null;
  }

  // ---- Engine integration (called by GLEngine) ----

  /**
   * Sync with engine pause/unpause.
   */
  syncPaused(paused, engineTime) {
    if (!this._buffer) return;
    if (paused && this._playing) {
      this.pause();
    } else if (!paused && !this._playing) {
      this._startOffset = engineTime % this.duration;
      this.play(this._startOffset);
    }
  }

  /**
   * Sync with engine seek.
   */
  syncSeek(time, isPaused) {
    if (!this._buffer) return;
    const offset = this.duration > 0 ? time % this.duration : time;
    this._startOffset = offset;
    if (this._playing) {
      // Re-start source at new position
      this.play(offset);
    }
  }

  /**
   * Called every frame by the engine. Reads FFT data, updates texture & band values.
   * @param {WebGL2RenderingContext} gl
   * @param {number} engineTime — current engine time in seconds
   * @param {boolean} [isOffline=false] — skip drift correction during offline rendering
   */
  updateFrame(gl, engineTime, isOffline = false) {
    if (!this._analyser || !this._buffer) return;

    // Drift correction with hysteresis to avoid oscillation around threshold
    // Skip in offline mode — Web Audio currentTime doesn't match synthetic engine time
    if (!isOffline && this._playing && this.duration > 0) {
      const drift = Math.abs(this.currentTime - (engineTime % this.duration));
      if (drift > 0.15) {
        // Large drift — re-sync immediately
        const newOffset = engineTime % this.duration;
        this.play(newOffset);
      }
      // Small drift (< 0.15s) is tolerable — no action to avoid audio glitches
    }

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

  /**
   * Stop current audio and release buffer. AudioContext is kept alive.
   */
  reset() {
    this._stopSource();
    this._playing = false;
    this._buffer = null;
    this._hasScriptAudioUsage = false;
    this._startOffset = 0;
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;

    // Clear FFT data
    if (this.frequencyData) this.frequencyData.fill(0);
    if (this.waveformData) this.waveformData.fill(128);

    // Keep fftTexture — it will be reused or overwritten
  }

  deleteTextures(gl) {
    deleteTexture(gl, this.fftTexture); this.fftTexture = null;
  }

  /**
   * Full teardown including AudioContext.
   */
  dispose() {
    this.reset();
    this.fftTexture = null;
    if (this._audioContext) {
      this._audioContext.close().catch(() => {});
      this._audioContext = null;
      this._analyser = null;
      this._gainNode = null;
    }
  }

  // ---- Private helpers ----

  _stopSource() {
    if (this._source) {
      try {
        this._source.stop();
      } catch (_) {
        // already stopped
      }
      this._source.disconnect();
      this._source = null;
    }
  }

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
    // Combine frequency + waveform into a single 2-row buffer
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
