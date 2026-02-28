import { useState, useEffect, useRef } from "react";
import { NodeResizer } from "@xyflow/react";

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : "";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

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

export default function ProjectBrowserNode({ data }) {
  const {
    projects = [],
    activeProject,
    onSave,
    onLoad,
    onDelete,
  } = data;

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // project name pending delete
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const deleteTimerRef = useRef(null);

  useEffect(() => {
    if (saving && inputRef.current) inputRef.current.focus();
  }, [saving]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => e.stopPropagation();
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Auto-dismiss delete confirmation after 3 seconds
  useEffect(() => {
    if (confirmDelete) {
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(null), 3000);
      return () => clearTimeout(deleteTimerRef.current);
    }
  }, [confirmDelete]);

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave?.(trimmed, description.trim() || undefined);
    setName("");
    setDescription("");
    setSaving(false);
  };

  const handleQuickSave = () => {
    if (!activeProject) return;
    onSave?.(activeProject);
  };

  const handleDeleteClick = (e, projectName) => {
    e.stopPropagation();
    if (confirmDelete === projectName) {
      // Already confirming — do the delete
      clearTimeout(deleteTimerRef.current);
      setConfirmDelete(null);
      onDelete?.(projectName);
    } else {
      setConfirmDelete(projectName);
    }
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    clearTimeout(deleteTimerRef.current);
    setConfirmDelete(null);
  };

  const thumbUrl = (p) => {
    if (!p.has_thumbnail) return null;
    const ts = p.updated_at ? new Date(p.updated_at).getTime() : "";
    return `${API_BASE}/api/projects/${encodeURIComponent(p.name)}/thumbnail?t=${ts}`;
  };

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={260} minHeight={200} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />

      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab flex items-center justify-between">
        Projects
        <div className="flex items-center gap-1.5 nodrag">
          {/* Quick Save icon — only when a project is active */}
          {activeProject && (
            <button
              onClick={handleQuickSave}
              title={`Quick save "${activeProject}"`}
              className="text-zinc-500 hover:text-indigo-400 p-0.5 rounded transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setSaving((v) => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors"
          >
            {saving ? "Cancel" : activeProject ? "Save As" : "Save"}
          </button>
        </div>
      </div>

      {/* Save form */}
      {saving && (
        <form onSubmit={handleSave} className="p-2 border-b border-zinc-700 flex flex-col gap-1.5 nodrag">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Project name..."
            className="bg-zinc-800 text-zinc-100 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Description (optional)"
            rows={2}
            className="bg-zinc-800 text-zinc-100 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-colors self-end"
          >
            Save
          </button>
        </form>
      )}

      {/* Project list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto nodrag nowheel nopan"
      >
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-8 gap-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-xs italic">No saved projects yet.</p>
            <p className="text-[10px] text-zinc-600">Click "Save" to create your first project.</p>
          </div>
        )}
        {projects.map((p) => {
          const isActive = activeProject === p.name;
          const isConfirming = confirmDelete === p.name;
          return (
            <div
              key={p.name}
              onClick={() => onLoad?.(p.name)}
              className={`group px-3 py-2 cursor-pointer hover:bg-zinc-800 transition-colors border-l-2 ${
                isActive
                  ? "border-indigo-500 bg-zinc-800/50"
                  : "border-transparent"
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Thumbnail */}
                <ThumbnailImg src={thumbUrl(p)} alt={p.display_name || p.name} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-200 truncate">
                      {p.display_name || p.name}
                    </span>

                    {/* Delete button / confirm */}
                    {isConfirming ? (
                      <span className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button
                          onClick={(e) => handleDeleteClick(e, p.name)}
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
                      <button
                        onClick={(e) => handleDeleteClick(e, p.name)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 ml-2 transition-opacity flex-shrink-0"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                      {p.description}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {timeAgo(p.updated_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
