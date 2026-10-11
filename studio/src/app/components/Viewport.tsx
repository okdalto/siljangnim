import { useEffect, useRef, useState } from "react";
import { formatSceneError } from "../../agent/sceneTools";
import { SceneHost, sceneRuntimeUrl } from "../../scene/host";
import { attachSceneHost } from "../session";
import { useApp } from "../state";
import { AlertIcon, XIcon } from "./icons";
import { RecordingOverlay } from "./Record";

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [runtime] = useState(() => {
    try {
      return { url: sceneRuntimeUrl(), error: null };
    } catch (err) {
      return { url: null, error: err instanceof Error ? err.message : String(err) };
    }
  });
  const hostError = runtime.error;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !runtime.url) return;
    const host = new SceneHost(container, runtime.url);
    const detach = attachSceneHost(host);
    return () => {
      detach();
      host.destroy();
    };
  }, [runtime.url]);

  return (
    <section className="relative min-h-0 flex-1 bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      {hostError && <div className="absolute inset-0 grid place-items-center p-6 text-sm text-danger">{hostError}</div>}
      <StatusBar />
      <RecordingOverlay />
    </section>
  );
}

function StatusBar() {
  const runtime = useApp((s) => s.runtime);
  const [showErrors, setShowErrors] = useState(false);
  const dot = {
    idle: "bg-faint",
    loading: "bg-warn animate-pulse",
    running: "bg-ok",
    paused: "bg-muted",
    error: "bg-danger",
  }[runtime.state];
  const errors = runtime.errors;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
        <div
          className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-muted backdrop-blur"
          title={runtime.state}
          data-runtime-state={runtime.state}
          data-runtime-errors={errors.length}
        >
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="tabular-nums text-faint">{runtime.fps} fps</span>
        </div>
        {errors.length > 0 && (
          <button
            type="button"
            onClick={() => setShowErrors(!showErrors)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-danger/15 px-2 py-1 text-xs text-danger backdrop-blur hover:bg-danger/25"
          >
            <AlertIcon size={13} /> {errors.length} {errors.length === 1 ? "error" : "errors"}
          </button>
        )}
      </div>
      {showErrors && errors.length > 0 && (
        <div className="absolute bottom-11 right-2 max-h-[60%] w-[min(560px,90%)] overflow-auto rounded-lg border border-line bg-panel/95 p-3 text-xs shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-fg">Scene errors</span>
            <button type="button" onClick={() => setShowErrors(false)} className="text-muted hover:text-fg">
              <XIcon size={14} />
            </button>
          </div>
          {errors.map((e, i) => (
            <pre key={i} className="mb-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-danger/90">
              {formatSceneError(e)}
            </pre>
          ))}
        </div>
      )}
    </>
  );
}
