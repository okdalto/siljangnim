// Live inputs for a scene (M3): microphone or audio-file analysis, MIDI,
// camera and OSC. One instance per load; everything it opened is closed on unload.
import { SPECTRUM_BINS, WAVEFORM_SAMPLES, applyMidiMessage, applyOscMessages, emptyAudio, emptyMidi, emptyOsc, updateBands, type OscMessage, type OscState } from "./inputData";
import { analyseAt, fitSoundtrack, mixDown, soundtrackPosition } from "./soundtrack";

export const DEFAULT_OSC_PORT = 9000;

const FFT_SIZE = SPECTRUM_BINS * 4; // 1024 → 512 frequency bins, averaged in pairs
const DB_FLOOR = -100;
const DB_CEIL = -20;
const SMOOTHING = 0.75;
/** How far the soundtrack may drift from the scene clock before it is moved back. */
const MAX_DRIFT_S = 0.15;

export class SceneInputs {
  readonly audio = emptyAudio();
  readonly midi = emptyMidi();
  readonly osc = emptyOsc();
  private oscFrame: OscState["messages"] = [];
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private node: AudioNode | null = null;
  private element: HTMLAudioElement | null = null;
  private streams: MediaStream[] = [];
  private midiAccess: MIDIAccess | null = null;
  private freq = new Float32Array(FFT_SIZE / 2);
  private wave = new Float32Array(FFT_SIZE);
  /** The file play() started, to follow the scene clock and to record. */
  private soundtrack: { url: string; loop: boolean; volume: number; audible: boolean } | null = null;
  /** Decoded soundtrack while recording offline: ctx.audio is computed from it at each frame's time. */
  private offline: { channels: Float32Array[]; mono: Float32Array; sampleRate: number; smoothed: Float32Array } | null = null;
  /** Realtime recordings take the audible soundtrack from here. */
  private recordDestination: MediaStreamAudioDestinationNode | null = null;

  /** requestOsc asks the app to have the hub listen (browsers can't receive UDP). */
  constructor(private readonly requestOsc: (port: number) => void = () => undefined) {}

  private ensureContext(): { context: AudioContext; analyser: AnalyserNode } {
    if (!this.context || !this.analyser) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = SMOOTHING;
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
    const audible = options.output !== false;
    if (audible) {
      analyser.connect(context.destination);
      this.recordDestination ??= context.createMediaStreamDestination();
      analyser.connect(this.recordDestination);
    }
    this.element = element;
    this.soundtrack = { url, loop: element.loop, volume: element.volume, audible };
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
    this.soundtrack = null;
    this.offline = null;
    this.audio.active = false;
    this.audio.source = null;
  }

  /** A user gesture lets blocked audio start. */
  resume(): void {
    void this.context?.resume();
    if (this.element?.paused && !this.offline) void this.element.play().catch(() => undefined);
  }

  /**
   * Keep the soundtrack on the scene clock: paused with the scene, moved on seeks and timeline loops, so beats line up
   * with what's drawn. Called every frame.
   */
  sync(sceneTime: number, playing: boolean): void {
    const element = this.element;
    if (!element || this.offline) return;
    const position = soundtrackPosition(sceneTime, element.duration, element.loop);
    // Scrubbing while paused moves it too, so it starts in the right place.
    if (position !== null && Math.abs(element.currentTime - position) > MAX_DRIFT_S) element.currentTime = position;
    if (position === null || !playing) {
      if (!element.paused) element.pause();
      return;
    }
    if (element.paused) void element.play().catch(() => undefined);
  }

  /**
   * Before an offline recording: decode the soundtrack so ctx.audio follows each frame's time instead of a playing
   * element (frames aren't rendered in real time). The element is paused until endOffline().
   */
  async startOffline(): Promise<void> {
    if (!this.soundtrack) return;
    this.element?.pause();
    const data = await (await fetch(this.soundtrack.url)).arrayBuffer();
    const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
    this.offline = { channels, mono: mixDown(channels), sampleRate: decoded.sampleRate, smoothed: new Float32Array(FFT_SIZE / 2) };
  }

  endOffline(): void {
    this.offline = null;
  }

  /** The audible soundtrack laid out over a recording of `seconds` from time 0, or null when there is none. */
  soundtrackFor(seconds: number): AudioBuffer | null {
    if (!this.offline || !this.soundtrack?.audible) return null;
    const { channels, sampleRate } = this.offline;
    const fitted = fitSoundtrack(channels, sampleRate, seconds, this.soundtrack.loop, this.soundtrack.volume);
    const buffer = new AudioBuffer({ length: fitted[0]!.length, numberOfChannels: fitted.length, sampleRate });
    fitted.forEach((data, c) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, c));
    return buffer;
  }

  /** The audible soundtrack as a stream, for realtime recordings. */
  soundtrackStream(): MediaStream | null {
    return this.soundtrack?.audible ? (this.recordDestination?.stream ?? null) : null;
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

  /** OSC arrives through the app from the hub; port is where controllers send. */
  listenOsc(port = DEFAULT_OSC_PORT): void {
    this.osc.port = port;
    this.requestOsc(port);
  }

  /** Called by the app: whether the hub is listening, and any messages. */
  receiveOsc(update: { active?: boolean; messages?: OscMessage[] }): void {
    if (update.active !== undefined) this.osc.active = update.active;
    if (update.messages) applyOscMessages(this.osc, this.oscFrame, update.messages);
  }

  /** Refresh the input values; call once per frame before rendering. */
  update(sceneTime = 0, dt = 1 / 60): void {
    this.osc.messages = this.oscFrame;
    this.oscFrame = [];
    if (this.offline && this.audio.active) {
      const { mono, sampleRate, smoothed } = this.offline;
      const position = this.soundtrack ? soundtrackPosition(sceneTime, mono.length / sampleRate, this.soundtrack.loop) : null;
      // The analyser smooths once per call at ~60 fps; match that per frame at the recording's rate.
      const smoothing = SMOOTHING ** Math.max(0, Math.min(4, dt * 60));
      analyseAt(mono, sampleRate, position ?? Number.POSITIVE_INFINITY, smoothing, smoothed, this.freq, this.wave);
    } else if (this.analyser && this.audio.active) {
      this.analyser.getFloatFrequencyData(this.freq);
      this.analyser.getFloatTimeDomainData(this.wave);
    } else return;
    const spectrum = this.audio.spectrum;
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const db = (this.freq[i * 2]! + this.freq[i * 2 + 1]!) / 2;
      spectrum[i] = Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
    }
    const step = this.wave.length / WAVEFORM_SAMPLES;
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) this.audio.waveform[i] = this.wave[Math.floor(i * step)]!;
    updateBands(this.audio, (this.offline?.sampleRate ?? this.context?.sampleRate ?? 44100) / 2);
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
