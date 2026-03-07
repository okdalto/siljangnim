import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import { zipSync } from "fflate";

/**
 * Each strategy receives a context object and initiates recording.
 * Context shape:
 *   engine, canvas, fps, duration, bitrate, alpha,
 *   setRecording, setElapsedTime, downloadBlob,
 *   rafRef, finalizeRef, offlineAbortRef, alphaRef, filenameRef,
 *   restoreEngine,
 *   // MediaRecorder paths only:
 *   recorderRef, chunksRef, mimeType, videoBitsPerSecond,
 *   // Realtime paths only:
 *   startTimeRef, restoreOnRealtimeStop, stopRecording, updateElapsed, autoStopRef,
 *   // Audio:
 *   hasAudio, audioStream, audioBuffer,
 */

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
  const CHUNK_FRAMES = 960; // 20ms @ 48kHz
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

export function startOfflinePng(ctx) {
  const {
    engine, canvas, fps, duration, alpha,
    setRecording, setElapsedTime, downloadBlob,
    rafRef, finalizeRef, offlineAbortRef, alphaRef, filenameRef,
    restoreEngine,
  } = ctx;

  engine.setPaused(true);
  engine.seekTo(0);

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
  const pngBuffers = {};

  setElapsedTime(0);
  setRecording(true);

  let finalized = false;

  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    finalizeRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      const zipped = zipSync(pngBuffers, { level: 0 });
      const blob = new Blob([zipped], { type: "application/zip" });
      downloadBlob(blob, filenameRef.current || `png_sequence_${Date.now()}.zip`);
    } catch (e) {
      console.error("PNG sequence ZIP error:", e);
    }
    setRecording(false);
    restoreEngine();
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

    engine.renderOfflineFrame(currentTime, dt);
    const gl = engine.gl;
    if (gl) gl.finish();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    const arrayBuf = await blob.arrayBuffer();
    const padded = String(frameIndex).padStart(6, "0");
    pngBuffers[`frame_${padded}.png`] = new Uint8Array(arrayBuf);

    frameIndex++;
    currentTime += dt;
    setElapsedTime(currentTime);

    rafRef.current = requestAnimationFrame(stepFrame);
  };

  rafRef.current = requestAnimationFrame(stepFrame);
}

export function startOfflineWebCodecs(ctx) {
  const {
    engine, canvas, fps, duration, format, videoBitsPerSecond,
    hasAudio, audioBuffer,
    setRecording, setElapsedTime, downloadBlob,
    rafRef, finalizeRef, offlineAbortRef,
    restoreEngine,
  } = ctx;

  const configs = format === "mp4"
    ? {
        MuxerClass: Mp4Muxer, TargetClass: Mp4Target,
        muxerVideoCodec: "avc", encoderCodec: "avc1.42001f",
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
  const useAudio = hasAudio && audioBuffer && typeof AudioEncoder !== "undefined";
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

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("VideoEncoder error:", e),
  });
  encoder.configure({
    codec: encoderCodec,
    width: canvas.width,
    height: canvas.height,
    bitrate: videoBitsPerSecond,
    framerate: fps,
  });

  let currentTime = 0;
  let frameCount = 0;

  setElapsedTime(0);
  setRecording(true);

  const BATCH = 6;
  const MAX_QUEUE = 10;
  let finalized = false;

  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    finalizeRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      if (audioEncoder?.state === "configured") await audioEncoder.flush();
      if (encoder.state === "configured") await encoder.flush();
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: blobType });
      downloadBlob(blob, `recording_${Date.now()}.${fileExt}`);
    } catch (e) {
      console.error("Offline recording finalize error:", e);
    }
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    setRecording(false);
    restoreEngine();
  };

  finalizeRef.current = finalize;

  encoder.addEventListener("error", () => {
    console.error("VideoEncoder fatal error – aborting recording");
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    setRecording(false);
    restoreEngine();
  });

  // Kick off audio rendering + encoding before video frames
  const audioReady = useAudio
    ? renderOfflineAudio(audioBuffer, endTime).then((rendered) =>
        encodeOfflineAudio(rendered, audioEncoder)
      )
    : Promise.resolve();

  // Start video frames once audio is queued
  audioReady.then(() => {
    rafRef.current = requestAnimationFrame(stepFrame);
  });

  const stepFrame = () => {
    if (offlineAbortRef.current) {
      finalize();
      return;
    }

    if (encoder.encodeQueueSize >= MAX_QUEUE) {
      encoder.addEventListener(
        "dequeue",
        () => {
          rafRef.current = requestAnimationFrame(stepFrame);
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

      engine.renderOfflineFrame(currentTime, dt);
      const gl = engine.gl;
      if (gl) gl.finish();

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(currentTime * 1_000_000),
      });
      const keyFrame = frameCount % (fps * 2) === 0;
      encoder.encode(frame, { keyFrame });
      frame.close();

      frameCount++;
      currentTime += dt;
    }

    setElapsedTime(currentTime);
    rafRef.current = requestAnimationFrame(stepFrame);
  };
}

