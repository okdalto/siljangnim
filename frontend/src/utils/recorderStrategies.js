import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import { Zip, ZipPassThrough } from "fflate";

/**
 * Each strategy receives a context object and initiates recording.
 * Context shape:
 *   engine, canvas, fps, duration, bitrate, alpha,
 *   setRecording, setElapsedTime, setProgress, setCompletionInfo,
 *   downloadBlob, discardRef,
 *   rafRef, finalizeRef, offlineAbortRef, alphaRef, filenameRef,
 *   restoreEngine,
 *   // MediaRecorder paths only:
 *   recorderRef, chunksRef, mimeType, videoBitsPerSecond,
 *   // Realtime paths only:
 *   startTimeRef, restoreOnRealtimeStop, stopRecording, updateElapsed, autoStopRef,
 *   // Audio:
 *   hasAudio, audioStream, audioBuffer,
 */

// ---- AVC level helper ----

function avcCodecForResolution(w, h) {
  const pixels = w * h;
  // High profile — best macOS/QuickTime compatibility
  if (pixels <= 921600)  return "avc1.64001f"; // High L3.1 — up to ~1280x720
  if (pixels <= 2088960) return "avc1.640028"; // High L4.0 — up to ~1920x1088
  return "avc1.640033";                        // High L5.1 — 4K+
}

function getSafeVideoBitrate(codec, width, height, fps, requestedBitrate) {
  const requested = Math.max(2_000_000, Math.round(Number(requestedBitrate) || 0));
  const pixels = Math.max(1, width * height);
  const frameRate = Math.max(1, Math.round(Number(fps) || 30));
  const bitsPerPixelFrame = codec === "avc" ? 0.08 : 0.06;
  const hardCap = codec === "avc" ? 32_000_000 : 24_000_000;
  const dynamicCap = Math.max(4_000_000, Math.round(pixels * frameRate * bitsPerPixelFrame));
  return Math.min(requested, dynamicCap, hardCap);
}

// ---- Offline scheduling helpers ----
// setTimeout(0) instead of rAF avoids 60fps cap and background-tab throttling.

function scheduleNextFrame(callback, rafRef) {
  rafRef.current = setTimeout(callback, 0);
}

function cancelScheduledFrame(rafRef) {
  if (rafRef.current != null) {
    clearTimeout(rafRef.current);
    rafRef.current = null;
  }
}

// ---- Common finalize cleanup ----
// Shared tail called at the end of every strategy's finalize/onstop path.
function finalizeCleanup({ setProgress, setRecording, engine, restoreEngine }) {
  setProgress(null);
  setRecording(false);
  engine.disposeOfflineVideos();
  restoreEngine();
}

// ---- Audio helpers ----

async function renderOfflineAudio(audioBuffer, endTime) {
  const { sampleRate, numberOfChannels } = audioBuffer;
  const totalSamples = Math.ceil(sampleRate * endTime);
  const offlineCtx = new OfflineAudioContext(numberOfChannels, totalSamples, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(offlineCtx.destination);
  source.start(0);
  return offlineCtx.startRendering();
}

async function decodeRecordedAudioBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioCtx.close().catch(() => {});
  }
}

async function bounceOfflineAudioStream(engine, audioStream, endTime) {
  const audioTrack = audioStream?.getAudioTracks?.()[0];
  if (!audioTrack) return null;
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not available for procedural audio bounce.");
  }

  const mimeType = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
  ].find((type) => MediaRecorder.isTypeSupported(type)) || "";

  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new MediaStream([audioTrack]);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const cleanup = () => {
      clearTimeout(stopTimer);
      clearTimeout(safetyTimer);
    };
    const resetEngine = () => {
      try {
        engine.setPaused(true);
        engine.seekTo(0);
      } catch { /* ignore */ }
    };

    let stopTimer = null;
    let safetyTimer = null;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      cleanup();
      resetEngine();
      reject(event.error || new Error("Procedural audio bounce failed."));
    };
    recorder.onstop = async () => {
      cleanup();
      resetEngine();
      try {
        if (!chunks.length) {
          resolve(null);
          return;
        }
        const blob = new Blob(chunks, { type: mimeType || chunks[0].type || "audio/webm" });
        const decoded = await decodeRecordedAudioBlob(blob);
        resolve(decoded);
      } catch (err) {
        reject(err);
      }
    };

    try {
      engine.seekTo(0);
      engine.setPaused(false);
      recorder.start(200);
      const durationMs = Math.max(50, Math.ceil(endTime * 1000));
      stopTimer = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, durationMs + 50);
      safetyTimer = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, durationMs + 3000);
    } catch (err) {
      cleanup();
      resetEngine();
      reject(err);
    }
  });
}

