import { useState, useCallback, useEffect, useRef } from "react";
import FileTree from "./fileBrowser/FileTree.jsx";
import FilePreview from "./fileBrowser/FilePreview.jsx";
import CodePreviewPanel from "./CodePreviewPanel.jsx";
import { timeAgo } from "../utils/timeFormat.js";

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : "";

function ThumbnailImg({ src, alt }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="w-12 h-9 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErr(true)}
      className="w-12 h-9 rounded object-cover flex-shrink-0 bg-zinc-700"
    />
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function FolderBrowseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function ProjectListItem({ project: p, isActive, onLoad, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTimerRef = useRef(null);

  // Code preview
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [previewCode, setPreviewCode] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Project file tree
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [projectFiles, setProjectFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filePreview, setFilePreview] = useState(null);

  useEffect(() => {
    if (confirmDelete) {
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
      return () => clearTimeout(deleteTimerRef.current);
    }
  }, [confirmDelete]);

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (confirmDelete) {
      clearTimeout(deleteTimerRef.current);
      setConfirmDelete(false);
      onDelete?.(p.name);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    clearTimeout(deleteTimerRef.current);
    setConfirmDelete(false);
  };

  const handleExport = useCallback(async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(p.name)}/export`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.display_name || p.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }, [p.name, p.display_name]);

  const handleBrowseFiles = useCallback(async (e) => {
    e.stopPropagation();
    if (filesExpanded) {
      setFilesExpanded(false);
      setProjectFiles([]);
      setFilePreview(null);
      return;
    }
    if (codeExpanded) {
      setCodeExpanded(false);
      setPreviewCode(null);
    }
    setFilesExpanded(true);
    setProjectFiles([]);
    setFilePreview(null);
    setLoadingFiles(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(p.name)}/files`);
      if (res.ok) {
        const data = await res.json();
        setProjectFiles(data.files || []);
      }
    } catch { /* ignore */ }
    setLoadingFiles(false);
  }, [filesExpanded, codeExpanded, p.name]);

  const thumbUrl = () => {
    if (!p.has_thumbnail) return null;
    const ts = p.updated_at ? new Date(p.updated_at).getTime() : "";
    return `${API_BASE}/api/projects/${encodeURIComponent(p.name)}/thumbnail?t=${ts}`;
  };

  return (
    <div>
      <div
        onClick={() => onLoad?.(p.name)}
        className={`group px-3 py-2 cursor-pointer hover:bg-zinc-800 transition-colors border-l-2 ${
          isActive ? "border-indigo-500 bg-zinc-800/50" : "border-transparent"
        }`}
      >
        <div className="flex items-start gap-2">
          <ThumbnailImg src={thumbUrl()} alt={p.display_name || p.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-200 truncate">
                {p.display_name || p.name}
              </span>
              {confirmDelete ? (
                <span className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button
                    onClick={handleDeleteClick}
                    className="text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
                  >
                    Delete
                  </button>
                  <span className="text-zinc-600 text-[10px]">/</span>
                  <button
                    onClick={handleCancelDelete}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1 ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={handleBrowseFiles}
                    className={`transition-colors ${
                      filesExpanded
                        ? "text-indigo-400 hover:text-indigo-300"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                    title="Browse files"
                  >
                    <FolderBrowseIcon />
                  </button>
                  <button
                    onClick={handleExport}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Export as ZIP"
                  >
                    <DownloadIcon />
                  </button>
                  <button
                    onClick={handleDeleteClick}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <TrashIcon />
                  </button>
                </span>
              )}
            </div>
            {p.description && (
              <p className="text-[10px] text-zinc-500 truncate mt-0.5">{p.description}</p>
            )}
            <p className="text-[10px] text-zinc-600 mt-0.5">{timeAgo(p.updated_at)}</p>
          </div>
        </div>
      </div>

      {/* Code preview panel */}
      {codeExpanded && (
        loadingPreview ? (
          <div onClick={(e) => e.stopPropagation()} className="px-3 py-3 border-b border-zinc-700 bg-zinc-900/80 flex items-center gap-2">
            <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
            <span className="text-[10px] text-zinc-500">Loading...</span>
          </div>
        ) : (
          <CodePreviewPanel
            script={previewCode}
            onClose={() => { setCodeExpanded(false); setPreviewCode(null); }}
          />
        )
      )}

      {/* Project file tree panel */}
      {filesExpanded && (
        <div onClick={(e) => e.stopPropagation()} className="border-b border-zinc-700 bg-zinc-900/80">
          {loadingFiles ? (
            <div className="px-3 py-3 flex items-center gap-2">
              <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
              <span className="text-[10px] text-zinc-500">Loading files...</span>
            </div>
          ) : (
            <div className="pl-3">
              <FileTree
                files={projectFiles}
                baseUrl={`${API_BASE}/api/projects/${encodeURIComponent(p.name)}/file`}
                onFileSelect={(file) => setFilePreview((prev) => prev?.path === file.path ? null : file)}
                selectedFile={filePreview?.path}
              />
              {filePreview && (
                <FilePreview
                  file={filePreview}
                  baseUrl={`${API_BASE}/api/projects/${encodeURIComponent(p.name)}/file`}
                  onClose={() => setFilePreview(null)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
