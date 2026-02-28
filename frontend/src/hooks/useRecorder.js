import { useState, useRef, useCallback } from "react";

/**
 * Hook for recording WebGL canvas to WebM video.
 *
 * Two modes:
 * - Realtime (default): captureStream(fps) records at wall-clock speed.
 * - Offline: captureStream(0) + requestFrame() renders frame-by-frame,
 *   guaranteeing every frame at the target FPS regardless of GPU speed.
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

  const updateElapsed = useCallback(() => {
    setElapsedTime((performance.now() - startTimeRef.current) / 1000);
    rafRef.current = requestAnimationFrame(updateElapsed);
  }, []);

  /** Shared: download blob as file */
  const downloadBlob = useCallback((blob, mimeType) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameRef.current || `recording_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const stopRecording = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    // recorder.stop() triggers onstop callback which handles finalization
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
      chunksRef.current = [];
      filenameRef.current = filename || null;

      // ── Audio stream (realtime only) ──────────────────
      const audioStream =
        !offline && engine._audioManager
          ? engine._audioManager.getAudioStream()
          : null;
      const hasAudio =
        audioStream && audioStream.getAudioTracks().length > 0;

      // ── Codec selection ───────────────────────────────
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

      // ── Bitrate (pixels × 12) ────────────────────────
      const pixels = canvas.width * canvas.height;
      const videoBitsPerSecond = pixels * 12;

      const makeOnStop = () => () => {
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        downloadBlob(blob, mimeType);

        // Restore engine after offline recording
        if (offlineRef.current) {
          const eng = engineRef.current;
          if (eng) {
            eng.seekTo(0);
            eng.setPaused(false);
          }
          offlineRef.current = false;
        }
      };

      if (offline) {
        // ── Offline (frame-by-frame) ────────────────────────
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
        recorder.onstop = makeOnStop();
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
        recorder.onstop = makeOnStop();
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
    [engineRef, updateElapsed, stopRecording, downloadBlob]
  );

  return { recording, elapsedTime, startRecording, stopRecording };
}