async function encodeOfflineAudio(renderedBuffer, audioEncoder) {
  const { sampleRate, numberOfChannels } = renderedBuffer;
  const CHUNK_FRAMES = Math.round(sampleRate * 0.02); // 20ms at any sample rate
  const totalFrames = renderedBuffer.length;

  // Extract channel data
  const channels = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    channels.push(renderedBuffer.getChannelData(ch));
  }

  for (let offset = 0; offset < totalFrames; offset += CHUNK_FRAMES) {
    const frames = Math.min(CHUNK_FRAMES, totalFrames - offset);
    const planarData = new Float32Array(frames * numberOfChannels);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      planarData.set(channels[ch].subarray(offset, offset + frames), ch * frames);
    }

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: planarData,
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }
}

// ---- Progress helper ----

function computeProgress(currentTime, endTime, renderStartTime, fps) {
  const percent = Math.min(100, (currentTime / endTime) * 100);
  const elapsed = (performance.now() - renderStartTime) / 1000;
  const eta = percent > 0 ? (elapsed / percent) * (100 - percent) : 0;
  const currentFrame = Math.round(currentTime * fps);
  const totalFrames = Math.round(endTime * fps);
  return { percent, eta, currentFrame, totalFrames };
}

function getSafeAudioBufferInfo(audioBuffer) {
  if (!audioBuffer) return null;
  const sampleRate = Math.round(Number(audioBuffer.sampleRate) || 0);
  const numberOfChannels = Math.round(Number(audioBuffer.numberOfChannels) || 0);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) return null;
  if (!Number.isFinite(numberOfChannels) || numberOfChannels < 1 || numberOfChannels > 32) return null;
  return { sampleRate, numberOfChannels };
}

function getSafeTrackAudioInfo(audioTrack) {
  if (!audioTrack) return null;
  const settings = audioTrack.getSettings?.() || {};
  const sampleRate = Math.round(Number(settings.sampleRate) || 48000);
  const numberOfChannels = Math.round(Number(settings.channelCount) || 0);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) return null;
  if (!Number.isFinite(numberOfChannels) || numberOfChannels < 1 || numberOfChannels > 32) return null;
  return { sampleRate, numberOfChannels };
}

