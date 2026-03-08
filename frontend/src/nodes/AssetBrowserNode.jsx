import { useState, useCallback, useRef } from "react";
import { NodeResizer } from "@xyflow/react";
import { ASSET_CATEGORY } from "../engine/assetDescriptor.js";
import useStopWheelPropagation from "../hooks/useStopWheelPropagation.js";

const CATEGORY_ICONS = {
  [ASSET_CATEGORY.IMAGE]: "\u{1F5BC}",
  [ASSET_CATEGORY.AUDIO]: "\u{1F3B5}",
  [ASSET_CATEGORY.VIDEO]: "\u{1F3AC}",
  [ASSET_CATEGORY.MODEL_3D]: "\u{1F4E6}",
  [ASSET_CATEGORY.FONT]: "Aa",
  [ASSET_CATEGORY.SVG]: "\u{25C7}",
  [ASSET_CATEGORY.DATA]: "\u{1F4C4}",
  [ASSET_CATEGORY.UNKNOWN]: "\u{1F4CE}",
};

function AssetItem({ descriptor, onDelete, onSelect }) {
  const { id, semanticName, filename, category, previewUrl, thumbnailUrl, technicalInfo, processingStatus } = descriptor;
  const thumb = thumbnailUrl || previewUrl;

  return (
    <div
      onClick={() => onSelect?.(id)}
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors group"
      style={{ background: "transparent" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div
        className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ background: "var(--input-bg)" }}
      >
        {thumb ? (
          <img src={thumb} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm">{CATEGORY_ICONS[category] || CATEGORY_ICONS[ASSET_CATEGORY.UNKNOWN]}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[11px] truncate" style={{ color: "var(--chrome-text)" }}>
          {semanticName}
        </div>
        <div className="text-[9px] truncate" style={{ color: "var(--chrome-text-muted)" }}>
          {filename}
          {technicalInfo?.width && technicalInfo?.height ? ` \u2022 ${technicalInfo.width}\u00D7${technicalInfo.height}` : ""}
          {technicalInfo?.duration ? ` \u2022 ${technicalInfo.duration.toFixed(1)}s` : ""}
        </div>
      </div>

      {processingStatus === "processing" && (
        <div className="w-2 h-2 border border-yellow-500 border-t-yellow-300 rounded-full animate-spin flex-shrink-0" />
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onDelete?.(id); }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--chrome-text-muted)" }}
        title="Delete asset"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function AssetBrowserNode({ data }) {
  const { assets, onDelete, onSelect, onUpload } = data;
  const [collapsed, setCollapsed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useStopWheelPropagation(scrollRef);

  const handleFileChange = useCallback((e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    onUpload?.(files);
    e.target.value = "";
  }, [onUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer?.files?.length) {
      onUpload?.(e.dataTransfer.files);
    }
  }, [onUpload]);

  const assetList = [];
  if (assets) {
    for (const [, desc] of assets) {
      assetList.push(desc);
    }
  }
  assetList.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return (
    <div
      className="node-container w-full h-full flex flex-col overflow-hidden rounded-xl shadow-2xl"
      style={{ background: "var(--node-bg)", border: "1px solid var(--node-border)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <NodeResizer minWidth={200} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />

      {/* Header */}
      <div
        className="px-4 py-2 text-sm font-semibold flex items-center justify-between cursor-grab"
        style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}
        onDoubleClick={() => setCollapsed((v) => !v)}
      >
        <span>Assets ({assetList.length})</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-zinc-400 hover:text-zinc-200 transition-colors p-0.5 rounded hover:bg-zinc-700"
          title="Upload files"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {!collapsed && (
        <>
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-50 bg-indigo-600/20 border-2 border-dashed border-indigo-400 rounded-xl flex items-center justify-center pointer-events-none">
              <div className="text-indigo-300 text-sm font-medium flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Drop files here
              </div>
            </div>
          )}

          {/* Asset list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-1 nowheel nodrag">
            {assetList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <span className="text-[11px]" style={{ color: "var(--chrome-text-muted)" }}>
                  No assets yet. Upload files or drag & drop here.
                </span>
              </div>
            ) : (
              assetList.map((desc) => (
                <AssetItem
                  key={desc.id}
                  descriptor={desc}
                  onDelete={onDelete}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
