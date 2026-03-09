import { useState, useCallback, useRef, useEffect } from "react";
import { NodeResizer } from "@xyflow/react";
import { ASSET_CATEGORY } from "../engine/assetDescriptor.js";
import useStopWheelPropagation from "../hooks/useStopWheelPropagation.js";
import { readUpload, listFiles, readTextFile } from "../engine/storage.js";

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

const MAX_TEXT_PREVIEW = 2000;

async function downloadUploadedFile(filename) {
  try {
    const upload = await readUpload(filename);
    const blob = new Blob([upload.data], { type: upload.mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* ignore */ }
}

function AssetItem({ descriptor, onDelete, onClick }) {
  const { id, semanticName, filename, category, previewUrl, thumbnailUrl, technicalInfo, processingStatus } = descriptor;
  const thumb = thumbnailUrl || previewUrl;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      onClick={() => onClick?.(id)}
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors group"
      style={{ background: "transparent" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div
        className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ background: "var(--input-bg)" }}
      >
        {thumb && !imgFailed ? (
          <img src={thumb} alt={filename} className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
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
        onClick={(e) => { e.stopPropagation(); downloadUploadedFile(filename); }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--chrome-text-muted)" }}
        title="Download"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

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

// --- Asset Viewer ---

function AssetViewer({ descriptor, onBack, onDownload }) {
  const { filename, category, previewUrl, thumbnailUrl, technicalInfo, semanticName, fileSize } = descriptor;
  const scrollRef = useRef(null);
  useStopWheelPropagation(scrollRef);

  const url = previewUrl || thumbnailUrl;

  // Lazy-load preview text for DATA files when technicalInfo.preview is missing
  const [lazyPreview, setLazyPreview] = useState(null);
  useEffect(() => {
    if (category !== ASSET_CATEGORY.DATA) return;
    if (technicalInfo?.preview) return; // already have it
    let cancelled = false;
    (async () => {
      try {
        const entry = await readUpload(filename);
        const text = new TextDecoder("utf-8").decode(entry.data);
        if (cancelled) return;
        const ext = (filename.split(".").pop() || "").toLowerCase();
        let preview = text;
        if (ext === "json") {
          try {
            preview = JSON.stringify(JSON.parse(text), null, 2);
          } catch { /* use raw text */ }
        }
        setLazyPreview(preview);
      } catch { /* file not available */ }
    })();
    return () => { cancelled = true; };
  }, [category, filename, technicalInfo?.preview]);

  const previewText = technicalInfo?.preview || lazyPreview;

  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div ref={scrollRef} className="flex-1 flex flex-col overflow-hidden nowheel nodrag">
      {/* Viewer toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--node-border)" }}>
        <button
          onClick={onBack}
          className="text-zinc-400 hover:text-zinc-200 transition-colors p-0.5"
          title="Back to list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[11px] truncate flex-1" style={{ color: "var(--chrome-text)" }}>
          {semanticName}
        </span>
        <button
          onClick={onDownload}
          className="text-zinc-400 hover:text-zinc-200 transition-colors p-0.5"
          title="Download"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto p-2 flex items-center justify-center">
        {(category === ASSET_CATEGORY.IMAGE || category === ASSET_CATEGORY.SVG) && url ? (
          <img
            src={url}
            alt={filename}
            className="max-w-full max-h-full object-contain rounded"
            style={{ imageRendering: "auto" }}
          />
        ) : category === ASSET_CATEGORY.VIDEO && url ? (
          <video
            src={url}
            controls
            className="max-w-full max-h-full rounded"
            style={{ outline: "none" }}
          />
        ) : category === ASSET_CATEGORY.AUDIO && url ? (
          <div className="w-full px-2">
            <audio src={url} controls className="w-full" />
          </div>
        ) : category === ASSET_CATEGORY.DATA && previewText ? (
          <pre
            className="text-[10px] leading-relaxed whitespace-pre-wrap break-all w-full h-full overflow-auto p-2 rounded"
            style={{ color: "var(--chrome-text-muted)", background: "var(--input-bg)", fontFamily: "monospace" }}
          >
            {previewText.slice(0, MAX_TEXT_PREVIEW)}
            {previewText.length > MAX_TEXT_PREVIEW && "\n\n... (truncated)"}
          </pre>
        ) : (
          <div className="text-center" style={{ color: "var(--chrome-text-muted)" }}>
            <span className="text-3xl block mb-2">{CATEGORY_ICONS[category] || CATEGORY_ICONS[ASSET_CATEGORY.UNKNOWN]}</span>
            <span className="text-[11px]">No preview available</span>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-2 py-1 flex-shrink-0 flex items-center justify-between" style={{ borderTop: "1px solid var(--node-border)" }}>
        <span className="text-[9px] truncate" style={{ color: "var(--chrome-text-muted)" }}>
          {filename}
        </span>
        <span className="text-[9px] flex-shrink-0" style={{ color: "var(--chrome-text-muted)" }}>
          {formatSize(fileSize)}
        </span>
      </div>
    </div>
  );
}

// --- Workspace file icons by extension ---
const WS_FILE_ICONS = {
  json: "\u{1F4CB}", glsl: "\u{1F308}", wgsl: "\u{1F308}", js: "\u{1F4DC}",
  ts: "\u{1F4DC}", txt: "\u{1F4C4}", md: "\u{1F4DD}", csv: "\u{1F4CA}",
  html: "\u{1F310}", css: "\u{1F3A8}",
};

async function downloadWorkspaceFile(filename) {
  try {
    const text = await readTextFile(filename);
    const content = typeof text === "string" ? text : JSON.stringify(text, null, 2);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* ignore */ }
}

function WorkspaceFileItem({ filename, onClick, onDelete }) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const icon = WS_FILE_ICONS[ext] || "\u{1F4C4}";

  return (
    <div
      onClick={() => onClick?.(filename)}
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors group"
      style={{ background: "transparent" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div
        className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center"
        style={{ background: "var(--input-bg)" }}
      >
        <span className="text-sm">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] truncate" style={{ color: "var(--chrome-text)" }}>
          {filename}
        </div>
        <div className="text-[9px]" style={{ color: "var(--chrome-text-muted)" }}>workspace</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); downloadWorkspaceFile(filename); }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--chrome-text-muted)" }}
        title="Download"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(filename); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--chrome-text-muted)" }}
          title="Delete file"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function WorkspaceFileViewer({ filename, onBack }) {
  const scrollRef = useRef(null);
  useStopWheelPropagation(scrollRef);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const text = await readTextFile(filename);
        if (!cancelled) setContent(typeof text === "string" ? text : JSON.stringify(text, null, 2));
      } catch {
        if (!cancelled) setContent("(unable to read file)");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filename]);

  return (
    <div ref={scrollRef} className="flex-1 flex flex-col overflow-hidden nowheel nodrag">
      <div className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--node-border)" }}>
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-200 transition-colors p-0.5" title="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[11px] truncate flex-1" style={{ color: "var(--chrome-text)" }}>{filename}</span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <span className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>Loading...</span>
        ) : (
          <pre
            className="text-[10px] leading-relaxed whitespace-pre-wrap break-all w-full h-full overflow-auto p-2 rounded"
            style={{ color: "var(--chrome-text-muted)", background: "var(--input-bg)", fontFamily: "monospace" }}
          >
            {(content || "").slice(0, 5000)}
            {(content || "").length > 5000 && "\n\n... (truncated)"}
          </pre>
        )}
      </div>
    </div>
  );
}

