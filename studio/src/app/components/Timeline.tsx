// Bar under the viewport. Every scene is in one of two modes:
// - Live (no timeline): interactive; just play/pause and elapsed time.
// - Timeline: scrubbing, keyframe marks, length and loop; controls get key buttons.
// Interaction keeps working in Timeline mode; the mode only decides whether
// parameters change over time.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Timeline as TimelineSettings } from "../../scene/schema";
import { seek, transport, updateTimeline } from "../session";
import { useApp } from "../state";
import { PauseIcon, PlayIcon } from "./icons";

export function Timeline() {
  const timeline = useApp((s) => s.scene.timeline);
  const state = useApp((s) => s.runtime.state);
  const time = useApp((s) => s.runtime.time);
  const paused = state === "paused";

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-xs" data-testid="timeline">
      <button
        type="button"
        onClick={() => transport(paused ? "play" : "pause")}
        className="rounded p-1 text-muted hover:bg-raised hover:text-fg"
        title={paused ? "Play" : "Pause"}
      >
        {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
      </button>
      {timeline ? (
        <>
          <span className="shrink-0 tabular-nums text-muted">{time.toFixed(2)}s</span>
          <Track duration={timeline.duration} time={time} />
          <TimelineMenu timeline={timeline} />
        </>
      ) : (
        <>
          <span className="tabular-nums text-muted">{time.toFixed(1)}s</span>
          <div className="flex-1" />
        </>
      )}
      <ModeSwitch timeline={Boolean(timeline)} />
    </div>
  );
}

function ModeSwitch({ timeline }: { timeline: boolean }) {
  const toLive = () => {
    const keys = Object.values(useApp.getState().scene.keyframes).reduce((n, k) => n + k.length, 0);
    if (!keys || confirm(`Switch to Live? This removes the timeline and its ${keys} keyframe${keys === 1 ? "" : "s"} (Cmd+Z brings them back).`)) {
      updateTimeline(null);
    }
  };
  const modes = [
    { id: "live", label: "Live", title: "Interactive: parameters change only when you move them", active: !timeline, select: toLive },
    { id: "timeline", label: "Timeline", title: "Sequenced: animate parameters with keyframes over a fixed length", active: timeline, select: () => updateTimeline({}) },
  ];
  return (
    <div className="flex shrink-0 gap-0.5 rounded-md bg-bg p-0.5" role="radiogroup" aria-label="Scene mode" data-testid="mode-switch">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={m.active}
          title={m.title}
          onClick={() => !m.active && m.select()}
          className={`rounded px-2 py-0.5 ${m.active ? "bg-raised text-fg" : "text-faint hover:text-muted"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function Track({ duration, time }: { duration: number; time: number }) {
  const keyframes = useApp((s) => s.scene.keyframes);
  const uniforms = useApp((s) => s.scene.uniforms);
  const ref = useRef<HTMLDivElement>(null);

  // One mark per distinct key time, titled with the controls keyed there.
  const marks = useMemo(() => {
    const byTime = new Map<number, string[]>();
    for (const [name, keys] of Object.entries(keyframes)) {
      for (const k of keys) {
        const t = Math.round(k.time * 100) / 100;
        byTime.set(t, [...(byTime.get(t) ?? []), uniforms[name]?.label ?? name]);
      }
    }
    return [...byTime.entries()].sort(([a], [b]) => a - b);
  }, [keyframes, uniforms]);

  const timeAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };
  const pct = (t: number) => `${Math.min(100, (t / duration) * 100)}%`;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
      tabIndex={0}
      className="relative h-6 min-w-0 flex-1 cursor-pointer touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(timeAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(timeAt(e.clientX));
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 1 : 0.1;
        if (e.key === "ArrowLeft") seek(time - step);
        if (e.key === "ArrowRight") seek(time + step);
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
      <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted/50" style={{ width: pct(time) }} />
      {marks.map(([t, names]) => (
        <span
          key={t}
          title={`${t.toFixed(2)}s: ${names.join(", ")}`}
          data-key-time={t}
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-bg bg-accent"
          style={{ left: pct(t) }}
        />
      ))}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg" style={{ left: pct(time) }} />
    </div>
  );
}

/** Length and looping, behind one button so the track keeps its width. */
function TimelineMenu({ timeline }: { timeline: TimelineSettings }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-md px-2 py-1 tabular-nums text-muted hover:bg-raised hover:text-fg"
        title="Timeline settings"
        data-testid="timeline-menu"
      >
        {timeline.duration}s{timeline.loop ? " · loop" : ""}
      </button>
      {open && (
        <div className="absolute bottom-9 right-0 z-30 w-60 space-y-3 rounded-lg border border-line bg-raised p-3 shadow-2xl">
          <DurationInput duration={timeline.duration} />
          <Toggle on={timeline.loop} onClick={() => updateTimeline({ loop: !timeline.loop })} label="Loop" />
          {timeline.loop && (
            <Toggle
              on={timeline.preserveStateOnLoop}
              onClick={() => updateTimeline({ preserveStateOnLoop: !timeline.preserveStateOnLoop })}
              label="Keep state on loop"
              hint="Off: the scene restarts (setup runs again) each loop. On: it keeps running and only the time wraps."
            />
          )}
        </div>
      )}
    </div>
  );
}

function DurationInput({ duration }: { duration: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-muted">
      Length
      <input
        key={duration}
        type="number"
        min={0.1}
        step={0.5}
        defaultValue={duration}
        onBlur={(e) => commitDuration(e.currentTarget.value, duration)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="ml-auto w-16 rounded border border-line bg-bg px-1.5 py-0.5 tabular-nums text-fg outline-none focus:border-muted"
      />
      <span className="text-faint">s</span>
    </label>
  );
}

function commitDuration(raw: string, current: number): void {
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0 && value !== current) updateTimeline({ duration: Math.min(3600, value) });
}

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick(): void; label: string; hint?: string }) {
  return (
    <div>
      <button type="button" onClick={onClick} aria-pressed={on} className="flex w-full items-center justify-between text-muted hover:text-fg">
        {label}
        <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-fg transition-all ${on ? "left-[14px]" : "left-0.5"}`} />
        </span>
      </button>
      {hint && <p className="mt-1 text-[11px] leading-snug text-faint">{hint}</p>}
    </div>
  );
}
