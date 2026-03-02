import { useState, useRef, useCallback } from "react";
import { Muxer, ArrayBufferTarget } from "webm-muxer";

/**
 * Hook for recording WebGL canvas to WebM video.
 *
 * Two modes:
 * - Realtime (default): captureStream(fps) records at wall-clock speed.
 * - Offline: WebCodecs VideoEncoder with explicit timestamps for frame-exact
 *   output. Falls back to MediaRecorder if WebCodecs is unavailable.
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
  // Ref to allow stopRecording to abort an in-progress WebCodecs offline session
  const offlineAbortRef = useRef(false);

  const updateElapsed = useCallback(() => {
    setElapsedTime((performance.now() - startTimeRef.current) / 1000);
    rafRef.current = requestAnimationFrame(updateElapsed);
  }, []);

  /** Shared: download blob as file */
  const downloadBlob = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameRef.current || `recording_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /** Restore engine state after offline recording */
  const restoreEngine = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
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
    // For WebCodecs offline: signal the rAF loop to stop
    offlineAbortRef.current = true;
    // For MediaRecorder (realtime or fallback): stop triggers onstop callback
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(
    ({ fps = 30, duration, filename, offline = false } = {}) => {
      const engine = engineRef.current;
      const canvas = engine?.canvas;
      if (!canvas) return;

      offlineRef.current = offline;
      offlineAbortRef.current = false;
      chunksRef.current = [];
      filenameRef.current = filename || null;

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

      // ── Bitrate (pixels x 12) ─────────────────────────
      const pixels = canvas.width * canvas.height;
      const videoBitsPerSecond = pixels * 12;

      if (offline && typeof VideoEncoder !== "undefined") {
        // ── Offline: WebCodecs + webm-muxer ─────────────────
        engine.setPaused(true);
        engine.seekTo(0);

        const target = new ArrayBufferTarget();
        const muxer = new Muxer({
          target,
          video: {
            codec: "V_VP8",
            width: canvas.width,
            height: canvas.height,
          },
          firstTimestampBehavior: "offset",
        });

        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => console.error("VideoEncoder error:", e),
        });
        encoder.configure({
          codec: "vp8",
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

        const finalize = async () => {
          try {
            await encoder.flush();
            muxer.finalize();
            const blob = new Blob([target.buffer], { type: "video/webm" });
            downloadBlob(blob);
          } catch (e) {
            console.error("Offline recording finalize error:", e);
          }
          setRecording(false);
          restoreEngine();
        };

        const stepFrame = () => {
          if (offlineAbortRef.current) {
            finalize();
            return;
          }

          for (let i = 0; i < BATCH; i++) {
            if (currentTime >= endTime) {
              finalize();
              return;
            }

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
      } else {
        // ── Realtime ────────────────────────────────────────
        const videoStream = canvas.captureStream(fps);

        // Merge video + audio tracks into a single stream
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
