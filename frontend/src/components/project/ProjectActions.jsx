import { useState, useCallback, useEffect, useRef } from "react";
import { TrashIcon, DownloadIcon, ForkIcon, FolderBrowseIcon } from "../icons.jsx";
import { exportProjectZip, listUploadAssets } from "../../engine/storage.js";
import { API_BASE } from "../../constants/api.js";

export default function ProjectActions({
  project: p,
  filesExpanded,
  onBrowseFiles,
  onDelete,
  onFork,
  onShowAssetExclude,
}) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportMenuPos, setExportMenuPos] = useState({ top: 0, right: 0 });
  const exportMenuRef = useRef(null);

  const handleExportClick = useCallback((e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setExportMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setExportMenuOpen((v) => !v);
  }, []);

  const doExport = useCallback(async (includeChat, excludeAssets = null) => {
    setExportMenuOpen(false);
    const filename = `${p.display_name || p.name}.zip`;
    if (!excludeAssets) {
      try {
        const url = `${API_BASE}/api/projects/${encodeURIComponent(p.name)}/export${includeChat ? "" : "?no_chat=1"}`;
        const res = await fetch(url);
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("zip") || contentType.includes("octet-stream")) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(blobUrl);
            return;
          }
        }
      } catch { /* backend unavailable */ }
    }
    try {
      const jsonStr = await exportProjectZip(p.name, { includeChat, excludeAssets });
      const blob = new Blob([jsonStr], { type: "application/json" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { /* ignore */ }
  }, [p.name, p.display_name]);

  const handleExportSelectAssets = useCallback(async (e) => {
    e.stopPropagation();
    setExportMenuOpen(false);
    try {
      const assets = await listUploadAssets();
      onShowAssetExclude(assets, doExport);
    } catch { /* ignore */ }
  }, [doExport, onShowAssetExclude]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [exportMenuOpen]);

  return (
    <span className="flex items-center gap-1 ml-2 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      <button
        onClick={onBrowseFiles}
        className={`transition-colors ${
          filesExpanded
            ? "text-indigo-400 hover:text-indigo-300"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
        title="Browse files"
      >
        <FolderBrowseIcon />
      </button>
      <div className="relative" ref={exportMenuRef}>
        <button
          onClick={handleExportClick}
          className={`transition-colors ${exportMenuOpen ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"}`}
          title="Export as ZIP"
        >
          <DownloadIcon />
        </button>
        {exportMenuOpen && (
          <div
            className="fixed flex flex-col rounded-lg shadow-xl py-1 text-xs z-50 whitespace-nowrap"
            style={{
              background: "var(--chrome-bg-elevated)",
              border: "1px solid var(--chrome-border)",
              top: exportMenuPos.top,
              right: exportMenuPos.right,
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); doExport(true); }}
              className="text-left px-3 py-1.5 hover:bg-zinc-700 transition-colors"
              style={{ color: "var(--chrome-text)" }}
            >
              Export (with chat)
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); doExport(false); }}
              className="text-left px-3 py-1.5 hover:bg-zinc-700 transition-colors"
              style={{ color: "var(--chrome-text)" }}
            >
              Export (no chat)
            </button>
            <button
              onClick={handleExportSelectAssets}
              className="text-left px-3 py-1.5 hover:bg-zinc-700 transition-colors"
              style={{ color: "var(--chrome-text)", borderTop: "1px solid var(--chrome-border)" }}
            >
              Export (select assets)
            </button>
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          const newName = prompt("New project name:", `${p.display_name || p.name} (copy)`);
          if (newName?.trim()) onFork?.(p.name, newName.trim());
        }}
        className="text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Fork project"
      >
        <ForkIcon />
      </button>
      <button
        onClick={onDelete}
        className="text-zinc-500 hover:text-red-400 transition-colors"
      >
        <TrashIcon />
      </button>
    </span>
  );
}
