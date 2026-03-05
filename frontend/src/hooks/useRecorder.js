import { useState, useRef, useCallback } from "react";
import {
  startOfflinePng,
  startOfflineWebCodecs,
  startOfflineFallback,
  startRealtimeMp4,
  startRealtimeWebm,
} from "../utils/recorderStrategies.js";

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

  const restoreEngine = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
      if (alphaRef.current) {
        eng.recreateContext({ alpha: false });
        alphaRef.current = false;
      }
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
    if (finalizeRef.current) {
      finalizeRef.current();
      return;
    }
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

      // Resolution override
      if (resolution && (resolution.width !== canvas.width || resolution.height !== canvas.height)) {
        savedSizeRef.current = { width: canvas.width, height: canvas.height };
        engine.resize(resolution.width, resolution.height);
      }

      // Audio
      const audioManager = engine._audioManager;
      const audioStream =
        !offline && audioManager
          ? audioManager.getAudioStream()
          : null;
      const audioBuffer =
        offline && audioManager
          ? (audioManager._buffer ?? null)
          : null;
      const hasAudio = offline
        ? audioBuffer !== null
        : audioStream && audioStream.getAudioTracks().length > 0;


      // Codec selection (for MediaRecorder paths)
      const codecCandidates = hasAudio
        ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"]
        : ["video/webm;codecs=vp9", "video/webm"];
      const mimeType =
        codecCandidates.find((c) => MediaRecorder.isTypeSupported(c)) ||
        "video/webm";

      // Bitrate
      const pixels = canvas.width * canvas.height;
      const videoBitsPerSecond = bitrate || pixels * 12;

      // Restore size on realtime stop
      const restoreOnRealtimeStop = () => {
        if (savedSizeRef.current) {
          const eng = engineRef.current;
          if (eng) eng.resize(savedSizeRef.current.width, savedSizeRef.current.height);
          savedSizeRef.current = null;
        }
      };

      // Shared context for all strategies
      const ctx = {
        engine, canvas, fps, duration, format, alpha,
        videoBitsPerSecond, mimeType, hasAudio, audioStream, audioBuffer,
        setRecording, setElapsedTime, downloadBlob,
        rafRef, finalizeRef, offlineAbortRef, alphaRef, filenameRef,
        recorderRef, chunksRef, startTimeRef, autoStopRef,
        restoreEngine, restoreOnRealtimeStop,
        stopRecording, updateElapsed,
      };

      if (offline && format === "png") {
        startOfflinePng(ctx);
      } else if (offline && (format === "mp4" || format === "webm") && typeof VideoEncoder !== "undefined") {
        startOfflineWebCodecs(ctx);
      } else if (offline) {
        startOfflineFallback(ctx);
      } else if (!offline && format === "mp4" && typeof VideoEncoder !== "undefined") {
        startRealtimeMp4(ctx);
      } else {
        startRealtimeWebm(ctx);
      }
    },
    [engineRef, updateElapsed, stopRecording, downloadBlob, restoreEngine]
  );

  return { recording, elapsedTime, startRecording, stopRecording };
}
