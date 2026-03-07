import { useState, useEffect, useRef, useCallback } from "react";

const TAB_IDS = ["visual", "shader", "uniforms", "timeline", "prompts", "assets", "backend"];
const TAB_LABELS = { visual: "Visual", shader: "Shader", uniforms: "Uniforms", timeline: "Timeline", prompts: "Prompts", assets: "Assets", backend: "Backend" };

// ---------------------------------------------------------------------------
// Diff line renderer for shader code
// ---------------------------------------------------------------------------

function DiffView({ diff, label }) {
  if (!diff || !diff.changed) {
    return (
      <div className="px-3 py-2 text-xs" style={{ color: "var(--chrome-text-muted)" }}>
        No changes in {label}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="text-xs font-medium px-3 py-1" style={{ color: "var(--chrome-text-secondary)" }}>
        {label}
      </div>
      <div className="font-mono text-[11px] leading-5 overflow-x-auto">
        {diff.diff.map((entry, i) => {
          let bg = "transparent";
          let prefix = " ";
          let color = "var(--chrome-text)";
          if (entry.type === "add") {
            bg = "rgba(34,197,94,0.1)";
            prefix = "+";
            color = "#4ade80";
          } else if (entry.type === "remove") {
            bg = "rgba(239,68,68,0.1)";
            prefix = "-";
            color = "#f87171";
          }
          return (
            <div key={i} className="px-3 whitespace-pre" style={{ background: bg, color }}>
              <span className="inline-block w-4 select-none opacity-60">{prefix}</span>
              {entry.line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before/After slider overlay component
// ---------------------------------------------------------------------------

function BeforeAfterSlider({ thumbnailA, thumbnailB, labelA, labelB }) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50); // percentage
  const dragging = useRef(false);

  const handleMove = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onPointerDown = useCallback((e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handleMove(e.clientX);
  }, [handleMove]);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    handleMove(e.clientX);
  }, [handleMove]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden cursor-col-resize select-none"
      style={{ aspectRatio: "16/9", background: "var(--input-bg)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Image B (full, behind) */}
      <img src={thumbnailB} alt={labelB} className="absolute inset-0 w-full h-full object-cover" />
      {/* Image A (clipped from left) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img src={thumbnailA} alt={labelA} className="absolute inset-0 w-full h-full object-cover" style={{ width: containerRef.current ? containerRef.current.offsetWidth : "100%", maxWidth: "none" }} />
      </div>
      {/* Labels */}
      <div className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>{labelA}</div>
      <div className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>{labelB}</div>
      {/* Divider handle */}
      <div className="absolute top-0 bottom-0" style={{ left: `${position}%`, transform: "translateX(-50%)" }}>
        <div className="w-0.5 h-full" style={{ background: "#fff", boxShadow: "0 0 4px rgba(0,0,0,0.5)" }} />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#fff", boxShadow: "0 0 6px rgba(0,0,0,0.4)" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#333" strokeWidth="1.5">
            <path d="M3 6h6M3 6l2-2M3 6l2 2M9 6l-2-2M9 6l-2 2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual tab (thumbnail side by side + overlay)
// ---------------------------------------------------------------------------

function VisualTab({ result }) {
  const [viewMode, setViewMode] = useState("sideBySide"); // "sideBySide" | "overlay"
  const hasBothThumbs = !!(result.thumbnailA && result.thumbnailB);

  return (
    <div className="p-4">
      {/* Diff summary */}
      {result.diffSummary && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs leading-relaxed" style={{ background: "var(--input-bg)", color: "var(--chrome-text-secondary)", border: "1px solid var(--chrome-border)" }}>
          <span className="font-medium" style={{ color: "var(--chrome-text)" }}>Summary: </span>
          {result.diffSummary}
        </div>
      )}

      {/* View mode toggle */}
      {hasBothThumbs && (
        <div className="flex justify-end mb-3">
          <div className="flex rounded-md overflow-hidden text-[10px]" style={{ border: "1px solid var(--chrome-border)" }}>
            <button
              onClick={() => setViewMode("sideBySide")}
              className="px-2.5 py-1 transition-colors"
              style={{
                background: viewMode === "sideBySide" ? "var(--accent-color, #6366f1)" : "var(--input-bg)",
                color: viewMode === "sideBySide" ? "#fff" : "var(--chrome-text-muted)",
              }}
            >
              Side by Side
            </button>
            <button
              onClick={() => setViewMode("overlay")}
              className="px-2.5 py-1 transition-colors"
              style={{
                background: viewMode === "overlay" ? "var(--accent-color, #6366f1)" : "var(--input-bg)",
                color: viewMode === "overlay" ? "#fff" : "var(--chrome-text-muted)",
              }}
            >
              Overlay
            </button>
          </div>
        </div>
      )}

      {/* Overlay mode */}
      {hasBothThumbs && viewMode === "overlay" && (
        <BeforeAfterSlider
          thumbnailA={result.thumbnailA}
          thumbnailB={result.thumbnailB}
          labelA={result.nodeA?.title || "A"}
          labelB={result.nodeB?.title || "B"}
        />
      )}

      {/* Side by side mode (or fallback when not both thumbnails) */}
      {(viewMode === "sideBySide" || !hasBothThumbs) && (
        <div className="flex gap-4 items-start">
          <div className="flex-1 text-center">
            <div className="text-xs mb-2 font-medium" style={{ color: "var(--chrome-text-secondary)" }}>
              {result.nodeA?.title || "Node A"}
            </div>
            {result.thumbnailA ? (
              <img src={result.thumbnailA} alt="A" className="w-full rounded-lg border" style={{ borderColor: "var(--chrome-border)" }} />
            ) : (
              <div className="w-full h-48 rounded-lg flex items-center justify-center" style={{ background: "var(--input-bg)", color: "var(--chrome-text-muted)" }}>
                No thumbnail
              </div>
            )}
            <div className="text-[10px] mt-1" style={{ color: "var(--chrome-text-muted)" }}>
              {result.nodeA?.createdAt ? new Date(result.nodeA.createdAt).toLocaleString() : ""}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-12">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--chrome-text-muted)" }}>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <div className="flex-1 text-center">
            <div className="text-xs mb-2 font-medium" style={{ color: "var(--chrome-text-secondary)" }}>
              {result.nodeB?.title || "Node B"}
            </div>
            {result.thumbnailB ? (
              <img src={result.thumbnailB} alt="B" className="w-full rounded-lg border" style={{ borderColor: "var(--chrome-border)" }} />
            ) : (
              <div className="w-full h-48 rounded-lg flex items-center justify-center" style={{ background: "var(--input-bg)", color: "var(--chrome-text-muted)" }}>
                No thumbnail
              </div>
            )}
            <div className="text-[10px] mt-1" style={{ color: "var(--chrome-text-muted)" }}>
              {result.nodeB?.createdAt ? new Date(result.nodeB.createdAt).toLocaleString() : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shader tab
// ---------------------------------------------------------------------------

function ShaderTab({ result }) {
  const { shaders } = result;
  if (!shaders.hasChanges) {
    return <div className="p-4 text-xs" style={{ color: "var(--chrome-text-muted)" }}>No shader changes</div>;
  }
  return (
    <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
      <DiffView diff={shaders.setup} label="setup" />
      <DiffView diff={shaders.render} label="render" />
      <DiffView diff={shaders.cleanup} label="cleanup" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uniforms tab
// ---------------------------------------------------------------------------

function UniformsTab({ result }) {
  const { uniforms } = result;
  if (!uniforms.hasChanges) {
    return <div className="p-4 text-xs" style={{ color: "var(--chrome-text-muted)" }}>No uniform changes</div>;
  }

  return (
    <div className="p-4 space-y-2">
      {uniforms.changes.map((c, i) => (
        <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)" }}>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            c.type === "added" ? "bg-green-900 text-green-300" :
            c.type === "removed" ? "bg-red-900 text-red-300" :
            "bg-amber-900 text-amber-300"
          }`}>{c.type}</span>
          <span className="font-mono font-medium" style={{ color: "var(--chrome-text)" }}>{c.uniform}</span>
          {c.type === "changed" && (
            <span style={{ color: "var(--chrome-text-muted)" }}>
              {formatValue(c.oldValue)} → {formatValue(c.newValue)}
            </span>
          )}
          {c.type === "added" && (
            <span style={{ color: "#4ade80" }}>{formatValue(c.newValue)}</span>
          )}
          {c.type === "removed" && (
            <span style={{ color: "#f87171" }}>{formatValue(c.oldValue)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function formatValue(val) {
  if (val === null || val === undefined) return "null";
  if (Array.isArray(val)) return `[${val.map((v) => typeof v === "number" ? v.toFixed(2) : v).join(", ")}]`;
  if (typeof val === "number") return val.toFixed(3);
  return String(val);
}

// ---------------------------------------------------------------------------
// Timeline tab
// ---------------------------------------------------------------------------

function TimelineTab({ result }) {
  const { timeline } = result;
  if (!timeline.hasChanges) {
    return <div className="p-4 text-xs" style={{ color: "var(--chrome-text-muted)" }}>No timeline changes</div>;
  }

  return (
    <div className="p-4 space-y-3">
      {timeline.durationChanged && (
        <div className="text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)", color: "var(--chrome-text)" }}>
          Duration: {timeline.oldDuration}s → {timeline.newDuration}s
        </div>
      )}
      {timeline.loopChanged && (
        <div className="text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)", color: "var(--chrome-text)" }}>
          Loop: {String(timeline.oldLoop)} → {String(timeline.newLoop)}
        </div>
      )}
      {timeline.trackChanges.map((tc, i) => (
        <div key={i} className="text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)" }}>
          <span className="font-mono font-medium" style={{ color: "var(--chrome-text)" }}>{tc.track}</span>
          <span className="ml-2" style={{ color: "var(--chrome-text-muted)" }}>
            {tc.oldKeyframes.length} → {tc.newKeyframes.length} keyframes
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompts tab
// ---------------------------------------------------------------------------

function PromptsTab({ result }) {
  const { prompts } = result;
  if (!prompts.hasChanges) {
    return <div className="p-4 text-xs" style={{ color: "var(--chrome-text-muted)" }}>No prompt changes</div>;
  }

  return (
    <div className="p-4 space-y-2">
      <div className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>
        Messages: {prompts.totalA} → {prompts.totalB}
      </div>
      {prompts.newMessages.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "#4ade80" }}>New messages:</div>
          {prompts.newMessages.map((msg, i) => (
            <div key={i} className="text-xs px-3 py-2 mb-1 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "var(--chrome-text)" }}>
              <span className="font-medium">{msg.role}:</span> {(msg.content || msg.text || "").slice(0, 200)}
            </div>
          ))}
        </div>
      )}
      {prompts.removedMessages.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "#f87171" }}>Removed messages:</div>
          {prompts.removedMessages.map((msg, i) => (
            <div key={i} className="text-xs px-3 py-2 mb-1 rounded" style={{ background: "rgba(239,68,68,0.1)", color: "var(--chrome-text)" }}>
              <span className="font-medium">{msg.role}:</span> {(msg.content || msg.text || "").slice(0, 200)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assets tab
// ---------------------------------------------------------------------------

function AssetsTab({ result }) {
  const { assets } = result;
  if (!assets || !assets.hasChanges) {
    return <div className="p-4 text-xs" style={{ color: "var(--chrome-text-muted)" }}>No asset changes</div>;
  }

  return (
    <div className="p-4 space-y-2">
      {assets.added.map((a, i) => (
        <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)" }}>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-900 text-green-300">added</span>
          <span className="font-mono font-medium" style={{ color: "var(--chrome-text)" }}>{a.descriptor?.semanticName || a.descriptor?.filename || a.id}</span>
          <span style={{ color: "var(--chrome-text-muted)" }}>{a.descriptor?.category}</span>
        </div>
      ))}
      {assets.removed.map((a, i) => (
        <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)" }}>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-900 text-red-300">removed</span>
          <span className="font-mono font-medium" style={{ color: "var(--chrome-text)" }}>{a.descriptor?.semanticName || a.descriptor?.filename || a.id}</span>
          <span style={{ color: "var(--chrome-text-muted)" }}>{a.descriptor?.category}</span>
        </div>
      ))}
      {assets.changed.map((a, i) => (
        <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)" }}>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-900 text-amber-300">changed</span>
          <span className="font-mono font-medium" style={{ color: "var(--chrome-text)" }}>{a.newDescriptor?.semanticName || a.newDescriptor?.filename || a.id}</span>
          <span style={{ color: "var(--chrome-text-muted)" }}>{a.newDescriptor?.category}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backend tab
// ---------------------------------------------------------------------------

function BackendTab({ result }) {
  const { backend } = result;
  if (!backend || !backend.hasChanges) {
    return <div className="p-4 text-xs" style={{ color: "var(--chrome-text-muted)" }}>No backend changes</div>;
  }

  return (
    <div className="p-4 space-y-3">
      {backend.targetChanged && (
        <div className="text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)", color: "var(--chrome-text)" }}>
          <span className="font-medium">Backend Target: </span>
          <span style={{ color: "#f87171" }}>{backend.oldTarget}</span>
          <span style={{ color: "var(--chrome-text-muted)" }}> → </span>
          <span style={{ color: "#4ade80" }}>{backend.newTarget}</span>
        </div>
      )}
      {backend.shaderLangChanged && (
        <div className="text-xs px-3 py-2 rounded" style={{ background: "var(--input-bg)", color: "var(--chrome-text)" }}>
          <span className="font-medium">Shader Language: </span>
          <span style={{ color: "#f87171" }}>{backend.oldShaderLang.toUpperCase()}</span>
          <span style={{ color: "var(--chrome-text-muted)" }}> → </span>
          <span style={{ color: "#4ade80" }}>{backend.newShaderLang.toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function VersionComparePanel({ result, loading, onClose }) {
  const [activeTab, setActiveTab] = useState("visual");

  // Clean up thumbnail URLs on unmount
  useEffect(() => {
    return () => {
      if (result?.thumbnailA) URL.revokeObjectURL(result.thumbnailA);
      if (result?.thumbnailB) URL.revokeObjectURL(result.thumbnailB);
    };
  }, [result]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
        <div className="text-sm" style={{ color: "var(--chrome-text)" }}>Loading comparison...</div>
      </div>
    );
  }

  if (!result) return null;

  // Count changes per tab for badges
  const badges = {
    visual: null,
    shader: result.shaders.hasChanges ? "!" : null,
    uniforms: result.uniforms.changes.length || null,
    timeline: result.timeline.hasChanges ? "!" : null,
    prompts: result.prompts.newMessages.length || null,
    assets: result.assets?.hasChanges ? (result.assets.added.length + result.assets.removed.length + result.assets.changed.length) || "!" : null,
    backend: result.backend?.hasChanges ? "!" : null,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--chrome-bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--chrome-border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: "var(--chrome-text)" }}>
            Compare Versions
          </span>
          <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>
            "{result.nodeA?.title}" vs "{result.nodeB?.title}"
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--chrome-text-secondary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
        {TAB_IDS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-2 text-xs font-medium relative transition-colors flex items-center gap-1.5"
            style={{
              color: activeTab === tab ? "var(--chrome-text)" : "var(--chrome-text-muted)",
              borderBottom: activeTab === tab ? "2px solid var(--accent-color, #6366f1)" : "2px solid transparent",
            }}
          >
            {TAB_LABELS[tab]}
            {badges[tab] && (
              <span className="w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold bg-indigo-600 text-white">
                {badges[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "visual" && <VisualTab result={result} />}
        {activeTab === "shader" && <ShaderTab result={result} />}
        {activeTab === "uniforms" && <UniformsTab result={result} />}
        {activeTab === "timeline" && <TimelineTab result={result} />}
        {activeTab === "prompts" && <PromptsTab result={result} />}
        {activeTab === "assets" && <AssetsTab result={result} />}
        {activeTab === "backend" && <BackendTab result={result} />}
      </div>
    </div>
  );
}
