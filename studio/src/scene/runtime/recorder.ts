// Recording the scene canvas (M3). Offline: frames are rendered one at a time
// at exact timestamps and encoded with WebCodecs (through mediabunny), so the
// result doesn't depend on how fast this machine is. Realtime: MediaRecorder
// on the live canvas, for capturing interaction.
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_VERY_HIGH, WebMOutputFormat, canEncodeAudio, canEncodeVideo } from "mediabunny";
import type { RecordOptions, RecordResult } from "../protocol";
import { storedZip } from "./zip";

const QUALITY = { low: QUALITY_LOW, medium: QUALITY_MEDIUM, high: QUALITY_HIGH, "very-high": QUALITY_VERY_HIGH };

export interface OfflineHooks {
  canvas: HTMLCanvasElement;
  /** The soundtrack from time 0, cut to the recording's length (null: a silent video). */
  audio?: AudioBuffer | null;
  /** Render the scene at this time; must draw synchronously. */
  renderAt(time: number, dt: number, frame: number): void;
  onProgress(frame: number, total: number): void;
  signal: AbortSignal;
}

export async function recordOffline(options: RecordOptions, hooks: OfflineHooks): Promise<RecordResult> {
  const { canvas } = hooks;
  const total = Math.max(1, Math.round(options.duration * options.fps));
  const dt = 1 / options.fps;
  const aborted = () => {
    if (hooks.signal.aborted) throw new Error("recording cancelled");
  };

  if (options.format === "png") {
    const files: Array<{ name: string; data: Uint8Array }> = [];
    for (let f = 0; f < total; f++) {
      aborted();
      hooks.renderAt(f * dt, dt, f);
      // The bitmap is taken in the same task as the draw (no preserveDrawingBuffer needed).
      const bitmap = await createImageBitmap(canvas);
      const out = new OffscreenCanvas(bitmap.width, bitmap.height);
      out.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      files.push({ name: `frame_${String(f + 1).padStart(5, "0")}.png`, data: new Uint8Array(await (await out.convertToBlob({ type: "image/png" })).arrayBuffer()) });
      hooks.onProgress(f + 1, total);
    }
    return { file: storedZip(files), extension: "zip", width: canvas.width, height: canvas.height, frames: total };
  }

  const codec = await pickCodec(options.format, canvas.width, canvas.height);
  const output = new Output({
    format: options.format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY[options.quality], keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: options.fps });
  const audioCodec = hooks.audio ? await pickAudioCodec(options.format, hooks.audio) : null;
  const audioSource = audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();
  try {
    for (let f = 0; f < total; f++) {
      aborted();
      hooks.renderAt(f * dt, dt, f);
      // add() captures the canvas right away, then waits for encoder backpressure.
      await source.add(f * dt, dt);
      hooks.onProgress(f + 1, total);
    }
    if (audioSource && hooks.audio) await audioSource.add(hooks.audio);
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => undefined);
    throw err;
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("the encoder produced no data");
  return {
    file: new Blob([buffer], { type: options.format === "mp4" ? "video/mp4" : "video/webm" }),
    extension: options.format,
    width: canvas.width,
    height: canvas.height,
    frames: total,
    audio: Boolean(audioSource),
  };
}

/** AAC in MP4 where the system can encode it, else Opus (which both containers carry). Null: record without sound. */
async function pickAudioCodec(format: "mp4" | "webm", audio: AudioBuffer) {
  const options = { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate };
  const candidates = format === "mp4" ? (["aac", "opus"] as const) : (["opus"] as const);
  for (const codec of candidates) if (await canEncodeAudio(codec, options)) return codec;
  return null;
}

async function pickCodec(format: "mp4" | "webm", width: number, height: number) {
  const candidates = format === "mp4" ? (["avc", "hevc"] as const) : (["vp9", "vp8"] as const);
  for (const codec of candidates) if (await canEncodeVideo(codec, { width, height })) return codec;
  throw new Error(
    format === "mp4"
      ? `This system can't encode MP4 (H.264/HEVC) at ${width}x${height}. Try WebM, or a smaller size.`
      : `This system can't encode WebM (VP9/VP8) at ${width}x${height}. Try a smaller size.`,
  );
}

/** Realtime WebM of the live canvas, for `duration` seconds (or until cancelled, keeping what was recorded). */
export function recordRealtime(
  options: RecordOptions,
  canvas: HTMLCanvasElement,
  soundtrack: MediaStream | null,
  signal: AbortSignal,
  onProgress: (frame: number, total: number) => void,
): Promise<RecordResult> {
  const audioTracks = soundtrack?.getAudioTracks() ?? [];
  const types = audioTracks.length ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"] : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) return Promise.reject(new Error("This system can't record WebM in real time."));
  // The canvas, plus what the scene plays out loud.
  const stream = new MediaStream([...canvas.captureStream(options.fps).getVideoTracks(), ...audioTracks.map((t) => t.clone())]);
  const bits = { low: 2e6, medium: 5e6, high: 10e6, "very-high": 20e6 }[options.quality];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bits });
  const chunks: Blob[] = [];
  const total = Math.round(options.duration * options.fps);
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = setInterval(() => onProgress(Math.min(total, Math.round(((performance.now() - started) / 1000) * options.fps)), total), 250);
    const stop = () => recorder.state !== "inactive" && recorder.stop();
    const timer = setTimeout(stop, options.duration * 1000);
    signal.addEventListener("abort", stop);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    recorder.onstop = () => {
      clearInterval(tick);
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      const seconds = (performance.now() - started) / 1000;
      resolve({ file: new Blob(chunks, { type: "video/webm" }), extension: "webm", width: canvas.width, height: canvas.height, frames: Math.round(seconds * options.fps), audio: audioTracks.length > 0 });
    };
    recorder.start(1000);
  });
}
