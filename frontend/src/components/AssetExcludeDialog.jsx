import { useState, useMemo } from "react";

/**
 * Modal dialog for selecting which assets to exclude from export.
 * Used by both GitHub push and ZIP export flows.
 *
 * @param {object} props
 * @param {Array<{filename: string, category?: string, mime_type?: string, file_size?: number}>} props.assets
 * @param {Set<string>} [props.initialExcluded] - filenames already excluded
 * @param {(excludedSet: Set<string>) => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function AssetExcludeDialog({ assets, initialExcluded, onConfirm, onCancel }) {
  const [excluded, setExcluded] = useState(() => new Set(initialExcluded || []));

  const allFilenames = useMemo(() => assets.map((a) => a.filename), [assets]);
  const allIncluded = excluded.size === 0;
  const noneIncluded = excluded.size === allFilenames.length;

  const toggle = (filename) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const toggleAll = () => {
    if (allIncluded) {
      setExcluded(new Set(allFilenames));
    } else {
      setExcluded(new Set());
    }
  };

  const totalSize = assets.reduce((s, a) => s + (a.file_size || 0), 0);
  const excludedSize = assets
    .filter((a) => excluded.has(a.filename))
    .reduce((s, a) => s + (a.file_size || 0), 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="rounded-lg shadow-2xl w-[440px] max-h-[70vh] flex flex-col"
        style={{ background: "var(--chrome-bg)", border: "1px solid var(--chrome-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--chrome-text)" }}>
            Select Assets to Include
          </span>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toggle all */}
        <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--chrome-text-secondary)" }}>
            <input
              type="checkbox"
              checked={allIncluded}
              ref={(el) => { if (el) el.indeterminate = !allIncluded && !noneIncluded; }}
              onChange={toggleAll}
            />
            {allIncluded ? "Deselect all" : "Select all"}
          </label>
          <span className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>
            {excluded.size > 0
              ? `${excluded.size} excluded (${formatSize(excludedSize)} saved)`
              : `${assets.length} assets (${formatSize(totalSize)})`}
          </span>
        </div>

        {/* Asset list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {assets.map((asset) => (
            <label
              key={asset.filename}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!excluded.has(asset.filename)}
                onChange={() => toggle(asset.filename)}
              />
              <CategoryIcon category={asset.category} mimeType={asset.mime_type} />
              <span className="text-xs truncate flex-1" style={{ color: "var(--chrome-text)" }}>
                {asset.filename}
              </span>
              <span className="text-[10px] flex-shrink-0" style={{ color: "var(--chrome-text-muted)" }}>
                {formatSize(asset.file_size || 0)}
              </span>
            </label>
          ))}
          {assets.length === 0 && (
            <div className="text-xs text-center py-4" style={{ color: "var(--chrome-text-muted)" }}>
              No assets in this project
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--chrome-border)" }}>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{ color: "var(--chrome-text-muted)", background: "var(--input-bg)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(excluded)}
            className="px-4 py-1.5 rounded text-xs font-semibold transition-colors"
            style={{ background: "#238636", color: "#fff" }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryIcon({ category, mimeType }) {
  const type = category || (mimeType ? mimeType.split("/")[0] : "unknown");
  const icons = {
    image: "🖼",
    video: "🎬",
    audio: "🔊",
  };
  return (
    <span className="text-xs flex-shrink-0 w-4 text-center">
      {icons[type] || "📄"}
    </span>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
