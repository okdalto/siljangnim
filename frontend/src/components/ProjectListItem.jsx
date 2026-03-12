import { useState, useCallback, useEffect, useRef, memo } from "react";
import CodePreviewPanel from "./CodePreviewPanel.jsx";
import { timeAgo } from "../utils/timeFormat.js";
import { readThumbnailUrl } from "../engine/storage.js";
import AssetExcludeDialog from "./AssetExcludeDialog.jsx";
import { API_BASE, BROWSER_ONLY } from "../constants/api.js";
import ProjectActions from "./project/ProjectActions.jsx";
import ProjectFileViewer from "./project/ProjectFileViewer.jsx";

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

function ProjectListItem({ project: p, isActive, onLoad, onDelete, onRename, onFork }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTimerRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const editInputRef = useRef(null);
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [previewCode, setPreviewCode] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [projectFiles, setProjectFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showAssetExclude, setShowAssetExclude] = useState(false);
  const [assetList, setAssetList] = useState([]);
  const [assetExportFn, setAssetExportFn] = useState(null);

  useEffect(() => {
    if (confirmDelete) {
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
      return () => clearTimeout(deleteTimerRef.current);
    }
  }, [confirmDelete]);

  useEffect(() => {
    if (editing) editInputRef.current?.select();
  }, [editing]);

  const handleStartRename = (e) => {
    e.stopPropagation();
    setEditName(p.display_name || p.name);
    setEditing(true);
  };

  const handleCommitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== (p.display_name || p.name)) {
      onRename?.(p.name, trimmed);
    }
    setEditing(false);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === "Enter") handleCommitRename();
    if (e.key === "Escape") setEditing(false);
  };

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

  const handleBrowseFiles = useCallback(async (e) => {
    e.stopPropagation();
    if (filesExpanded) {
      setFilesExpanded(false);
      setProjectFiles([]);
      return;
    }
    if (codeExpanded) {
      setCodeExpanded(false);
      setPreviewCode(null);
    }
    setFilesExpanded(true);
    setProjectFiles([]);
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

  const handleShowAssetExclude = useCallback((assets, doExportFn) => {
    setAssetList(assets);
    setAssetExportFn(() => doExportFn);
    setShowAssetExclude(true);
  }, []);

  // Thumbnail
  const [thumbSrc, setThumbSrc] = useState(() => {
    if (!p.has_thumbnail) return null;
    if (BROWSER_ONLY) return null;
    const ts = p.updated_at ? new Date(p.updated_at).getTime() : "";
    return `${API_BASE}/api/projects/${encodeURIComponent(p.name)}/thumbnail?t=${ts}`;
  });

  useEffect(() => {
    if (!BROWSER_ONLY || !p.has_thumbnail) return;
    let cancelled = false;
    readThumbnailUrl(p.name).then((url) => {
      if (!cancelled && url) setThumbSrc(url);
    });
    return () => { cancelled = true; };
  }, [p.name, p.has_thumbnail, p.updated_at]);

  useEffect(() => {
    return () => { if (BROWSER_ONLY && thumbSrc) URL.revokeObjectURL(thumbSrc); };
  }, [thumbSrc]);

  return (
    <div>
      <div
        onClick={() => onLoad?.(p.name)}
        className={`group px-3 py-2 cursor-pointer hover:bg-zinc-800 transition-colors border-l-2 ${
          isActive ? "border-indigo-500 bg-zinc-800/50" : "border-transparent"
        }`}
      >
        <div className="flex items-start gap-2">
          <ThumbnailImg src={thumbSrc} alt={p.display_name || p.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              {editing ? (
                <input
                  ref={editInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleCommitRename}
                  onKeyDown={handleRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-medium text-zinc-200 bg-zinc-700 border border-zinc-500 rounded px-1 py-0 outline-none w-full min-w-0"
                  autoFocus
                />
              ) : (
                <span
                  className="text-xs font-medium text-zinc-200 truncate"
                  onDoubleClick={handleStartRename}
                >
                  {p.display_name || p.name}
                </span>
              )}
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
                <ProjectActions
                  project={p}
                  filesExpanded={filesExpanded}
                  onBrowseFiles={handleBrowseFiles}
                  onDelete={handleDeleteClick}
                  onFork={onFork}
                  onShowAssetExclude={handleShowAssetExclude}
                />
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
      <ProjectFileViewer
        projectName={p.name}
        filesExpanded={filesExpanded}
        projectFiles={projectFiles}
        loadingFiles={loadingFiles}
      />

      {/* Asset exclude dialog for selective export */}
      {showAssetExclude && (
        <AssetExcludeDialog
          assets={assetList}
          onConfirm={(excludedSet) => {
            setShowAssetExclude(false);
            assetExportFn?.(true, excludedSet.size > 0 ? excludedSet : null);
          }}
          onCancel={() => setShowAssetExclude(false)}
        />
      )}
    </div>
  );
}

export default memo(ProjectListItem);
