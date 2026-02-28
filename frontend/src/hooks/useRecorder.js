import { useState, useRef, useCallback } from "react";

/**
 * Hook for recording WebGL canvas to WebM video.
 * Uses canvas.captureStream() + MediaRecorder API.
 */
export default function useRecorder(engineRef) {
  const [recording, setRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const rafRef = useRef(null);
  const autoStopRef = useRef(null);
  const filenameRef = useRef(null);

  const updateElapsed = useCallback(() => {
    setElapsedTime((performance.now() - startTimeRef.current) / 1000);
    rafRef.current = requestAnimationFrame(updateElapsed);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const startRecording = useCallback(
    ({ fps = 30, duration, filename } = {}) => {
      const canvas = engineRef.current?.canvas;
      if (!canvas) return;

      // Pick supported mimeType
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      filenameRef.current = filename || null;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        setRecording(false);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // Auto-download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filenameRef.current || `recording_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      recorder.start(100); // collect data every 100ms
      recorderRef.current = recorder;

      startTimeRef.current = performance.now();
      setElapsedTime(0);
      setRecording(true);
      rafRef.current = requestAnimationFrame(updateElapsed);

      // Auto-stop after duration
      if (duration && duration > 0) {
        autoStopRef.current = setTimeout(() => {
          stopRecording();
        }, duration * 1000);
      }
    },
    [engineRef, updateElapsed, stopRecording]
  );

  return { recording, elapsedTime, startRecording, stopRecording };
}
