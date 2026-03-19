import { useState, useRef, useCallback, useEffect } from "react";
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
 * - PNG + offline: frame-by-frame → streaming ZIP (fflate)
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
  const [progress, setProgress] = useState(null);
  const [completionInfoRaw, setCompletionInfoRaw] = useState(null);

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
  const discardRef = useRef(false);
  const completionTimerRef = useRef(null);
  const contextLostHandlerRef = useRef(null);

  // Auto-clear completionInfo after 5 seconds
  const setCompletionInfo = useCallback((info) => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setCompletionInfoRaw(info);
    if (info) {
      completionTimerRef.current = setTimeout(() => {
        setCompletionInfoRaw(null);
        completionTimerRef.current = null;
      }, 5000);
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    };
  }, []);

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
      // Remove WebGL context loss listener
      if (contextLostHandlerRef.current && eng.canvas) {
        eng.canvas.removeEventListener("webglcontextlost", contextLostHandlerRef.current);
        contextLostHandlerRef.current = null;
      }
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
    discardRef.current = false;
  }, [engineRef]);

  const stopRecording = useCallback(() => {
    // Abort confirmation for incomplete offline recording
    if (offlineRef.current && finalizeRef.current) {
      const keepPartial = window.confirm(
        "Recording is still in progress.\n\nOK = Download partial recording\nCancel = Discard"
      );
      if (!keepPartial) {
        discardRef.current = true;
      }
    }

    if (rafRef.current) {
      // Clear both — offline uses setTimeout, realtime uses rAF
      clearTimeout(rafRef.current);
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
    } else {
      // No active recorder or finalizer — force-clear recording state
      setRecording(false);
    }
  }, []);

  const startRecording = useCallback(
    ({ fps = 30, duration, filename, offline = false, format = "mp4", bitrate, resolution, alpha = false } = {}) => {
      const engine = engineRef.current;
      const canvas = engine?.canvas;
      if (!canvas) return;

      // In WebGPU mode the visible content is drawn to a 2D overlay canvas,
      // not the main (idle) WebGL2 canvas. Use that for capture.
      const recordCanvas = engine.getRecordCanvas?.() ?? canvas;

      offlineRef.current = offline;
      offlineAbortRef.current = false;
      discardRef.current = false;
      chunksRef.current = [];
      filenameRef.current = filename || null;
      savedSizeRef.current = null;
      setProgress(null);
      setCompletionInfo(null);

      // Resolution override
      if (resolution && (resolution.width !== canvas.width || resolution.height !== canvas.height)) {
        savedSizeRef.current = { width: canvas.width, height: canvas.height };
        engine.resize(resolution.width, resolution.height);
      }

      // WebGL context loss handler
      const handleContextLost = (e) => {
        e.preventDefault();
        console.error("WebGL context lost during recording");
        if (offlineRef.current) {
          offlineAbortRef.current = true;
        } else {
          stopRecording();
        }
      };
      canvas.addEventListener("webglcontextlost", handleContextLost);
      contextLostHandlerRef.current = handleContextLost;

      // Audio — include either decoded file playback or a live procedural graph.
      const audioManager = engine._audioManager;
      const audioLoaded = audioManager?.isLoaded ?? false;
      const hasLiveAudioGraph = !!audioManager?._audioContext;
      const needsOfflineAudioBounce = !!(offline && hasLiveAudioGraph && audioManager?.hasScriptAudioUsage);
      const audioStream =
        ((!offline && audioManager && (audioLoaded || hasLiveAudioGraph)) ||
          (offline && needsOfflineAudioBounce))
          ? audioManager.getAudioStream()
          : null;
      const audioBuffer =
        offline && audioLoaded && audioManager && !needsOfflineAudioBounce
          ? audioManager.getAudioBuffer?.() ?? audioManager._buffer ?? null
          : null;
      let hasAudio = false;
      if (offline) {
        hasAudio =
          (audioBuffer !== null && audioBuffer.numberOfChannels > 0) ||
          !!(audioStream && audioStream.getAudioTracks().length > 0);
      } else if (audioStream && audioStream.getAudioTracks().length > 0) {
        const channels = audioStream.getAudioTracks()[0].getSettings().channelCount || 0;
        hasAudio = channels > 0;
      }


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
      // Strategies capture from recordCanvas (which is the 2D overlay in WebGPU mode).
      const ctx = {
        engine, canvas: recordCanvas, fps, duration, format, alpha,
        videoBitsPerSecond, mimeType, hasAudio, audioStream, audioBuffer,
        setRecording, setElapsedTime, setProgress, setCompletionInfo,
        downloadBlob, discardRef,
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
    [engineRef, updateElapsed, stopRecording, downloadBlob, restoreEngine, setCompletionInfo]
  );

  return { recording, elapsedTime, progress, completionInfo: completionInfoRaw, startRecording, stopRecording };
}