export function startOfflineFallback(ctx) {
  const {
    engine, canvas, fps, duration,
    setRecording, setElapsedTime, downloadBlob,
    rafRef, recorderRef, chunksRef,
    mimeType, videoBitsPerSecond,
    restoreEngine, stopRecording,
  } = ctx;

  engine.setPaused(true);
  engine.seekTo(0);

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunksRef.current.push(e.data);
  };
  recorder.onstop = () => {
    setRecording(false);
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    downloadBlob(blob);
    restoreEngine();
  };
  recorder.start(100);
  recorderRef.current = recorder;

  const dt = 1 / fps;
  const endTime =
    duration && duration > 0
      ? duration
      : engine._duration > 0
        ? engine._duration
        : 30;
  let currentTime = 0;

  setElapsedTime(0);
  setRecording(true);

  const stepFrame = () => {
    if (!recorderRef.current || recorderRef.current.state === "inactive")
      return;

    if (currentTime >= endTime) {
      stopRecording();
      return;
    }

    engine.renderOfflineFrame(currentTime, dt);
    if (track.requestFrame) track.requestFrame();

    currentTime += dt;
    setElapsedTime(currentTime);

    rafRef.current = requestAnimationFrame(stepFrame);
  };

  rafRef.current = requestAnimationFrame(stepFrame);
}

export function startRealtimeMp4(ctx) {
  const {
    canvas, fps, duration, videoBitsPerSecond,
    hasAudio, audioStream,
    setRecording, setElapsedTime, downloadBlob,
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
    const numberOfChannels = audioSettings.channelCount || 2;
    if (numberOfChannels >= 1) {
      muxerOpts.audio = { codec: "aac", sampleRate, numberOfChannels };
    }
  }

  const muxer = new Mp4Muxer(muxerOpts);

  if (hasAudio && audioStream && muxerOpts.audio) {
    const audioTrack = audioStream.getAudioTracks()[0];
    const audioSettings = audioTrack.getSettings();
    const sampleRate = audioSettings.sampleRate || 48000;
    const numberOfChannels = audioSettings.channelCount || 2;

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

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("VideoEncoder error:", e),
  });
  encoder.configure({
    codec: "avc1.42001f",
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
    try {
      if (audioReader) await audioReader.cancel();
      if (audioEncoder?.state === "configured") await audioEncoder.flush();
      if (encoder.state === "configured") await encoder.flush();
      if (frameCount === 0) {
        console.warn("No frames were recorded");
      } else {
        muxer.finalize();
        const blob = new Blob([target.buffer], { type: "video/mp4" });
        downloadBlob(blob, `recording_${Date.now()}.mp4`);
      }
    } catch (e) {
      console.error("Realtime MP4 finalize error:", e);
    }
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    setRecording(false);
    restoreOnRealtimeStop();
  };

  finalizeRef.current = finalize;

  encoder.addEventListener("error", () => {
    console.error("VideoEncoder fatal error – aborting recording");
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    if (encoder.state !== "closed") encoder.close();
    setRecording(false);
    restoreOnRealtimeStop();
  });

  const captureLoop = () => {
    if (finalized) return;

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
    setRecording, setElapsedTime, downloadBlob,
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
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    downloadBlob(blob);
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
