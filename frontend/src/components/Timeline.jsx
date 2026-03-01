import { useRef, useEffect, useState, useCallback } from "react";

export default function Timeline({ paused, onTogglePause, onPause, engineRef, duration, onDurationChange, loop, onLoopChange, recording, recordingTime, onToggleRecord, offlineRecord, onToggleOfflineRecord }) {
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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-10 bg-zinc-800 border-t border-zinc-700 flex items-center gap-3 px-4 text-sm text-zinc-300 select-none">
      {/* Play / Pause */}
      <button
        onClick={onTogglePause}
        className="flex items-center justify-center w-6 h-6 text-zinc-400 hover:text-zinc-100 transition-colors"
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

      {/* Record toggle */}
      <button
        onClick={onToggleRecord}
        className={`flex items-center justify-center gap-1 h-6 transition-colors ${recording ? "text-red-400 hover:text-red-300" : "text-zinc-500 hover:text-zinc-300"}`}
        title={recording ? "Stop recording" : "Start recording"}
      >
        <span
          className={`inline-block w-3 h-3 rounded-full ${recording ? "bg-red-500" : "bg-red-800 border border-red-600"}`}
          style={recording ? { animation: "rec-blink 1s ease-in-out infinite" } : undefined}
        />
        {recording && (
          <span className="text-xs font-mono text-red-400 min-w-[36px]">
            {Math.floor(recordingTime / 60).toString().padStart(2, "0")}:{Math.floor(recordingTime % 60).toString().padStart(2, "0")}
          </span>
        )}
      </button>
      {/* Offline record toggle */}
      <div className="relative group">
        <button
          onClick={onToggleOfflineRecord}
          className={`flex items-center justify-center w-6 h-6 transition-colors ${offlineRecord ? "text-indigo-400 hover:text-indigo-300" : "text-zinc-500 hover:text-zinc-300"}`}
          disabled={recording}
          style={recording ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.5" />
            <polyline points="8,4 8,8 11,10" />
          </svg>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-600 shadow-xl text-[11px] text-zinc-300 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
          {offlineRecord
            ? "Offline mode ON — renders every frame at exact FPS"
            : "Realtime mode — click to switch to offline (frame-exact)"}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-600" />
        </div>
      </div>
      <style>{`@keyframes rec-blink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>

      {/* Scrub bar */}
      <div
        ref={barRef}
        className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden relative"
        style={{ cursor: duration > 0 ? "pointer" : "default" }}
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
        className="text-xs text-zinc-400 font-mono whitespace-nowrap min-w-[100px] text-right"
      >
        0.00 / {duration > 0 ? duration.toFixed(2) : "\u221E"}
      </span>

      {/* Duration input */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-500">dur</span>
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
          className="w-12 text-xs text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-zinc-300 outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