export async function startOfflinePng(ctx) {
  const {
    engine, canvas, fps, duration, alpha,
    setRecording, setElapsedTime, setProgress, setCompletionInfo,
    downloadBlob, discardRef,
    rafRef, finalizeRef, offlineAbortRef, alphaRef, filenameRef,
    restoreEngine,
  } = ctx;

  engine.setPaused(true);
  engine.seekTo(0);
  await engine.prepareOfflineVideos();

  if (alpha) {
    alphaRef.current = true;
    engine.recreateContext({ alpha: true });
  }

  const dt = 1 / fps;
  const endTime =
    duration && duration > 0
      ? duration
      : engine._duration > 0
        ? engine._duration
        : 30;
  let currentTime = 0;
  let frameIndex = 0;

  // Streaming ZIP — frames are pushed immediately and can be GC'd
  const zipChunks = [];
  const zip = new Zip((err, data, _final) => {
    if (!err) zipChunks.push(data);
  });

  const renderStartTime = performance.now();
  setElapsedTime(0);
  setRecording(true);

  let finalized = false;

  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    finalizeRef.current = null;
    cancelScheduledFrame(rafRef);
    const timeTaken = ((performance.now() - renderStartTime) / 1000).toFixed(1);
    try {
      zip.end();
      let totalLen = 0;
      for (const c of zipChunks) totalLen += c.length;
      const merged = new Uint8Array(totalLen);
      let off = 0;
      for (const c of zipChunks) { merged.set(c, off); off += c.length; }
      const blob = new Blob([merged], { type: "application/zip" });
      if (!discardRef.current) {
        downloadBlob(blob, filenameRef.current || `png_sequence_${Date.now()}.zip`);
      }
      setCompletionInfo({ success: true, fileSize: blob.size, timeTaken });
    } catch (e) {
      console.error("PNG sequence ZIP error:", e);
      setCompletionInfo({ success: false, error: e.message, timeTaken });
    }
    finalizeCleanup({ setProgress, setRecording, engine, restoreEngine });
  };

  finalizeRef.current = finalize;

  const stepFrame = async () => {
    if (offlineAbortRef.current) {
      await finalize();
      return;
    }

    if (currentTime >= endTime) {
      await finalize();
      return;
    }

    await engine.renderOfflineFrame(currentTime, dt);
    const gl = engine.gl;
    if (gl) gl.finish();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) {
      console.error("canvas.toBlob() returned null, skipping frame", frameIndex);
    } else {
      const arrayBuf = await blob.arrayBuffer();
      const padded = String(frameIndex).padStart(6, "0");
      const entry = new ZipPassThrough(`frame_${padded}.png`);
      zip.add(entry);
      entry.push(new Uint8Array(arrayBuf), true);
    }

    frameIndex++;
    currentTime += dt;
    setElapsedTime(currentTime);
    setProgress(computeProgress(currentTime, endTime, renderStartTime, fps));

    scheduleNextFrame(stepFrame, rafRef);
  };

  scheduleNextFrame(stepFrame, rafRef);
}

