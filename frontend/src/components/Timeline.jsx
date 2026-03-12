import { useRef, useEffect, useState, useCallback } from "react";
import RecordMenu from "./RecordMenu.jsx";

const FRAME_FPS = 30; // assumed frame rate for step operations

export default function Timeline({ paused, onTogglePause, onPause, engineRef, duration, onDurationChange, loop, onLoopChange, recording, recordingTime, onStartRecord, onStopRecord, canvasWidth, canvasHeight, progress, completionInfo }) {
  const progressRef = useRef(null);
  const timeDisplayRef = useRef(null);
  const barRef = useRef(null);
  const scrubbing = useRef(false);
  const [durationInput, setDurationInput] = useState(String(duration));

  // Sync input when prop changes externally
  useEffect(() => {
    setDurationInput(String(duration));
  }, [duration]);

  // Own rAF loop — polls engine.getCurrentTime() directly.
  // This avoids the timing issue where engineRef.current is null at mount.
  useEffect(() => {
    let rafId;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const engine = engineRef.current;
      if (!engine) return;

      // Keep engine settings in sync
      engine.setDuration(duration);
      engine.setLoop(loop);
      engine.onTimelineEnd = () => onPause?.();

      if (scrubbing.current) return;

      const t = engine.getCurrentTime();
      if (progressRef.current) {
        if (duration > 0) {
          const pct = Math.min(100, (t / duration) * 100);
          progressRef.current.style.width = `${pct}%`;
        } else {
          progressRef.current.style.width = "0%";
        }
      }
      if (timeDisplayRef.current) {
        const cur = Math.max(0, t).toFixed(2);
        const dur = duration > 0 ? duration.toFixed(2) : "\u221E";
        timeDisplayRef.current.textContent = `${cur} / ${dur}`;
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [engineRef, duration, loop, onPause]);

  // Scrub helpers
  const calcTime = useCallback(
    (clientX) => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return 0;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const onPointerDown = useCallback(
    (e) => {
      if (duration <= 0) return;
      scrubbing.current = true;
      e.target.setPointerCapture(e.pointerId);
      const t = calcTime(e.clientX);
      engineRef.current?.seekTo(t);
      if (progressRef.current) {
        progressRef.current.style.width = `${(t / duration) * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${t.toFixed(2)} / ${duration.toFixed(2)}`;
      }
    },
    [duration, calcTime, engineRef]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!scrubbing.current) return;
      const t = calcTime(e.clientX);
      engineRef.current?.seekTo(t);
      if (progressRef.current) {
        progressRef.current.style.width = `${(t / duration) * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${t.toFixed(2)} / ${duration.toFixed(2)}`;
      }
    },
    [duration, calcTime, engineRef]
  );

  const onPointerUp = useCallback(() => {
    scrubbing.current = false;
  }, []);

  const commitDuration = useCallback(() => {
    const v = parseFloat(durationInput);
    if (!isNaN(v) && v >= 0) {
      onDurationChange(v);
    } else {
      setDurationInput(String(duration));
    }
  }, [durationInput, duration, onDurationChange]);

  // Frame step: pause if playing, then seek ±1 frame
  const stepFrame = useCallback((dir) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!engine._paused) {
      engine.setPaused(true);
      onPause?.();
    }
    const frameDur = 1 / FRAME_FPS;
    const t = Math.max(0, engine.getCurrentTime() + dir * frameDur);
    engine.seekTo(duration > 0 ? Math.min(t, duration) : t);
    // Force UI sync
    if (progressRef.current && duration > 0) {
      progressRef.current.style.width = `${Math.min(100, (t / duration) * 100)}%`;
    }
    if (timeDisplayRef.current) {
      const dur = duration > 0 ? duration.toFixed(2) : "\u221E";
      timeDisplayRef.current.textContent = `${Math.max(0, t).toFixed(2)} / ${dur}`;
    }
  }, [engineRef, duration, onPause]);

  // Render current frame (pause + trigger re-render)
  const renderCurrentFrame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!engine._paused) {
      engine.setPaused(true);
      onPause?.();
    }
    engine._needsPausedRender = true;
  }, [engineRef, onPause]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 h-10 flex items-center gap-3 px-4 text-sm select-none"
      style={{ background: "var(--chrome-bg)", borderTop: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
    >
      {/* Play / Pause */}
      <button
        onClick={onTogglePause}
        className="flex items-center justify-center w-6 h-6 transition-colors"
        style={{ color: "var(--chrome-text-secondary)" }}
        title={paused ? "Play" : "Pause"}
      >
        {paused ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <polygon points="2,0 14,7 2,14" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="0" width="4" height="14" />
            <rect x="9" y="0" width="4" height="14" />
          </svg>
        )}
      </button>

      {/* Frame step controls */}
      <div className="flex items-center gap-0.5">
        {/* Step back one frame */}
        <button
          onClick={() => stepFrame(-1)}
          className="flex items-center justify-center w-5 h-6 transition-colors"
          style={{ color: "var(--chrome-text-secondary)" }}
          title="Previous frame"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <rect x="0" y="1" width="2" height="8" />
            <polygon points="10,1 3,5 10,9" />
          </svg>
        </button>

        {/* Render current frame */}
        <button
          onClick={renderCurrentFrame}
          className="flex items-center justify-center w-5 h-6 transition-colors"
          style={{ color: "var(--chrome-text-secondary)" }}
          title="Render current frame"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="8" height="8" rx="1" />
          </svg>
        </button>

        {/* Step forward one frame */}
        <button
          onClick={() => stepFrame(1)}
          className="flex items-center justify-center w-5 h-6 transition-colors"
          style={{ color: "var(--chrome-text-secondary)" }}
          title="Next frame"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <rect x="8" y="1" width="2" height="8" />
            <polygon points="0,1 7,5 0,9" />
          </svg>
        </button>
      </div>

      {/* Loop toggle */}
      <button
        onClick={() => onLoopChange(!loop)}
        className={`flex items-center justify-center w-6 h-6 transition-colors ${loop ? "text-blue-400 hover:text-blue-300" : "text-zinc-500 hover:text-zinc-300"}`}
        title={loop ? "Loop" : "Once"}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {loop ? (
            <>
              <path d="M2 8a6 6 0 0 1 10.47-4" />
              <path d="M14 8a6 6 0 0 1-10.47 4" />
              <polyline points="12 2 13 4.5 10.5 4.5" />
              <polyline points="4 14 3 11.5 5.5 11.5" />
            </>
          ) : (
            <>
              <polyline points="4 6 8 2 12 6" />
              <line x1="8" y1="2" x2="8" y2="14" />
            </>
          )}
        </svg>
      </button>

      {/* Record menu (popover) */}
      <RecordMenu
        recording={recording}
        recordingTime={recordingTime}
        onStart={onStartRecord}
        onStop={onStopRecord}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        progress={progress}
        completionInfo={completionInfo}
        sceneDuration={duration}
      />

      {/* Scrub bar */}
      <div
        ref={barRef}
        className="flex-1 h-2 rounded-full overflow-hidden relative"
        style={{ cursor: duration > 0 ? "pointer" : "default", background: "var(--input-bg)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          ref={progressRef}
          className="h-full bg-blue-500 rounded-full pointer-events-none"
          style={{ width: duration > 0 ? "0%" : "0%" }}
        />
      </div>

      {/* Time display */}
      <span
        ref={timeDisplayRef}
        className="text-xs font-mono whitespace-nowrap min-w-[100px] text-right"
        style={{ color: "var(--chrome-text-secondary)" }}
      >
        0.00 / {duration > 0 ? duration.toFixed(2) : "\u221E"}
      </span>

      {/* Duration input */}
      <div className="flex items-center gap-1">
        <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>dur</span>
        <input
          type="text"
          value={durationInput}
          onChange={(e) => setDurationInput(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.target.blur();
            }
          }}
          className="w-12 text-xs text-center rounded px-1 py-0.5 outline-none focus:border-blue-500"
          style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" }}
        />
      </div>
    </div>
  );
}
