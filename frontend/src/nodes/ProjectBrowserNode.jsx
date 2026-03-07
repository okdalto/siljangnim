import { useState, useEffect, useRef, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import FileTree from "../components/fileBrowser/FileTree.jsx";
import FilePreview from "../components/fileBrowser/FilePreview.jsx";
import SaveProjectForm from "../components/SaveProjectForm.jsx";
import ProjectListItem from "../components/ProjectListItem.jsx";
import useStopWheelPropagation from "../hooks/useStopWheelPropagation.js";
import { API_BASE } from "../constants/api.js";

const SAVE_FEEDBACK_MS = 1500;

function ChevronIcon({ open }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function ProjectBrowserNode({ data, standalone = false, hideHeader = false }) {
  const {
    projects = [],
    activeProject,
    onSave,
    onLoad,
    onDelete,
    onRename,
    onImport,
    onDeleteWorkspaceFile,
    workspaceFilesVersion,
  } = data;

  const [collapsed, setCollapsed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const savedTimerRef = useRef(null);
  const scrollRef = useRef(null);
  const importInputRef = useRef(null);

  // Workspace files state
  const [wsFiles, setWsFiles] = useState([]);
  const [wsExpanded, setWsExpanded] = useState(true);
  const [wsFilePreview, setWsFilePreview] = useState(null);

  const fetchWsFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/workspace/files`);
      if (res.ok) {
        const data = await res.json();
        setWsFiles(data.files || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchWsFiles();
  }, [fetchWsFiles, workspaceFilesVersion]);

  useStopWheelPropagation(scrollRef);

  const handleQuickSave = () => {
    if (!activeProject) return;
    onSave?.(activeProject);
    clearTimeout(savedTimerRef.current);
    setSavedFeedback(true);
    savedTimerRef.current = setTimeout(() => setSavedFeedback(false), SAVE_FEEDBACK_MS);
  };

  const handleOpenSaveAs = () => {
    setSaving(true);
  };

  // Listen for global Cmd+S when no active project
  useEffect(() => {
    const handleOpenSave = () => setSaving(true);
    window.addEventListener("open-save-dialog", handleOpenSave);
    return () => window.removeEventListener("open-save-dialog", handleOpenSave);
  }, []);

  const handleWsFileDelete = useCallback(async (filepath) => {
    if (onDeleteWorkspaceFile) {
      await onDeleteWorkspaceFile(filepath);
      fetchWsFiles();
    }
  }, [onDeleteWorkspaceFile, fetchWsFiles]);

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
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith(".zip") || file.name.endsWith(".json"))) {
      onImport?.(file);
    }
  }, [onImport]);

  return (
    <div
      className={`node-container w-full ${collapsed ? "h-auto" : "h-full"} flex flex-col overflow-hidden relative ${standalone ? "" : "rounded-xl shadow-2xl"}`}
      style={standalone ? { background: "var(--node-bg)" } : { background: "var(--node-bg)", border: "1px solid var(--node-border)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!standalone && <NodeResizer minWidth={260} minHeight={200} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />}

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport?.(file);
          e.target.value = "";
        }}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-indigo-600/20 border-2 border-dashed border-indigo-400 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="text-indigo-300 text-sm font-medium flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Drop ZIP to import
          </div>
        </div>
      )}

      {/* Header */}
      {!(standalone && hideHeader) && (
      <div
        className={`px-4 py-2 text-sm font-semibold flex items-center justify-between ${standalone ? "" : "cursor-grab"}`}
        style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}
        onDoubleClick={() => setCollapsed((v) => !v)}
      >
        Projects
        <div className="flex items-center gap-1.5 nodrag">
          <button
            onClick={() => importInputRef.current?.click()}
            className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors"
          >
            Import
          </button>
          {saving ? (
            <button
              onClick={() => setSaving(false)}
              className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors"
            >
              Cancel
            </button>
          ) : activeProject ? (
            <>
              <button
                onClick={handleQuickSave}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  savedFeedback
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-500 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600"
                }`}
              >
                {savedFeedback ? "Saved!" : "Save"}
              </button>
              <button
                onClick={handleOpenSaveAs}
                className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors"
              >
                Save As
              </button>
            </>
          ) : (
            <button
              onClick={() => setSaving(true)}
              className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors"
            >
              Save
            </button>
          )}
        </div>
      </div>
      )}

      {!collapsed && <>
      {/* Save form */}
      {saving && (
        <SaveProjectForm
          onSave={onSave}
          onCancel={() => setSaving(false)}
        />
      )}

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto nodrag nowheel nopan">
        {/* Current Workspace section */}
        <div className="border-b border-zinc-700/50">
          <div
            onClick={() => setWsExpanded((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-zinc-500"><ChevronIcon open={wsExpanded} /></span>
            <span className="text-[11px] font-medium text-zinc-400">Current Workspace</span>
            <span className="text-[9px] text-zinc-600 ml-auto">{wsFiles.length} files</span>
          </div>
          {wsExpanded && (
            <div className="pb-1 pl-3">
              <FileTree
                files={wsFiles}
                baseUrl={`${API_BASE}/api/workspace`}
                onFileSelect={(file) => setWsFilePreview((prev) => prev?.path === file.path ? null : file)}
                onFileDelete={onDeleteWorkspaceFile ? handleWsFileDelete : null}
                selectedFile={wsFilePreview?.path}
              />
              {wsFilePreview && (
                <FilePreview
                  file={wsFilePreview}
                  baseUrl={`${API_BASE}/api/workspace`}
                  onClose={() => setWsFilePreview(null)}
                />
              )}
            </div>
          )}
        </div>

        {/* Saved Projects section */}
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center text-zinc-500 py-8 gap-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-xs italic">No saved projects yet.</p>
            <p className="text-[10px] text-zinc-600">Click "Save" to create your first project.</p>
          </div>
        )}
        {projects.map((p) => (
          <ProjectListItem
            key={p.name}
            project={p}
            isActive={activeProject === p.name}
            onLoad={onLoad}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))}
      </div>
      </>}
    </div>
  );
}