export async function startOfflineWebCodecs(ctx) {
  const {
    engine, canvas, fps, duration, format, alpha, videoBitsPerSecond,
    hasAudio, audioStream, audioBuffer,
    setRecording, setElapsedTime, setProgress, setCompletionInfo,
    downloadBlob, discardRef,
    rafRef, finalizeRef, offlineAbortRef, alphaRef,
    restoreEngine,
  } = ctx;

  const isWebm = format === "webm";
  const configs = format === "mp4"
    ? {
        MuxerClass: Mp4Muxer, TargetClass: Mp4Target,
        muxerVideoCodec: "avc", encoderCodec: avcCodecForResolution(canvas.width, canvas.height),
        blobType: "video/mp4", fileExt: "mp4",
        muxerExtraOpts: { fastStart: "in-memory" },
        audioCodecMuxer: "aac", audioCodecEncoder: "aac",
      }
    : {
        MuxerClass: WebmMuxer, TargetClass: WebmTarget,
        muxerVideoCodec: "V_VP9", encoderCodec: "vp09.00.10.08",
        blobType: "video/webm", fileExt: "webm",
        muxerExtraOpts: {},
        audioCodecMuxer: "A_OPUS", audioCodecEncoder: "opus",
      };

  const { MuxerClass, TargetClass, muxerVideoCodec, encoderCodec, blobType, fileExt, muxerExtraOpts, audioCodecMuxer, audioCodecEncoder } = configs;
  const safeVideoBitrate = getSafeVideoBitrate(
    muxerVideoCodec === "avc" ? "avc" : "vp9",
    canvas.width,
    canvas.height,
    fps,
    videoBitsPerSecond,
  );

  const dt = 1 / fps;
  const endTime =
    duration && duration > 0
      ? duration
      : engine._duration > 0
        ? engine._duration
        : 30;

  let offlineAudioBuffer = audioBuffer;
  if (hasAudio && !offlineAudioBuffer && audioStream) {
    try {
      offlineAudioBuffer = await bounceOfflineAudioStream(engine, audioStream, endTime);
    } catch (err) {
      console.warn("[OfflineRec] Procedural audio bounce failed:", err);
    }
  }

  engine.setPaused(true);
  engine.seekTo(0);
  const videosReady = engine.prepareOfflineVideos();

  // WebM + alpha support (VP9 supports alpha channel)
  if (isWebm && alpha) {
    alphaRef.current = true;
    engine.recreateContext({ alpha: true });
  }

  const target = new TargetClass();
  const muxerOpts = {
    target,
    video: {
      codec: muxerVideoCodec,
      width: canvas.width,
      height: canvas.height,
    },
    ...muxerExtraOpts,
  };

  // Audio track in muxer
  let audioEncoder = null;
  const offlineAudioInfo = getSafeAudioBufferInfo(offlineAudioBuffer);
  const useAudio = hasAudio && offlineAudioInfo && typeof AudioEncoder !== "undefined";
  if (useAudio) {
    muxerOpts.audio = {
      codec: audioCodecMuxer,
      sampleRate: offlineAudioInfo.sampleRate,
      numberOfChannels: offlineAudioInfo.numberOfChannels,
    };
  }

  const muxer = new MuxerClass(muxerOpts);

  // Audio encoder
  if (useAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error("AudioEncoder error:", e),
    });
    audioEncoder.configure({
      codec: audioCodecEncoder,
      sampleRate: offlineAudioInfo.sampleRate,
      numberOfChannels: offlineAudioInfo.numberOfChannels,
      bitrate: 128000,
    });
  }

  let hasVideoChunks = false;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      hasVideoChunks = true;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => console.error("VideoEncoder error:", e),
  });
  encoder.configure({
    codec: encoderCodec,
    width: canvas.width,
    height: canvas.height,
    bitrate: safeVideoBitrate,
    framerate: fps,
    ...(isWebm && alpha ? { alpha: "keep" } : {}),
  });

  let currentTime = 0;
  let frameCount = 0;

  const renderStartTime = performance.now();
  setElapsedTime(0);
  setRecording(true);

  const BATCH = 6;
  const MAX_QUEUE = 10;
  let finalized = false;

  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    finalizeRef.current = null;
    cancelScheduledFrame(rafRef);
    const timeTaken = ((performance.now() - renderStartTime) / 1000).toFixed(1);
    try {
      if (audioEncoder?.state === "configured") await audioEncoder.flush();
      if (encoder.state === "configured") await encoder.flush();
      if (!hasVideoChunks) {
        console.warn("No video frames were encoded – skipping file output");
        setCompletionInfo({ success: false, error: "No video frames produced", timeTaken });
      } else {
        muxer.finalize();
        const blob = new Blob([target.buffer], { type: blobType });
        if (!discardRef.current) {
          downloadBlob(blob, `recording_${Date.now()}.${fileExt}`);
        }
        setCompletionInfo({ success: true, fileSize: blob.size, timeTaken });
      }
    } catch (e) {
      console.error("Offline recording finalize error:", e);
      setCompletionInfo({ success: false, error: e.message, timeTaken });
    }
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    finalizeCleanup({ setProgress, setRecording, engine, restoreEngine });
  };

  finalizeRef.current = finalize;

  encoder.addEventListener("error", () => {
    console.error("VideoEncoder fatal error – aborting recording");
    finalized = true;
    finalizeRef.current = null;
    cancelScheduledFrame(rafRef);
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    setCompletionInfo({ success: false, error: "VideoEncoder fatal error", timeTaken: ((performance.now() - renderStartTime) / 1000).toFixed(1) });
    finalizeCleanup({ setProgress, setRecording, engine, restoreEngine });
  });

  // Kick off audio rendering + encoding before video frames
  const audioReady = useAudio
    ? renderOfflineAudio(offlineAudioBuffer, endTime).then((rendered) =>
        encodeOfflineAudio(rendered, audioEncoder)
      )
    : Promise.resolve();

  // Timeout wrapper — prevent hanging if video prep or audio render stalls
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);

  // Start video frames once audio is queued and videos are prepared
  Promise.all([
    withTimeout(audioReady, 30000, "audioReady"),
    withTimeout(videosReady, 30000, "videosReady"),
  ]).then(() => {
    scheduleNextFrame(stepFrame, rafRef);
  }).catch((e) => {
    console.warn("[OfflineRec] setup issue (continuing anyway):", e);
    scheduleNextFrame(stepFrame, rafRef);
  });

  const stepFrame = async () => {
    try {
      if (finalized) return;
      if (offlineAbortRef.current) {
        finalize();
        return;
      }

      if (encoder.state !== "configured") {
        console.error("[OfflineRec] encoder not configured, state:", encoder.state);
        finalize();
        return;
      }

      if (encoder.encodeQueueSize >= MAX_QUEUE) {
        encoder.addEventListener(
          "dequeue",
          () => {
            scheduleNextFrame(stepFrame, rafRef);
          },
          { once: true },
        );
        return;
      }

      for (let i = 0; i < BATCH; i++) {
        if (currentTime >= endTime) {
          finalize();
          return;
        }
        if (encoder.encodeQueueSize >= MAX_QUEUE) break;

        await Promise.race([
          engine.renderOfflineFrame(currentTime, dt),
          new Promise((resolve) => setTimeout(resolve, 6000)),
        ]);
        const gl = engine.gl;
        if (gl) gl.finish();

        const frame = new VideoFrame(canvas, {
          timestamp: Math.round(currentTime * 1_000_000),
          ...(isWebm && alpha ? { alpha: "keep" } : {}),
        });
        const keyFrame = frameCount % (fps * 2) === 0;
        encoder.encode(frame, { keyFrame });
        frame.close();
        frameCount++;
        currentTime += dt;
      }

      setElapsedTime(currentTime);
      setProgress(computeProgress(currentTime, endTime, renderStartTime, fps));
      scheduleNextFrame(stepFrame, rafRef);
    } catch (e) {
      console.error("[OfflineRec] stepFrame error:", e);
      finalize();
    }
  };
}

