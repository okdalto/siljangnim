import { useState, useEffect, useRef, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import FileTree from "../components/fileBrowser/FileTree.jsx";
import FilePreview from "../components/fileBrowser/FilePreview.jsx";
import SaveProjectForm from "../components/SaveProjectForm.jsx";
import ProjectListItem from "../components/ProjectListItem.jsx";

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : "";

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

export default function ProjectBrowserNode({ data }) {
  const {
    projects = [],
    activeProject,
    onSave,
    onLoad,
    onDelete,
    onDeleteWorkspaceFile,
    workspaceFilesVersion,
  } = data;

  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const savedTimerRef = useRef(null);
  const scrollRef = useRef(null);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => e.stopPropagation();
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleQuickSave = () => {
    if (!activeProject) return;
    onSave?.(activeProject);
    clearTimeout(savedTimerRef.current);
    setSavedFeedback(true);
    savedTimerRef.current = setTimeout(() => setSavedFeedback(false), 1500);
  };

  const handleOpenSaveAs = () => {
    setSaving(true);
  };

  const handleWsFileDelete = useCallback(async (filepath) => {
    if (onDeleteWorkspaceFile) {
      await onDeleteWorkspaceFile(filepath);
      fetchWsFiles();
    }
  }, [onDeleteWorkspaceFile, fetchWsFiles]);

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={260} minHeight={200} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />

      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab flex items-center justify-between">
        Projects
        <div className="flex items-center gap-1.5 nodrag">
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

      {/* Save form */}
      {saving && (
        <SaveProjectForm
          projects={projects}
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
          />
        ))}
      </div>
    </div>
  );
}
