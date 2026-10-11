// Recording (M3): a menu in the bar under the viewport, and progress over the
// viewport while it runs. Files go to the project's assets and downloads.
import { useEffect, useRef, useState } from "react";
import type { RecordOptions } from "../../scene/protocol";
import { cancelRecording, recordScene } from "../session";
import { useApp } from "../state";

const SIZES = [
  { label: "Viewport", width: 0, height: 0 },
  { label: "1920×1080", width: 1920, height: 1080 },
  { label: "1280×720", width: 1280, height: 720 },
  { label: "1080×1080", width: 1080, height: 1080 },
  { label: "1080×1920", width: 1080, height: 1920 },
];

export function RecordButton() {
  const [open, setOpen] = useState(false);
  const recording = useApp((s) => Boolean(s.recording));
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
        disabled={recording}
        data-testid="record-menu"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted hover:bg-raised hover:text-fg disabled:opacity-40"
        title="Record a video or PNG frames"
      >
        <span className="h-2 w-2 rounded-full bg-danger" /> Rec
      </button>
      {open && <RecordMenu onStart={() => setOpen(false)} />}
    </div>
  );
}

function RecordMenu({ onStart }: { onStart(): void }) {
  const timeline = useApp((s) => s.scene.timeline);
  const [format, setFormat] = useState<RecordOptions["format"]>("mp4");
  const [mode, setMode] = useState<RecordOptions["mode"]>("offline");
  const [size, setSize] = useState(0);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(timeline?.duration ?? 5);
  const [quality, setQuality] = useState<RecordOptions["quality"]>("high");
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    const { width, height } = SIZES[size]!;
    const options: RecordOptions = { format: mode === "realtime" ? "webm" : format, mode, fps, duration, width: mode === "realtime" ? 0 : width, height: mode === "realtime" ? 0 : height, quality };
    onStart();
    recordScene(options).catch((err: unknown) => {
      useApp.setState({ notice: { kind: "error", text: `Recording failed: ${err instanceof Error ? err.message : String(err)}` } });
    });
  };

  const field = "w-full rounded border border-line bg-bg px-1.5 py-1 text-fg outline-none focus:border-muted";
  return (
    <div className="absolute bottom-9 right-0 z-30 w-64 space-y-2.5 rounded-lg border border-line bg-raised p-3 text-xs shadow-2xl" data-testid="record-options">
      <Row label="Mode">
        <select value={mode} onChange={(e) => setMode(e.target.value as RecordOptions["mode"])} className={field}>
          <option value="offline">Offline (frame-exact)</option>
          <option value="realtime">Realtime (with interaction)</option>
        </select>
      </Row>
      {mode === "offline" && (
        <>
          <Row label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value as RecordOptions["format"])} className={field} data-testid="record-format">
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="png">PNG frames (zip)</option>
            </select>
          </Row>
          <Row label="Size">
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} className={field}>
              {SIZES.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </Row>
        </>
      )}
      <Row label="FPS">
        <select value={fps} onChange={(e) => setFps(Number(e.target.value))} className={field}>
          {[24, 30, 60].map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Seconds">
        <input type="number" min={0.5} max={600} step={0.5} value={duration} onChange={(e) => setDuration(Math.max(0.5, Number(e.target.value) || 5))} className={field} data-testid="record-duration" />
      </Row>
      <Row label="Quality">
        <select value={quality} onChange={(e) => setQuality(e.target.value as RecordOptions["quality"])} className={field}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="very-high">Very high</option>
        </select>
      </Row>
      {error && <p className="text-danger">{error}</p>}
      <button type="button" onClick={() => (duration > 0 ? start() : setError("Set a length."))} className="w-full rounded-md bg-accent py-1.5 font-medium text-white" data-testid="record-start">
        Record
      </button>
      <p className="text-[11px] leading-snug text-faint">
        {mode === "offline" ? "Starts the scene over and renders every frame exactly; it can take longer than the clip." : "Records what plays, including your mouse, as WebM."}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-muted">
      {label}
      {children}
    </label>
  );
}

/** Progress over the viewport while recording. */
export function RecordingOverlay() {
  const recording = useApp((s) => s.recording);
  if (!recording) return null;
  const pct = recording.total ? Math.round((recording.frame / recording.total) * 100) : 0;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-10 w-64 -translate-x-1/2 rounded-lg bg-black/70 p-3 text-xs text-fg backdrop-blur" data-testid="recording">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Recording {recording.options.mode === "offline" ? recording.options.format.toUpperCase() : "WebM"}
        </span>
        <button type="button" onClick={cancelRecording} className="text-muted hover:text-fg">
          {recording.options.mode === "realtime" ? "Stop" : "Cancel"}
        </button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 tabular-nums text-faint">
        {recording.frame} / {recording.total} frames
      </div>
    </div>
  );
}