export async function startOfflineFallback(ctx) {
  const {
    engine, canvas, fps, duration,
    setRecording, setElapsedTime, setProgress, setCompletionInfo,
    downloadBlob, discardRef,
    rafRef, recorderRef, chunksRef, offlineAbortRef,
    mimeType, videoBitsPerSecond,
    restoreEngine, stopRecording,
  } = ctx;

  engine.setPaused(true);
  engine.seekTo(0);
  await engine.prepareOfflineVideos();

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];

  const dt = 1 / fps;
  const endTime =
    duration && duration > 0
      ? duration
      : engine._duration > 0
        ? engine._duration
        : 30;

  const renderStartTime = performance.now();

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunksRef.current.push(e.data);
  };
  recorder.onstop = () => {
    const timeTaken = ((performance.now() - renderStartTime) / 1000).toFixed(1);
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (!discardRef.current) {
      downloadBlob(blob);
    }
    setCompletionInfo({ success: true, fileSize: blob.size, timeTaken });
    finalizeCleanup({ setProgress, setRecording, engine, restoreEngine });
  };
  recorder.start(100);
  recorderRef.current = recorder;

  let currentTime = 0;

  setElapsedTime(0);
  setRecording(true);

  const stepFrame = async () => {
    if (offlineAbortRef.current) {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      return;
    }

    if (!recorderRef.current || recorderRef.current.state === "inactive")
      return;

    if (currentTime >= endTime) {
      stopRecording();
      return;
    }

    await engine.renderOfflineFrame(currentTime, dt);
    if (track.requestFrame) track.requestFrame();

    currentTime += dt;
    setElapsedTime(currentTime);
    setProgress(computeProgress(currentTime, endTime, renderStartTime, fps));

    scheduleNextFrame(stepFrame, rafRef);
  };

  scheduleNextFrame(stepFrame, rafRef);
}

