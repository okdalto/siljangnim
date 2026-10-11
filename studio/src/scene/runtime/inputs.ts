// Live inputs for a scene (M3): microphone or audio-file analysis, MIDI and
// camera. One instance per load; everything it opened is closed on unload.
import { SPECTRUM_BINS, WAVEFORM_SAMPLES, applyMidiMessage, emptyAudio, emptyMidi, updateBands } from "./inputData";

const FFT_SIZE = SPECTRUM_BINS * 4; // 1024 → 512 frequency bins, averaged in pairs
const DB_FLOOR = -100;
const DB_CEIL = -20;

export class SceneInputs {
  readonly audio = emptyAudio();
  readonly midi = emptyMidi();
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private node: AudioNode | null = null;
  private element: HTMLAudioElement | null = null;
  private streams: MediaStream[] = [];
  private midiAccess: MIDIAccess | null = null;
  private freq = new Float32Array(FFT_SIZE / 2);
  private wave = new Float32Array(FFT_SIZE);

  private ensureContext(): { context: AudioContext; analyser: AnalyserNode } {
    if (!this.context || !this.analyser) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.75;
    }
    return { context: this.context, analyser: this.analyser };
  }

  /** Analyse the microphone (not played back). */
  async microphone(): Promise<void> {
    this.stopAudio();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.streams.push(stream);
    const { context, analyser } = this.ensureContext();
    this.node = context.createMediaStreamSource(stream);
    this.node.connect(analyser);
    this.audio.active = true;
    this.audio.source = "microphone";
    void context.resume();
  }

  /** Play an audio file (asset URL) and analyse it. */
  /** output: false analyses without playing it through the speakers. */
  async play(url: string, options: { loop?: boolean; volume?: number; output?: boolean } = {}): Promise<HTMLAudioElement> {
    this.stopAudio();
    const element = new Audio(url);
    element.loop = options.loop ?? true;
    element.volume = options.volume ?? 1;
    const { context, analyser } = this.ensureContext();
    this.node = context.createMediaElementSource(element);
    this.node.connect(analyser);
    if (options.output !== false) analyser.connect(context.destination);
    this.element = element;
    this.audio.active = true;
    this.audio.source = "file";
    void context.resume();
    // Autoplay can be blocked until the person clicks the viewport (resume() runs then).
    await element.play().catch(() => undefined);
    return element;
  }

  stopAudio(): void {
    this.node?.disconnect();
    this.node = null;
    this.analyser?.disconnect();
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute("src");
      this.element = null;
    }
    this.audio.active = false;
    this.audio.source = null;
  }

  /** A user gesture lets blocked audio start. */
  resume(): void {
    void this.context?.resume();
    if (this.element?.paused) void this.element.play().catch(() => undefined);
  }

  async enableMidi(): Promise<void> {
    if (this.midiAccess) return;
    if (!navigator.requestMIDIAccess) throw new Error("Web MIDI is not available here");
    const access = await navigator.requestMIDIAccess();
    this.midiAccess = access;
    const bind = () => access.inputs.forEach((input) => (input.onmidimessage = (e) => e.data && applyMidiMessage(this.midi, e.data)));
    bind();
    access.onstatechange = bind;
  }

  async camera(options: { width?: number; height?: number; facingMode?: string } = {}): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: options.width ?? 1280, height: options.height ?? 720, ...(options.facingMode ? { facingMode: options.facingMode } : {}) },
    });
    this.streams.push(stream);
    return stream;
  }

  /** Refresh the audio values; call once per frame before rendering. */
  update(): void {
    if (!this.analyser || !this.audio.active) return;
    this.analyser.getFloatFrequencyData(this.freq);
    this.analyser.getFloatTimeDomainData(this.wave);
    const spectrum = this.audio.spectrum;
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const db = (this.freq[i * 2]! + this.freq[i * 2 + 1]!) / 2;
      spectrum[i] = Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
    }
    const step = this.wave.length / WAVEFORM_SAMPLES;
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) this.audio.waveform[i] = this.wave[Math.floor(i * step)]!;
    updateBands(this.audio, (this.context?.sampleRate ?? 44100) / 2);
  }

  dispose(): void {
    this.stopAudio();
    for (const stream of this.streams.splice(0)) stream.getTracks().forEach((t) => t.stop());
    if (this.midiAccess) {
      this.midiAccess.inputs.forEach((input) => (input.onmidimessage = null));
      this.midiAccess.onstatechange = null;
      this.midiAccess = null;
    }
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
  }
}
