import { memo, useCallback, useRef } from "react";
import { ASSET_CATEGORY } from "../engine/assetDescriptor.js";

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
      {/* Thumbnail */}
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

      {/* Info */}
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

      {/* Status dot */}
      {processingStatus === "processing" && (
        <div className="w-2 h-2 border border-yellow-500 border-t-yellow-300 rounded-full animate-spin flex-shrink-0" />
      )}

      {/* Delete button */}
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

function AssetManagerPanel({ isOpen, isMobile, assets, onDelete, onSelect, onUpload }) {
  const inputRef = useRef(null);

  const handleFileChange = useCallback((e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    onUpload?.(files);
    e.target.value = "";
  }, [onUpload]);

  const assetList = [];
  if (assets) {
    for (const [, desc] of assets) {
      assetList.push(desc);
    }
  }
  // Sort newest first
  assetList.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return (
    <div
      className={`fixed right-0 z-30 flex flex-col overflow-hidden ${isMobile ? "top-10 bottom-20" : "top-10 bottom-10"}`}
      style={{
        width: isOpen ? (isMobile ? "100%" : 240) : 0,
        background: "var(--chrome-bg)",
        borderLeft: isOpen && !isMobile ? "1px solid var(--chrome-border)" : "none",
        transition: "width 0.2s ease",
      }}
    >
      {isOpen && (
        <>
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--chrome-border)" }}
          >
            <span className="text-xs font-medium" style={{ color: "var(--chrome-text)" }}>
              Assets ({assetList.length})
            </span>
            <button
              onClick={() => inputRef.current?.click()}
              className="text-[10px] px-2 py-1 rounded transition-colors"
              style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
            >
              Upload
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Asset list */}
          <div className="flex-1 overflow-y-auto p-1">
            {assetList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <span className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>
                  No assets yet. Upload files or attach them in the chat.
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

export default memo(AssetManagerPanel);
