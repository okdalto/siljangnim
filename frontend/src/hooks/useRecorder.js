import { useState, useRef, useCallback } from "react";
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import { zipSync } from "fflate";

/**
 * Hook for recording WebGL canvas.
 *
 * Paths:
 * - PNG + offline: frame-by-frame → ZIP (fflate)
 * - MP4 + offline: WebCodecs H.264 + mp4-muxer → MP4
 * - WebM + offline: WebCodecs VP9 + webm-muxer → WebM
 * - MP4 + realtime: WebCodecs H.264 + mp4-muxer (live capture) → MP4
 * - WebM + realtime: captureStream → MediaRecorder → WebM
 *
 * Falls back to MediaRecorder when WebCodecs is unavailable.
 */
export default function useRecorder(engineRef) {
  const [recording, setRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(0);
  const rafRef = useRef(null);
  const autoStopRef = useRef(null);
  const filenameRef = useRef(null);
  const offlineRef = useRef(false);
  const offlineAbortRef = useRef(false);
  const finalizeRef = useRef(null);
  const savedSizeRef = useRef(null);
  const alphaRef = useRef(false);

  const updateElapsed = useCallback(() => {
    setElapsedTime((performance.now() - startTimeRef.current) / 1000);
    rafRef.current = requestAnimationFrame(updateElapsed);
  }, []);

  /** Shared: download blob as file */
  const downloadBlob = useCallback((blob, defaultName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameRef.current || defaultName || `recording_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /** Restore engine state after offline recording */
  const restoreEngine = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
      // Restore alpha:false context if we switched to alpha
      if (alphaRef.current) {
        eng.recreateContext({ alpha: false });
        alphaRef.current = false;
      }
      // Restore canvas size if overridden
      if (savedSizeRef.current) {
        eng.resize(savedSizeRef.current.width, savedSizeRef.current.height);
        savedSizeRef.current = null;
      }
      eng.seekTo(0);
      eng.setPaused(false);
    }
    offlineRef.current = false;
  }, [engineRef]);

  const stopRecording = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    offlineAbortRef.current = true;
    // For WebCodecs offline: directly trigger finalize
    if (finalizeRef.current) {
      finalizeRef.current();
      return;
    }
    // For MediaRecorder (realtime or fallback): stop triggers onstop callback
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(
    ({ fps = 30, duration, filename, offline = false, format = "mp4", bitrate, resolution, alpha = false } = {}) => {
      const engine = engineRef.current;
      const canvas = engine?.canvas;
      if (!canvas) return;

      offlineRef.current = offline;
      offlineAbortRef.current = false;
      chunksRef.current = [];
      filenameRef.current = filename || null;
      savedSizeRef.current = null;

      // ── Resolution override ─────────────────────────
      if (resolution && (resolution.width !== canvas.width || resolution.height !== canvas.height)) {
        savedSizeRef.current = { width: canvas.width, height: canvas.height };
        engine.resize(resolution.width, resolution.height);
      }

      // ── Audio stream (realtime only) ──────────────────
      const audioStream =
        !offline && engine._audioManager
          ? engine._audioManager.getAudioStream()
          : null;
      const hasAudio =
        audioStream && audioStream.getAudioTracks().length > 0;

      // ── Codec selection (for MediaRecorder paths) ─────
      const codecCandidates = hasAudio
        ? [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp9",
            "video/webm",
          ]
        : ["video/webm;codecs=vp9", "video/webm"];
      const mimeType =
        codecCandidates.find((c) => MediaRecorder.isTypeSupported(c)) ||
        "video/webm";

      // ── Bitrate ─────────────────────────────────────
      const pixels = canvas.width * canvas.height;
      const videoBitsPerSecond = bitrate || pixels * 12;

      // ── Helper: restore size on realtime stop ───────
      const restoreOnRealtimeStop = () => {
        if (savedSizeRef.current) {
          const eng = engineRef.current;
          if (eng) eng.resize(savedSizeRef.current.width, savedSizeRef.current.height);
          savedSizeRef.current = null;
        }
      };

      if (offline && format === "png") {
        // ── Offline PNG Sequence: frame-by-frame → ZIP ──────────────
        engine.setPaused(true);
        engine.seekTo(0);

        // Switch to alpha context if requested
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

          // Capture PNG blob from canvas
          const blob = await new Promise((resolve) =>
            engine.canvas.toBlob(resolve, "image/png")
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
      } else if (offline && format === "mp4" && typeof VideoEncoder !== "undefined") {
        // ── Offline MP4: WebCodecs H.264 + mp4-muxer ──────────────
        engine.setPaused(true);
        engine.seekTo(0);

        const target = new Mp4Target();
        const muxer = new Mp4Muxer({
          target,
          video: {
            codec: "avc",
            width: canvas.width,
            height: canvas.height,
          },
          fastStart: "in-memory",
        });

        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => console.error("VideoEncoder error:", e),
        });
        encoder.configure({
          codec: "avc1.4d0032",
          width: canvas.width,
          height: canvas.height,
          bitrate: videoBitsPerSecond,
          framerate: fps,
        });

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
            await encoder.flush();
            muxer.finalize();
            const blob = new Blob([target.buffer], { type: "video/mp4" });
            downloadBlob(blob, `recording_${Date.now()}.mp4`);
          } catch (e) {
            console.error("Offline recording finalize error:", e);
          }
          encoder.close();
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
          encoder.close();
          setRecording(false);
          restoreEngine();
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
            encoder.encode(frame);
            frame.close();

            currentTime += dt;
          }

          setElapsedTime(currentTime);
          rafRef.current = requestAnimationFrame(stepFrame);
        };

        rafRef.current = requestAnimationFrame(stepFrame);
      } else if (offline && format === "webm" && typeof VideoEncoder !== "undefined") {
        // ── Offline WebM: WebCodecs VP9 + webm-muxer ──────────────
        engine.setPaused(true);
        engine.seekTo(0);

        const target = new WebmTarget();
        const muxer = new WebmMuxer({
          target,
          video: {
            codec: "V_VP9",
            width: canvas.width,
            height: canvas.height,
          },
        });

        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => console.error("VideoEncoder error:", e),
        });
        encoder.configure({
          codec: "vp09.00.10.08",
          width: canvas.width,
          height: canvas.height,
          bitrate: videoBitsPerSecond,
          framerate: fps,
        });

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
            await encoder.flush();
            muxer.finalize();
            const blob = new Blob([target.buffer], { type: "video/webm" });
            downloadBlob(blob, `recording_${Date.now()}.webm`);
          } catch (e) {
            console.error("Offline WebM recording finalize error:", e);
          }
          encoder.close();
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
          encoder.close();
          setRecording(false);
          restoreEngine();
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
            encoder.encode(frame);
            frame.close();

            currentTime += dt;
          }

          setElapsedTime(currentTime);
          rafRef.current = requestAnimationFrame(stepFrame);
        };

        rafRef.current = requestAnimationFrame(stepFrame);
      } else if (offline) {
        // ── Offline fallback: MediaRecorder (WebCodecs unavailable) ──
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
      } else if (!offline && format === "mp4" && typeof VideoEncoder !== "undefined") {
        // ── Realtime MP4: WebCodecs H.264 + mp4-muxer (live capture) ──
        const target = new Mp4Target();
        const muxer = new Mp4Muxer({
          target,
          video: {
            codec: "avc",
            width: canvas.width,
            height: canvas.height,
          },
          fastStart: "in-memory",
        });

        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => console.error("VideoEncoder error:", e),
        });
        encoder.configure({
          codec: "avc1.4d0032",
          width: canvas.width,
          height: canvas.height,
          bitrate: videoBitsPerSecond,
          framerate: fps,
        });

        startTimeRef.current = performance.now();
        setElapsedTime(0);
        setRecording(true);

        let finalized = false;
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
            await encoder.flush();
            muxer.finalize();
            const blob = new Blob([target.buffer], { type: "video/mp4" });
            downloadBlob(blob, `recording_${Date.now()}.mp4`);
          } catch (e) {
            console.error("Realtime MP4 finalize error:", e);
          }
          encoder.close();
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
          encoder.close();
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
            encoder.encode(frame);
            frame.close();
          }

          rafRef.current = requestAnimationFrame(captureLoop);
        };

        rafRef.current = requestAnimationFrame(captureLoop);

        if (duration && duration > 0) {
          autoStopRef.current = setTimeout(() => {
            finalize();
          }, duration * 1000);
        }
      } else {
        // ── Realtime WebM: MediaRecorder ────────────────────────
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
    },
    [engineRef, updateElapsed, stopRecording, downloadBlob, restoreEngine]
  );

  return { recording, elapsedTime, startRecording, stopRecording };
}
