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
    hasAudio, audioBuffer,
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

  engine.setPaused(true);
  engine.seekTo(0);
  const videosReady = engine.prepareOfflineVideos();

  // WebM + alpha support (VP9 supports alpha channel)
  if (isWebm && alpha) {
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
  const useAudio = hasAudio && audioBuffer && typeof AudioEncoder !== "undefined"
    && audioBuffer.numberOfChannels > 0;
  if (useAudio) {
    muxerOpts.audio = {
      codec: audioCodecMuxer,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
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
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
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
    bitrate: videoBitsPerSecond,
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
    ? renderOfflineAudio(audioBuffer, endTime).then((rendered) =>
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
  if (hasAudio && audioStream) {
    const audioTrack = audioStream.getAudioTracks()[0];
    const audioSettings = audioTrack.getSettings();
    const sampleRate = audioSettings.sampleRate || 48000;
    const numberOfChannels = audioSettings.channelCount || 0;
    if (numberOfChannels > 0) {
      muxerOpts.audio = { codec: "aac", sampleRate, numberOfChannels };
    }
  }

  const muxer = new Mp4Muxer(muxerOpts);

  if (hasAudio && audioStream && muxerOpts.audio) {
    const audioTrack = audioStream.getAudioTracks()[0];
    const audioSettings = audioTrack.getSettings();
    const sampleRate = audioSettings.sampleRate || 48000;
    const numberOfChannels = audioSettings.channelCount || 0;

    if (numberOfChannels > 0) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("AudioEncoder error:", e),
      });
      audioEncoder.configure({
        codec: "aac",
        sampleRate,
        numberOfChannels,
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
              audioEncoder.encode(value);
              value.close();
            }
          } catch (_) {
            // reader cancelled on finalize
          }
        })();
      }
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
    bitrate: videoBitsPerSecond,
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
        setCompletionInfo({ success: true, fileSize: blob.size, timeTaken });
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