export function startRealtimeMp4(ctx) {
  const {
    canvas, fps, duration, videoBitsPerSecond,
    hasAudio, audioStream,
    setRecording, setElapsedTime, setCompletionInfo, downloadBlob,
    rafRef, finalizeRef, startTimeRef, autoStopRef,
    restoreOnRealtimeStop,
  } = ctx;

  const target = new Mp4Target();
  const muxerOpts = {
    target,
    video: {
      codec: "avc",
      width: canvas.width,
      height: canvas.height,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  };

  // Audio setup
  let audioEncoder = null;
  let audioReader = null;
  let audioChunksEncoded = 0;
  let audioChunksSkipped = 0;
  let audioDisabledReason = null;
  const safeVideoBitrate = getSafeVideoBitrate("avc", canvas.width, canvas.height, fps, videoBitsPerSecond);
  if (hasAudio && audioStream) {
    const audioTrack = audioStream.getAudioTracks()[0];
    const audioInfo = getSafeTrackAudioInfo(audioTrack);
    if (audioInfo) {
      muxerOpts.audio = {
        codec: "aac",
        sampleRate: audioInfo.sampleRate,
        numberOfChannels: audioInfo.numberOfChannels,
      };
    }
  }

  const muxer = new Mp4Muxer(muxerOpts);

  if (hasAudio && audioStream && muxerOpts.audio) {
    const audioTrack = audioStream.getAudioTracks()[0];
    const audioInfo = getSafeTrackAudioInfo(audioTrack);

    if (audioInfo) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          audioDisabledReason = e?.message || "Audio encoding failed";
          console.error("AudioEncoder error:", e);
        },
      });
      audioEncoder.configure({
        codec: "aac",
        sampleRate: audioInfo.sampleRate,
        numberOfChannels: audioInfo.numberOfChannels,
        bitrate: 128000,
      });

      // Read audio frames via MediaStreamTrackProcessor
      if (typeof MediaStreamTrackProcessor !== "undefined") {
        const processor = new MediaStreamTrackProcessor({ track: audioTrack });
        audioReader = processor.readable.getReader();
        (async () => {
          try {
            while (true) {
              const { value, done } = await audioReader.read();
              if (done) break;
              const frameChannels = Math.round(Number(value?.numberOfChannels) || 0);
              const frameCount = Math.round(Number(value?.numberOfFrames) || 0);
              const frameRate = Math.round(Number(value?.sampleRate) || 0);
              if (frameChannels < 1 || frameChannels > 32 || frameCount < 1 || frameRate < 8000) {
                audioChunksSkipped += 1;
                if (!audioDisabledReason) {
                  audioDisabledReason = "Live audio frames reported invalid metadata for MP4 capture.";
                  console.warn("[RealtimeRec] Skipping invalid audio frame for MP4 capture.", {
                    frameChannels,
                    frameCount,
                    frameRate,
                  });
                }
                value.close();
                continue;
              }
              audioEncoder.encode(value);
              audioChunksEncoded += 1;
              value.close();
            }
          } catch (_) {
            // reader cancelled on finalize
          }
        })();
      }
    } else {
      audioDisabledReason = "Live audio track metadata is incomplete for MP4 capture.";
      console.warn("[RealtimeRec] MP4 audio disabled because track settings are incomplete.");
    }
  }

  let hasCodecMeta = false;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig) hasCodecMeta = true;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => console.error("VideoEncoder error:", e),
  });
  encoder.configure({
    codec: avcCodecForResolution(canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
    bitrate: safeVideoBitrate,
    framerate: fps,
  });

  startTimeRef.current = performance.now();
  setElapsedTime(0);
  setRecording(true);

  let finalized = false;
  let frameCount = 0;
  const frameInterval = 1000 / fps;
  let lastFrameTime = 0;

  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    finalizeRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const timeTaken = ((performance.now() - startTimeRef.current) / 1000).toFixed(1);
    try {
      if (audioReader) await audioReader.cancel();
      if (audioEncoder?.state === "configured") await audioEncoder.flush();
      if (encoder.state === "configured") await encoder.flush();
      if (!hasCodecMeta) {
        console.warn("No video frames with codec metadata were produced");
        setCompletionInfo({ success: false, error: "No video frames produced", timeTaken });
      } else {
        muxer.finalize();
        const blob = new Blob([target.buffer], { type: "video/mp4" });
        downloadBlob(blob, `recording_${Date.now()}.mp4`);
        const warning =
          audioDisabledReason ||
          (muxerOpts.audio && audioChunksEncoded === 0
            ? "MP4 audio capture was skipped because the browser produced invalid live audio frames."
            : null);
        if (audioChunksSkipped > 0) {
          console.warn("[RealtimeRec] Some MP4 audio frames were skipped during capture.", {
            audioChunksEncoded,
            audioChunksSkipped,
          });
        }
        setCompletionInfo({ success: true, fileSize: blob.size, timeTaken, warning });
      }
    } catch (e) {
      console.error("Realtime MP4 finalize error:", e);
      setCompletionInfo({ success: false, error: e.message, timeTaken });
    }
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    setRecording(false);
    restoreOnRealtimeStop();
  };

  finalizeRef.current = finalize;

  encoder.addEventListener("error", () => {
    console.error("VideoEncoder fatal error – aborting recording");
    finalized = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    setCompletionInfo({ success: false, error: "VideoEncoder fatal error", timeTaken: ((performance.now() - startTimeRef.current) / 1000).toFixed(1) });
    setRecording(false);
    restoreOnRealtimeStop();
  });

  const captureLoop = () => {
    if (finalized) return;
    if (encoder.state === "closed") return;

    const now = performance.now();
    setElapsedTime((now - startTimeRef.current) / 1000);

    if (now - lastFrameTime >= frameInterval) {
      lastFrameTime = now;
      const timestamp = Math.round((now - startTimeRef.current) * 1000);
      const frame = new VideoFrame(canvas, { timestamp });
      const keyFrame = frameCount % (fps * 2) === 0;
      encoder.encode(frame, { keyFrame });
      frame.close();
      frameCount++;
    }

    rafRef.current = requestAnimationFrame(captureLoop);
  };

  rafRef.current = requestAnimationFrame(captureLoop);

  if (duration && duration > 0) {
    autoStopRef.current = setTimeout(() => {
      finalize();
    }, duration * 1000);
  }
}

