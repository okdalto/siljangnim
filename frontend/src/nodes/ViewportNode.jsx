import { memo, useCallback, useContext, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import ResolutionSelector from "../components/viewport/ResolutionSelector.jsx";
import useStopWheelPropagation from "../hooks/useStopWheelPropagation.js";
import MissingAssetsBar from "../components/MissingAssetsBar.jsx";
import { useCollapsedState } from "../hooks/useCollapsedState.js";
import useEngineInit from "./viewport/useEngineInit.js";
import useSceneLoader from "./viewport/useSceneLoader.js";
import useCanvasResize from "./viewport/useCanvasResize.js";
import useViewportInput from "./viewport/useViewportInput.js";
import SceneContext from "../contexts/SceneContext.js";
import EngineContext from "../contexts/EngineContext.js";

function ViewportNode({ id, data, standalone = false, hideHeader = false }) {
  const { sceneJSON, paused, backendTarget, safeModeActive } = useContext(SceneContext);
  const parentEngineRef = useContext(EngineContext);
  const { onError } = data;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useCollapsedState(data.initialCollapsed, data.onCollapsedChange);

  // Engine lifecycle
  const { engineRef, fps, backendName, error, setError, missingAssets, setMissingAssets } =
    useEngineInit(canvasRef, { backendTarget: data.backendTarget, onError });

  // Scene loading + pause + backend switching
  useSceneLoader(engineRef, { sceneJSON, paused, backendTarget, parentEngineRef, setError });

  // Canvas resize (fixed vs auto)
  const { resolution, fixedResolution, setFixedResolution } =
    useCanvasResize(engineRef, containerRef, {
      initialFixedResolution: data.initialFixedResolution,
      onFixedResolutionChange: data.onFixedResolutionChange,
    });

  // Input handlers
  const {
    handleMouseMove, handleMouseDown, handleMouseUp,
    handleMouseEnter, handleMouseLeave,
    handleTouchStart, handleTouchMove, handleTouchEnd,
    handleKeyDown, handleKeyUp, handleBlur,
    toggleFullscreen,
  } = useViewportInput(engineRef, canvasRef, containerRef);

  useStopWheelPropagation(containerRef);

  const reloadScene = useCallback(() => {
    const engine = engineRef.current;
    if (engine && sceneJSON) {
      setError(null);
      engine.loadScene(sceneJSON);
    }
  }, [engineRef, sceneJSON, setError]);

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
            const engine = engineRef.current;
            if (engine && sceneJSON) {
              engine.loadScene(sceneJSON);
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
        {!hideHeader && (
        <div className="flex items-center justify-between px-3 py-1 text-[10px] tabular-nums shrink-0" style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}>
          <span className="font-semibold text-xs">Viewport</span>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--chrome-text-muted)" }}>{fps} FPS</span>
            <span className={`px-1.5 py-px rounded-full ${backendName === "WebGPU" ? "bg-emerald-900 text-emerald-400" : "bg-indigo-900 text-indigo-400"}`}>{backendName}</span>
            <button onClick={reloadScene} className="p-2 -m-1 transition-colors" style={{ color: "var(--chrome-text-secondary)" }} title="Reload scene">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
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
              onClick={reloadScene}
              className="transition-colors nodrag"
              style={{ color: "var(--chrome-text-secondary)" }}
              title="Reload scene"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
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

export default memo(ViewportNode);
