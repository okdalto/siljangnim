import { memo, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import { ASSET_CATEGORY } from "../engine/assetDescriptor.js";

// ---- Category icons ----

const CATEGORY_ICONS = {
  [ASSET_CATEGORY.IMAGE]: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  [ASSET_CATEGORY.AUDIO]: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  ),
  [ASSET_CATEGORY.VIDEO]: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="15" height="16" rx="2" />
      <path d="m17 8 5-3v14l-5-3" />
    </svg>
  ),
  [ASSET_CATEGORY.MODEL_3D]: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
    </svg>
  ),
  [ASSET_CATEGORY.FONT]: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
    </svg>
  ),
  [ASSET_CATEGORY.SVG]: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  [ASSET_CATEGORY.DATA]: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
};

const STATUS_COLORS = {
  pending: "var(--chrome-text-muted)",
  processing: "#f59e0b",
  restoring: "#60a5fa",
  ready: "#22c55e",
  error: "#ef4444",
  missing: "#ef4444",
};

// ---- Compact tech info display ----

function TechSummary({ descriptor }) {
  const { category, technicalInfo: t } = descriptor;
  if (!t || Object.keys(t).length === 0) return null;

  let text = "";
  switch (category) {
    case ASSET_CATEGORY.IMAGE:
      if (t.width && t.height) text = `${t.width}×${t.height}`;
      if (t.hasAlpha) text += " α";
      break;
    case ASSET_CATEGORY.AUDIO:
      if (t.duration) text = `${t.duration.toFixed(1)}s`;
      if (t.bpm) text += ` ${t.bpm}bpm`;
      break;
    case ASSET_CATEGORY.VIDEO:
      if (t.width && t.height) text = `${t.width}×${t.height}`;
      if (t.duration) text += ` ${t.duration.toFixed(1)}s`;
      break;
    case ASSET_CATEGORY.MODEL_3D:
      if (t.vertexCount) text = `${(t.vertexCount / 1000).toFixed(1)}k verts`;
      if (t.materialCount) text += ` ${t.materialCount} mat`;
      break;
    case ASSET_CATEGORY.FONT:
      if (t.family) text = t.family;
      break;
    case ASSET_CATEGORY.SVG:
      if (t.elementCount) text = `${t.elementCount} elements`;
      break;
    case ASSET_CATEGORY.DATA:
      if (t.format) text = t.format.toUpperCase();
      if (t.lineCount) text += ` ${t.lineCount} lines`;
      if (t.keyCount) text += ` ${t.keyCount} keys`;
      break;
  }

  return text ? (
    <span className="text-[9px] truncate" style={{ color: "var(--chrome-text-muted)" }}>{text}</span>
  ) : null;
}

// ---- Preview thumbnail ----

function AssetPreview({ descriptor }) {
  const { category, previewUrl, thumbnailUrl, filename, processingStatus } = descriptor;

  // Loading state — asset exists in saved state, blob URL being regenerated
  if (processingStatus === "restoring") {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 opacity-60">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-blue-200 rounded-full animate-spin" />
        <span className="text-[9px]" style={{ color: "var(--chrome-text-muted)" }}>Loading...</span>
      </div>
    );
  }

  // Missing state — asset not found in IndexedDB
  if (processingStatus === "missing") {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 p-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-[9px] text-center leading-tight" style={{ color: "#ef4444" }}>
          Asset missing
        </span>
        <span className="text-[8px] text-center truncate max-w-full" style={{ color: "var(--chrome-text-muted)" }}>
          {filename}
        </span>
      </div>
    );
  }

  const url = thumbnailUrl || previewUrl;

  if (url && (category === ASSET_CATEGORY.IMAGE || category === ASSET_CATEGORY.VIDEO || category === ASSET_CATEGORY.SVG)) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-1 overflow-hidden">
        <img
          src={url}
          alt={filename}
          className="max-w-full max-h-full object-contain rounded"
          style={{ imageRendering: "auto" }}
        />
      </div>
    );
  }

  if (category === ASSET_CATEGORY.DATA && descriptor.technicalInfo?.preview) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden p-1.5">
        <pre
          className="text-[7px] leading-[1.3] whitespace-pre-wrap break-all h-full overflow-hidden"
          style={{ color: "var(--chrome-text-muted)", fontFamily: "monospace" }}
        >
          {descriptor.technicalInfo.preview.slice(0, 500)}
        </pre>
      </div>
    );
  }

  if (category === ASSET_CATEGORY.AUDIO && descriptor.processorOutputs?.length > 0) {
    const waveform = descriptor.processorOutputs.find((o) => o.filename === "spectrogram.png");
    if (waveform) {
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center p-1 overflow-hidden">
          <img src={waveform.url} alt="waveform" className="max-w-full max-h-full object-contain rounded opacity-70" />
        </div>
      );
    }
  }

  // Fallback: large category icon
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center opacity-20">
      <div style={{ transform: "scale(3)" }}>
        {CATEGORY_ICONS[category] || CATEGORY_ICONS[ASSET_CATEGORY.IMAGE]}
      </div>
    </div>
  );
}

