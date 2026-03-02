import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import GLEngine from "../engine/GLEngine.js";
import ResolutionSelector from "../components/viewport/ResolutionSelector.jsx";

export default function ViewportNode({ data }) {
  const { sceneJSON, engineRef, onError, paused } = data;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineInternalRef = useRef(null);
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState([0, 0]);
  const [fixedResolution, setFixedResolution] = useState(null); // null = auto
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

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
            <ResolutionSelector
              resolution={resolution}
              fixedResolution={fixedResolution}
              onResolutionChange={setFixedResolution}
            />
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
