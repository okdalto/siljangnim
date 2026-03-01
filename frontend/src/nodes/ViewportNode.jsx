import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import GLEngine from "../engine/GLEngine.js";

const RESOLUTION_PRESETS = [
  { label: "Auto", w: 0, h: 0 },
  { label: "3840 \u00d7 2160", w: 3840, h: 2160 },
  { label: "2560 \u00d7 1440", w: 2560, h: 1440 },
  { label: "1920 \u00d7 1080", w: 1920, h: 1080 },
  { label: "1280 \u00d7 720",  w: 1280, h: 720 },
  { label: "1080 \u00d7 1080", w: 1080, h: 1080 },
  { label: "1080 \u00d7 1920", w: 1080, h: 1920 },
  { label: "854 \u00d7 480",   w: 854,  h: 480 },
  { label: "640 \u00d7 480",   w: 640,  h: 480 },
];

export default function ViewportNode({ data }) {
  const { sceneJSON, engineRef, onError, paused } = data;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineInternalRef = useRef(null);
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState([0, 0]);
  const [fixedResolution, setFixedResolution] = useState(null); // null = auto
  const [showResMenu, setShowResMenu] = useState(false);
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const resMenuRef = useRef(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showResMenu) return;
    const handleClick = (e) => {
      if (resMenuRef.current && !resMenuRef.current.contains(e.target)) {
        setShowResMenu(false);
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [showResMenu]);

  // Initialize engine on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const engine = new GLEngine(canvas);
      engine.onError = (err) => {
        console.error("[ViewportNode] GLEngine error:", err);
        setError(err.message || String(err));
        onError?.(err);
      };
      engine.onFPS = setFps;
      engineInternalRef.current = engine;

      engine.start();
      console.log("[ViewportNode] Engine started");

      return () => {
        engine.dispose();
        engineInternalRef.current = null;
      };
    } catch (err) {
      console.error("[ViewportNode] Failed to create engine:", err);
      setError(err.message || "WebGL2 not supported");
    }
  }, []);

  // Keep App's engineRef in sync (it may arrive as null on first render then update)
  useEffect(() => {
    if (engineRef && engineInternalRef.current) {
      engineRef.current = engineInternalRef.current;
    }
    return () => {
      if (engineRef) engineRef.current = null;
    };
  }, [engineRef]);

  // Load scene when sceneJSON changes
  useEffect(() => {
    const engine = engineInternalRef.current;
    if (!engine || !sceneJSON) {
      return;
    }
    console.log("[ViewportNode] Loading scene:", sceneJSON.mode || "unknown");
    try {
      setError(null);
      engine.loadScene(sceneJSON);
    } catch (err) {
      console.error("[ViewportNode] loadScene error:", err);
      setError(err.message || String(err));
    }
  }, [sceneJSON]);

  // Handle pause/resume
  useEffect(() => {
    const engine = engineInternalRef.current;
    if (engine) engine.setPaused(!!paused);
  }, [paused]);

  // Apply fixed resolution or revert to auto
  const fixedResRef = useRef(fixedResolution);
  fixedResRef.current = fixedResolution;

  useEffect(() => {
    const engine = engineInternalRef.current;
    const container = containerRef.current;
    if (!engine) return;
    if (fixedResolution) {
      engine.resize(fixedResolution[0], fixedResolution[1]);
      setResolution(fixedResolution);
    } else if (container) {
      // Back to auto — read current container size
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rw = Math.floor(rect.width * dpr);
        const rh = Math.floor(rect.height * dpr);
        engine.resize(rw, rh);
        setResolution([rw, rh]);
      }
    }
  }, [fixedResolution]);

  // Resize observer (stable — never recreated)
  useEffect(() => {
    const container = containerRef.current;
    const engine = engineInternalRef.current;
    if (!container || !engine) return;

    const observer = new ResizeObserver((entries) => {
      if (fixedResRef.current) return; // skip in fixed mode
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const rw = Math.floor(width * dpr);
          const rh = Math.floor(height * dpr);
          engine.resize(rw, rh);
          setResolution([rw, rh]);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Mouse tracking
  const handleMouseMove = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    engine.updateMouse(x, y, e.buttons > 0);
  }, []);

  const handleMouseDown = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    engine.updateMouse(x, y, true);
    containerRef.current?.focus();
  }, []);

  const handleMouseUp = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    engine.updateMouse(x, y, false);
  }, []);

  const handleKeyDown = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    e.stopPropagation();
    e.preventDefault();
    engine.updateKey(e.code, true);
  }, []);

  const handleKeyUp = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    e.stopPropagation();
    e.preventDefault();
    engine.updateKey(e.code, false);
  }, []);

  const handleBlur = useCallback(() => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    engine.releaseAllKeys();
  }, []);

  return (
    <>
      <NodeResizer minWidth={320} minHeight={240} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      <div className="w-full h-full bg-black rounded-xl overflow-hidden border border-zinc-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab shrink-0 flex items-center justify-between leading-5">
          <span>Viewport</span>
          <div className="flex items-center gap-2 text-[10px] tabular-nums leading-5 -mt-px">
            <div className="relative" ref={resMenuRef}>
              <button
                onClick={() => setShowResMenu((v) => !v)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                title="Change render resolution"
              >
                {resolution[0]}×{resolution[1]}{fixedResolution ? "" : " (auto)"}
              </button>
              {showResMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 min-w-[150px] nodrag">
                  {RESOLUTION_PRESETS.map((p) => {
                    const isActive = p.w === 0
                      ? !fixedResolution
                      : fixedResolution?.[0] === p.w && fixedResolution?.[1] === p.h;
                    return (
                      <button
                        key={p.label}
                        onClick={() => {
                          if (p.w === 0) {
                            setFixedResolution(null);
                          } else {
                            setFixedResolution([p.w, p.h]);
                          }
                          setShowResMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1 text-[11px] tabular-nums transition-colors ${
                          isActive
                            ? "text-indigo-400 bg-indigo-950"
                            : "text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  <div className="border-t border-zinc-600 mt-1 pt-1 px-2 pb-1">
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const w = parseInt(customW, 10);
                        const h = parseInt(customH, 10);
                        if (w > 0 && h > 0) {
                          setFixedResolution([w, h]);
                          setShowResMenu(false);
                        }
                      }}
                    >
                      <input
                        type="text"
                        value={customW}
                        onChange={(e) => setCustomW(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="W"
                        className="w-14 text-[11px] text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-zinc-300 outline-none focus:border-indigo-500 tabular-nums"
                      />
                      <span className="text-[10px] text-zinc-500">×</span>
                      <input
                        type="text"
                        value={customH}
                        onChange={(e) => setCustomH(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="H"
                        className="w-14 text-[11px] text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-zinc-300 outline-none focus:border-indigo-500 tabular-nums"
                      />
                      <button
                        type="submit"
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 rounded px-1.5 py-0.5 transition-colors"
                      >
                        OK
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
            <span className="text-zinc-500">
              {fps} FPS
            </span>
            <span className="px-1.5 py-px rounded-full bg-indigo-900 text-indigo-400">
              WebGL2
            </span>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative nodrag min-h-0"
          tabIndex={0}
          style={{ outline: "none" }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={handleBlur}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ imageRendering: "auto" }}
          />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 nodrag">
              <div className="bg-red-950 border border-red-800 rounded-lg p-3 max-w-full max-h-full overflow-auto">
                <div className="flex justify-end mb-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(error);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-[10px] text-red-400 hover:text-red-200 bg-red-950 hover:bg-red-900 border border-red-800 rounded px-1.5 py-0.5 transition-colors"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-red-400 text-xs font-mono whitespace-pre-wrap break-all select-text cursor-text">
                  {error}
                </p>
              </div>
            </div>
          )}
          {!sceneJSON && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
              No scene loaded
            </div>
          )}
        </div>
      </div>
    </>
  );
}
