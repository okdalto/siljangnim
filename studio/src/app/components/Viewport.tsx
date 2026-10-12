import { useEffect, useRef, useState } from "react";
import { formatSceneError } from "../../agent/sceneTools";
import { SceneHost, sceneRuntimeUrl } from "../../scene/host";
import { attachSceneHost } from "../session";
import { useApp } from "../state";
import { AlertIcon, XIcon } from "./icons";
import { EXAMPLES, exampleText } from "../../project/examples";
import { Notice } from "./Chat";
import { Controls } from "./Controls";
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
    <section className="relative min-h-0 flex-1 select-none bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      {hostError && <div className="absolute inset-0 grid place-items-center p-6 text-sm text-danger">{hostError}</div>}
      <StatusBar />
      {/* After the scene container: it is the page's first iframe. */}
      <Controls />
      <FoldedNotice />
      <ExampleIntro />
      <RecordingOverlay />
    </section>
  );
}

/** Right after an example opens: what it is and what to try, in plain words. */
function ExampleIntro() {
  const slug = useApp((s) => s.exampleIntro);
  const example = EXAMPLES.find((e) => e.slug === slug);
  if (!example) return null;
  const text = exampleText(example);
  return (
    <div className="absolute bottom-10 left-2 z-20 w-80 rounded-lg border border-line/80 bg-panel/90 p-3 text-xs shadow-2xl backdrop-blur" data-testid="example-intro">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-medium text-fg">{text.title}</span>
        <button type="button" onClick={() => useApp.setState({ exampleIntro: null })} className="-mr-1 -mt-0.5 rounded p-0.5 text-faint hover:bg-raised hover:text-fg" title="Close">
          <XIcon size={13} />
        </button>
      </div>
      <p className="leading-relaxed text-muted">{text.summary}</p>
      {text.tries.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-muted">
          {text.tries.map((t) => (
            <li key={t} className="flex gap-1.5">
              <span className="text-accent">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** With the sidebar folded, its notices (imports, exports, errors) float over the viewport. */
function FoldedNotice() {
  const folded = useApp((s) => s.sidebarCollapsed);
  if (!folded) return null;
  return (
    <div className="absolute bottom-10 right-1 z-20 w-80 shadow-2xl">
      <Notice />
    </div>
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
