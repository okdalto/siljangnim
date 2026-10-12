import { useEffect, useRef, useState } from "react";
import { formatSceneError } from "../../agent/sceneTools";
import { SceneHost, sceneRuntimeUrl } from "../../scene/host";
import { FRAME_PRESETS, frameBox, frameLabel, parseFrame, sameFrame, type Frame } from "../frame";
import { attachSceneHost, setFrame } from "../session";
import { useApp, useLanguage } from "../state";
import { AlertIcon, ExpandIcon, XIcon } from "./icons";
import { EXAMPLES, exampleText } from "../../project/examples";
import { Notice } from "./Chat";
import { Controls } from "./Controls";
import { RecordingOverlay } from "./Record";

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [performInWindow, setPerformInWindow] = useState(false);
  const frame = useApp((s) => s.frame);
  const [area, setArea] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setArea({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const box = frameBox(frame, area);
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
    <section
      ref={sectionRef}
      className={`${performInWindow ? "fixed inset-0 z-50" : "relative min-h-0 flex-1"} select-none bg-black`}
      data-perform={performInWindow ? "window" : undefined}
    >
      {/* The scene sits in a centered box when a frame (aspect or exact size) is chosen. */}
      <div
        ref={containerRef}
        className={box ? "absolute outline outline-1 outline-white/10" : "absolute inset-0"}
        style={box ? { width: box.width, height: box.height, left: (area.width - box.width) / 2, top: (area.height - box.height) / 2 } : undefined}
        data-frame={frameLabel(frame)}
      />
      {hostError && <div className="absolute inset-0 grid place-items-center p-6 text-sm text-danger">{hostError}</div>}
      <StatusBar />
      <PerformButton target={sectionRef} inWindow={performInWindow} setInWindow={setPerformInWindow} />
      {!performInWindow && <FrameMenu frame={frame} />}
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
  const korean = useLanguage() === "ko";
  const example = EXAMPLES.find((e) => e.slug === slug);
  if (!example) return null;
  const text = exampleText(example, korean);
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
          {text.tries.map((line) => (
            <li key={line} className="flex gap-1.5">
              <span className="text-accent">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Landscape, portrait, square or an exact render size; Fit fills the viewport. */
function FrameMenu({ frame }: { frame: Frame }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const parsed = parseFrame(custom);
  const groups = [...new Set(FRAME_PRESETS.map((p) => p.group))];
  return (
    <div className="absolute bottom-2 right-[92px] z-10">
      {open && (
        <div className="absolute bottom-8 right-0 w-56 rounded-lg border border-line bg-panel/95 p-2 text-xs shadow-2xl backdrop-blur" data-testid="frame-menu">
          {groups.map((g) => (
            <div key={g} className="mb-1.5">
              {g && <div className="px-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-faint">{g}</div>}
              <div className="flex flex-wrap gap-1">
                {FRAME_PRESETS.filter((p) => p.group === g).map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setFrame(p.frame);
                      setOpen(false);
                    }}
                    className={`rounded-md px-2 py-1 ${sameFrame(p.frame, frame) ? "bg-accent text-white" : "bg-raised text-muted hover:text-fg"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <form
            className="mt-2 flex gap-1 border-t border-line pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!parsed) return;
              setFrame(parsed);
              setOpen(false);
              setCustom("");
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom: 1280x720 or 21:9"
              className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-faint"
              data-testid="frame-custom"
            />
            <button type="submit" disabled={!parsed} className="rounded-md bg-raised px-2 text-muted hover:text-fg disabled:opacity-40">
              Set
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Frame: landscape, portrait, square or an exact size"
        data-testid="frame-button"
        className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-muted backdrop-blur hover:text-fg"
      >
        <span className="inline-block h-2.5 w-3.5 rounded-[2px] border border-current" /> {frameLabel(frame)}
      </button>
    </div>
  );
}

/**
 * Perform: the viewport alone, full screen, for a live set or a projector. The controls panel stays (it can be
 * folded), and MIDI, OSC, audio and the keyboard keep driving the scene. Where full screen is refused (an
 * embedded browser), the viewport fills the window instead. Esc leaves.
 */
function PerformButton({ target, inWindow, setInWindow }: { target: React.RefObject<HTMLElement | null>; inWindow: boolean; setInWindow: (v: boolean) => void }) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === target.current);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setInWindow(false);
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [target, setInWindow]);
  if (full) return null;
  if (inWindow) {
    // Esc doesn't reach the app while the scene has focus, so leaving needs a button too.
    return (
      <button
        type="button"
        onClick={() => setInWindow(false)}
        className="absolute left-2 top-2 z-10 rounded-md bg-black/50 px-2 py-1 text-xs text-white/70 opacity-40 backdrop-blur transition-opacity hover:opacity-100"
      >
        Leave (Esc)
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="perform"
      title="Perform: the scene full screen (Esc to leave)"
      onClick={() => {
        const el = target.current;
        if (!el) return;
        // Refused, or still waiting on a permission prompt after a moment: fill the window instead.
        const fallback = setTimeout(() => document.fullscreenElement || setInWindow(true), 800);
        el.requestFullscreen().catch(() => {
          clearTimeout(fallback);
          setInWindow(true);
        });
      }}
      className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-muted backdrop-blur hover:text-fg"
    >
      <ExpandIcon size={13} /> Perform
    </button>
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
      {/* Right padding leaves room for the frame and Perform buttons. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 pr-44">
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