// Internal files to hide from the workspace list
const HIDDEN_WS_FILES = new Set(["workspace_state.json"]);

function WorkspaceFilesSection({ version, onDeleteFile }) {
  const [files, setFiles] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listFiles();
        if (!cancelled) setFiles(all.filter((f) => !HIDDEN_WS_FILES.has(f)));
      } catch {
        if (!cancelled) setFiles([]);
      }
    })();
    return () => { cancelled = true; };
  }, [version]);

  if (viewingFile) {
    return <WorkspaceFileViewer filename={viewingFile} onBack={() => setViewingFile(null)} />;
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 px-3 py-1 cursor-pointer select-none"
        style={{ borderTop: "1px solid var(--node-border)", color: "var(--chrome-text-muted)" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="text-[10px] font-medium">Scene Files ({files.length})</span>
      </div>
      {!collapsed && files.length > 0 && (
        <div className="pb-1">
          {files.map((f) => (
            <WorkspaceFileItem
              key={f}
              filename={f}
              onClick={setViewingFile}
              onDelete={onDeleteFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function AssetBrowserNode({ data }) {
  const { assets, onDelete, onSelect, onUpload, workspaceFilesVersion, onDeleteWorkspaceFile } = data;
  const [collapsed, setCollapsed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewingId, setViewingId] = useState(null);
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

  const handleDownload = useCallback(async () => {
    if (!viewingId || !assets) return;
    const desc = assets.get(viewingId);
    if (!desc) return;
    try {
      const upload = await readUpload(desc.filename);
      const blob = new Blob([upload.data], { type: upload.mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = desc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: try previewUrl
      if (desc.previewUrl) {
        const a = document.createElement("a");
        a.href = desc.previewUrl;
        a.download = desc.filename;
        a.click();
      }
    }
  }, [viewingId, assets]);

  const assetList = [];
  if (assets) {
    for (const [, desc] of assets) {
      assetList.push(desc);
    }
  }
  assetList.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const viewingDescriptor = viewingId && assets ? assets.get(viewingId) : null;
  // If the viewed asset was deleted, go back to list
  if (viewingId && !viewingDescriptor) {
    setViewingId(null);
  }

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

          {viewingDescriptor ? (
            <AssetViewer
              descriptor={viewingDescriptor}
              onBack={() => setViewingId(null)}
              onDownload={handleDownload}
            />
          ) : (
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-1 nowheel nodrag">
              {assetList.length === 0 && !workspaceFilesVersion && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <span className="text-[11px]" style={{ color: "var(--chrome-text-muted)" }}>
                    No assets yet. Upload files or drag & drop here.
                  </span>
                </div>
              )}
              {assetList.length > 0 && assetList.map((desc) => (
                <AssetItem
                  key={desc.id}
                  descriptor={desc}
                  onDelete={onDelete}
                  onClick={(id) => setViewingId(id)}
                />
              ))}
              <WorkspaceFilesSection
                version={workspaceFilesVersion}
                onDeleteFile={onDeleteWorkspaceFile}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