// ---- Main component ----

function AssetNode({ data }) {
  const { descriptor, onSelect, onRename, onDelete, onAction } = data;
  if (!descriptor) return null;

  const { semanticName, filename, category, processingStatus } = descriptor;
  const icon = CATEGORY_ICONS[category] || null;
  const statusColor = STATUS_COLORS[processingStatus] || STATUS_COLORS.pending;

  const handleDoubleClickName = useCallback(() => {
    const newName = window.prompt("Rename asset:", semanticName);
    if (newName && newName.trim() && newName.trim() !== semanticName) {
      onRename?.(descriptor.id, newName.trim());
    }
  }, [descriptor.id, semanticName, onRename]);

  const handleClick = useCallback(() => {
    onSelect?.(descriptor.id);
  }, [descriptor.id, onSelect]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete?.(descriptor.id);
  }, [descriptor.id, onDelete]);

  return (
    <div
      className="group w-full h-full flex flex-col overflow-hidden rounded-xl shadow-2xl"
      style={{ background: "var(--node-bg)", border: "1px solid var(--node-border)" }}
      onClick={handleClick}
    >
      <NodeResizer
        minWidth={120}
        minHeight={100}
        lineStyle={{ borderColor: "transparent" }}
        handleStyle={{ opacity: 0 }}
      />

      {/* Header */}
      <div
        className="px-2 py-1.5 text-[11px] font-medium flex items-center gap-1.5 cursor-grab"
        style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}
      >
        <span style={{ color: statusColor }}>{icon}</span>
        <span
          className="flex-1 truncate"
          onDoubleClick={handleDoubleClickName}
          title={`${semanticName} (${filename})`}
        >
          {semanticName}
        </span>
        {processingStatus === "processing" && (
          <div className="w-2.5 h-2.5 border border-yellow-500 border-t-yellow-300 rounded-full animate-spin flex-shrink-0" />
        )}
        {processingStatus === "restoring" && (
          <div className="w-2.5 h-2.5 border border-blue-400 border-t-blue-200 rounded-full animate-spin flex-shrink-0" />
        )}
        {processingStatus === "missing" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
        <button
          onClick={handleDelete}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
          style={{ color: "var(--chrome-text-muted)", lineHeight: 1 }}
          title="Delete asset"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Preview area */}
      <AssetPreview descriptor={descriptor} />

      {/* Footer: tech summary */}
      <div
        className="px-2 py-1 flex items-center justify-between gap-1"
        style={{ borderTop: "1px solid var(--node-border)" }}
      >
        <TechSummary descriptor={descriptor} />
        <span className="text-[9px] truncate opacity-50" style={{ color: "var(--chrome-text-muted)" }}>
          {filename}
        </span>
      </div>
    </div>
  );
}

export default memo(AssetNode);