export function startRealtimeWebm(ctx) {
  const {
    canvas, fps, duration, hasAudio, audioStream,
    setRecording, setElapsedTime, setCompletionInfo, downloadBlob,
    rafRef, recorderRef, chunksRef, startTimeRef, autoStopRef,
    mimeType, videoBitsPerSecond,
    restoreOnRealtimeStop, stopRecording, updateElapsed,
  } = ctx;

  const videoStream = canvas.captureStream(fps);

  const combinedStream = hasAudio
    ? new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ])
    : videoStream;

  const recorderOptions = {
    mimeType,
    videoBitsPerSecond,
  };
  if (hasAudio) {
    recorderOptions.audioBitsPerSecond = 128000;
  }

  const recorder = new MediaRecorder(combinedStream, recorderOptions);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunksRef.current.push(e.data);
  };
  recorder.onstop = () => {
    setRecording(false);
    const timeTaken = ((performance.now() - startTimeRef.current) / 1000).toFixed(1);
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    downloadBlob(blob);
    setCompletionInfo({ success: true, fileSize: blob.size, timeTaken });
    restoreOnRealtimeStop();
  };
  recorder.start(100);
  recorderRef.current = recorder;

  startTimeRef.current = performance.now();
  setElapsedTime(0);
  setRecording(true);
  rafRef.current = requestAnimationFrame(updateElapsed);

  if (duration && duration > 0) {
    autoStopRef.current = setTimeout(() => {
      stopRecording();
    }, duration * 1000);
  }
}
