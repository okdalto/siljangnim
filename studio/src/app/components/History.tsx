// Version history: every agent run and control adjustment, as a tree.
// Clicking a version restores it; later changes branch from there.
import { useEffect, useMemo, useRef } from "react";
import { layoutTree } from "../../project/history";
import type { Version } from "../../project/store";
import { restoreVersion } from "../session";
import { useApp } from "../state";

export function History() {
  const versions = useApp((s) => s.versions);
  const head = useApp((s) => s.project?.head);
  const busy = useApp((s) => Boolean(s.live));
  const rows = useMemo(() => layoutTree(versions), [versions]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  if (!rows.length) {
    return <div className="p-6 text-center text-xs text-faint">Versions appear here after the agent changes the scene or you adjust the controls.</div>;
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-2" data-testid="history">
      {busy && <p className="px-4 pb-2 text-[11px] text-faint">Restoring is available when the agent finishes.</p>}
      {rows.map(({ version, depth }) => (
        <Row key={version.id} version={version} depth={depth} current={version.id === head} disabled={busy} />
      ))}
    </div>
  );
}

function Row({ version, depth, current, disabled }: { version: Version; depth: number; current: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || current}
      onClick={() => void restoreVersion(version.id)}
      title={current ? "Current version" : "Restore this version"}
      data-version={version.id}
      className={`flex w-full items-center gap-3 py-1.5 pr-4 text-left text-xs ${current ? "bg-raised" : "enabled:hover:bg-raised/60"} disabled:cursor-default`}
      style={{ paddingLeft: 16 + depth * 18 }}
    >
      {depth > 0 && <span className="-ml-2.5 h-10 w-px shrink-0 bg-line" aria-hidden />}
      <Thumbnail blob={version.thumbnail} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${current ? "text-fg" : "text-muted"}`}>{version.message}</span>
        <span className="text-[11px] text-faint">
          {formatTime(version.createdAt)}
          {current && <span className="ml-2 text-accent">current</span>}
        </span>
      </span>
    </button>
  );
}

function Thumbnail({ blob }: { blob: Blob | undefined }) {
  const ref = useRef<HTMLImageElement>(null);
  // The object URL lives exactly as long as this effect (StrictMode-safe).
  useEffect(() => {
    const img = ref.current;
    if (!img || !blob) return;
    const url = URL.createObjectURL(blob);
    img.src = url;
    return () => {
      img.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  if (!blob) return <span className="h-10 w-16 shrink-0 rounded border border-line bg-bg" />;
  return <img ref={ref} alt="" className="h-10 w-16 shrink-0 rounded border border-line object-cover" />;
}

function formatTime(at: number): string {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
