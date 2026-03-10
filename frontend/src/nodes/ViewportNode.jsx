import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import GLEngine from "../engine/GLEngine.js";
import ResolutionSelector from "../components/viewport/ResolutionSelector.jsx";
import useStopWheelPropagation from "../hooks/useStopWheelPropagation.js";
import MissingAssetsBar from "../components/MissingAssetsBar.jsx";

export default function ViewportNode({ id, data, standalone = false, hideHeader = false }) {
  const { sceneJSON, engineRef, onError, paused, safeModeActive } = data;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineInternalRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState([0, 0]);
  const [fixedResolution, setFixedResolutionRaw] = useState(() => data.initialFixedResolution ?? null);
  const setFixedResolution = useCallback((v) => {
    setFixedResolutionRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      data.onFixedResolutionChange?.(next);
      return next;
    });
  }, [data.onFixedResolutionChange]);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [missingAssets, setMissingAssets] = useState([]);
  const [collapsed, setCollapsedRaw] = useState(() => data.initialCollapsed ?? false);
  const setCollapsed = useCallback((v) => {
    setCollapsedRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      data.onCollapsedChange?.(next);
      return next;
    });
  }, [data.onCollapsedChange]);
  // Sync collapsed state when project is restored
  const prevInitCollapsed = useRef(data.initialCollapsed);
  useEffect(() => {
    if (data.initialCollapsed !== prevInitCollapsed.current) {
      prevInitCollapsed.current = data.initialCollapsed;
      setCollapsedRaw(data.initialCollapsed ?? false);
    }
  }, [data.initialCollapsed]);
  // Sync fixedResolution when project is restored
  const prevInitFixedRes = useRef(data.initialFixedResolution);
  useEffect(() => {
    if (data.initialFixedResolution !== prevInitFixedRes.current) {
      prevInitFixedRes.current = data.initialFixedResolution;
      setFixedResolutionRaw(data.initialFixedResolution ?? null);
    }
  }, [data.initialFixedResolution]);
  const [backendName, setBackendName] = useState("WebGL2");

  useStopWheelPropagation(containerRef);

  // Initialize engine on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const engine = new GLEngine(canvas);
      engine.onError = (err) => {
        console.error("[ViewportNode] GLEngine error:", err);
        setError(err.message || String(err));
        onErrorRef.current?.(err);
      };
      engine.onFPS = setFps;
      engine.onBackendReady = (type) => {
        setBackendName(type === "webgpu" ? "WebGPU" : "WebGL2");
      };
      engine.onMissingAssets = (list) => {
        setMissingAssets(list);
      };
      engineInternalRef.current = engine;

      // Initialize backend abstraction (async, non-blocking)
      engine.initBackend().catch((err) => {
        console.warn("[ViewportNode] Backend init warning:", err.message);
      });

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
    setError(null);
    engine.loadScene(sceneJSON).catch((err) => {
      console.error("[ViewportNode] loadScene error:", err);
      setError(err.message || String(err));
    });
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
    // Ensure hover is set (mouseEnter may have been missed if mouse was already over)
    if (!engine._mouseHover) engine.updateMouseHover(true);
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

  const handleMouseEnter = useCallback(() => {
    engineInternalRef.current?.updateMouseHover(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    engineInternalRef.current?.updateMouseHover(false);
  }, []);

  // Touch tracking (maps to mouse input)
  const handleTouchStart = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !e.touches.length) return;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;
    engine.updateMouse(x, y, true);
    e.preventDefault();
  }, []);

  const handleTouchMove = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !e.touches.length) return;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;
    engine.updateMouse(x, y, true);
    e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const engine = engineInternalRef.current;
    if (!engine) return;
    // Use last known position, set pressed to false
    engine.updateMouse(engine._mouse[0], engine._mouse[1], false);
    e.preventDefault();
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

  // Fullscreen toggle — only the canvas container, no UI chrome
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  const canvasContent = (
    <div
      ref={containerRef}
      className={`flex-1 relative min-h-0 bg-black ${standalone ? "" : "nodrag"}`}
      tabIndex={0}
      style={{ outline: "none" }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: "auto" }}
      />
      {missingAssets.length > 0 && (
        <MissingAssetsBar
          missingAssets={missingAssets}
          onAssetsReplaced={() => {
            setMissingAssets([]);
            const engine = engineInternalRef.current;
            if (engine && data.sceneJSON) {
              engine.loadScene(data.sceneJSON);
            }
          }}
        />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
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
      {safeModeActive && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "#fbbf24", background: "rgba(0,0,0,0.6)" }}>
          <div className="text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div className="font-medium">Safe Mode</div>
            <div className="text-xs opacity-70 mt-1">Scripts blocked — trust project to run</div>
          </div>
        </div>
      )}
      {!sceneJSON && !safeModeActive && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "var(--chrome-text-muted)" }}>
          No scene loaded
        </div>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: "var(--node-bg)" }}>
        {/* Mini info bar */}
        {!hideHeader && (
        <div className="flex items-center justify-between px-3 py-1 text-[10px] tabular-nums shrink-0" style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}>
          <span className="font-semibold text-xs">Viewport</span>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--chrome-text-muted)" }}>{fps} FPS</span>
            <span className={`px-1.5 py-px rounded-full ${backendName === "WebGPU" ? "bg-emerald-900 text-emerald-400" : "bg-indigo-900 text-indigo-400"}`}>{backendName}</span>
            <button onClick={toggleFullscreen} className="p-2 -m-1 transition-colors" style={{ color: "var(--chrome-text-secondary)" }} title="Fullscreen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </div>
        )}
        {canvasContent}
      </div>
    );
  }

  return (
    <>
      <NodeResizer minWidth={320} minHeight={240} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      <div
        className={`node-container w-full ${collapsed ? "h-auto" : "h-full"} rounded-xl overflow-hidden shadow-2xl flex flex-col`}
        style={{ background: "var(--node-bg)", border: "1px solid var(--node-border)" }}
      >
        {/* Header */}
        <div
          className="px-4 py-2 text-sm font-semibold cursor-grab shrink-0 flex items-center justify-between leading-5"
          style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}
          onDoubleClick={() => setCollapsed((v) => !v)}
        >
          <span>Viewport</span>
          <div className="flex items-center gap-2 text-[10px] tabular-nums leading-5 -mt-px">
            <ResolutionSelector
              resolution={resolution}
              fixedResolution={fixedResolution}
              onResolutionChange={(res) => {
                setFixedResolution(res);
                if (res && data.onResizeNode) {
                  data.onResizeNode(res[0], res[1]);
                }
              }}
            />
            <span style={{ color: "var(--chrome-text-muted)" }}>
              {fps} FPS
            </span>
            <span className={`px-1.5 py-px rounded-full ${backendName === "WebGPU" ? "bg-emerald-900 text-emerald-400" : "bg-indigo-900 text-indigo-400"}`}>
              {backendName}
            </span>
            <button
              onClick={toggleFullscreen}
              className="transition-colors nodrag"
              style={{ color: "var(--chrome-text-secondary)" }}
              title="Fullscreen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </div>
        <div style={collapsed ? { height: 0, overflow: "hidden" } : { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {canvasContent}
        </div>
      </div>
    </>
  );
}
