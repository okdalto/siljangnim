import { useState, useEffect, useRef, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import FileTree from "../components/fileBrowser/FileTree.jsx";
import FilePreview from "../components/fileBrowser/FilePreview.jsx";

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

function FolderBrowseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

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

/** Simple regex-based JS syntax highlighting — returns array of React spans */
function highlightJS(code) {
  if (!code) return null;
  const TOKEN_RE =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|typeof|instanceof|in|of|async|await|yield|void|null|undefined|true|false)\b)|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\b[a-zA-Z_$][\w$]*(?=\s*\())/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = TOKEN_RE.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(code.slice(lastIndex, match.index));
    }
    const [full, comment, string, keyword, number, funcCall] = match;
    if (comment) {
      parts.push(<span key={match.index} style={{ color: "#6b7280" }}>{full}</span>);
    } else if (string) {
      parts.push(<span key={match.index} style={{ color: "#4ade80" }}>{full}</span>);
    } else if (keyword) {
      parts.push(<span key={match.index} style={{ color: "#c084fc" }}>{full}</span>);
    } else if (number) {
      parts.push(<span key={match.index} style={{ color: "#fb923c" }}>{full}</span>);
    } else if (funcCall) {
      parts.push(<span key={match.index} style={{ color: "#60a5fa" }}>{full}</span>);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < code.length) {
    parts.push(code.slice(lastIndex));
  }
  return parts;
}

function CodePreviewPanel({ script, onClose }) {
  const tabs = ["setup", "render", "cleanup"].filter((t) => script?.[t]);
  const [activeTab, setActiveTab] = useState(() => {
    if (script?.render) return "render";
    return tabs[0] || "render";
  });
  const [copied, setCopied] = useState(false);

  const code = script?.[activeTab] || "";

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [code]);

  if (tabs.length === 0) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-3 py-3 border-b border-zinc-700 bg-zinc-900/80"
      >
        <p className="text-[10px] text-zinc-500 italic">No script code in this project.</p>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="border-b border-zinc-700 bg-zinc-900/80">
      <div className="flex items-center gap-0 px-2 pt-1.5 border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={(e) => { e.stopPropagation(); setActiveTab(t); setCopied(false); }}
            className={`text-[10px] px-2 py-1 rounded-t transition-colors ${
              activeTab === t
                ? "bg-zinc-800 text-zinc-200 font-medium"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 transition-colors"
          title="Copy code"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="max-h-[300px] overflow-auto">
        <pre className="p-2 text-[11px] leading-relaxed font-mono text-zinc-300 whitespace-pre-wrap break-all">
          <code>{highlightJS(code)}</code>
        </pre>
      </div>
    </div>
  );
}

/**
 * Resolve a workspace file path to a URL for serving.
 * Files under "uploads/" use /api/uploads/, others use /api/workspace/.
 */
function workspaceFileUrl(filePath) {
  if (filePath.startsWith("uploads/")) {
    return `${API_BASE}/api/${filePath}`;
  }
  return `${API_BASE}/api/workspace/${filePath}`;
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [overwriteConfirm, setOverwriteConfirm] = useState(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const deleteTimerRef = useRef(null);
  const savedTimerRef = useRef(null);

  // Code preview state
  const [expandedProject, setExpandedProject] = useState(null);
  const [previewCode, setPreviewCode] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Project file tree state
  const [projectFilesExpanded, setProjectFilesExpanded] = useState(null);
  const [projectFiles, setProjectFiles] = useState([]);
  const [loadingProjectFiles, setLoadingProjectFiles] = useState(false);
  const [projectFilePreview, setProjectFilePreview] = useState(null);

  // Workspace files state
  const [wsFiles, setWsFiles] = useState([]);
  const [wsExpanded, setWsExpanded] = useState(true);
  const [wsFilePreview, setWsFilePreview] = useState(null);

  // Fetch workspace files on mount and when workspaceFilesVersion changes
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
    if (saving && inputRef.current) inputRef.current.focus();
  }, [saving]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => e.stopPropagation();
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (confirmDelete) {
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(null), 3000);
      return () => clearTimeout(deleteTimerRef.current);
    }
  }, [confirmDelete]);

  const sanitizeName = (n) => {
    let s = n.trim().toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, "-");
    s = s.replace(/^-+|-+$/g, "");
    return s || "untitled";
  };

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const sanitized = sanitizeName(trimmed);
    const exists = projects.some((p) => p.name === sanitized);
    if (exists && overwriteConfirm !== sanitized) {
      setOverwriteConfirm(sanitized);
      return;
    }
    onSave?.(trimmed, description.trim() || undefined);
    setName("");
    setDescription("");
    setSaving(false);
    setOverwriteConfirm(null);
  };

  const handleOverwriteCancel = () => {
    setOverwriteConfirm(null);
  };

  const handleOverwriteConfirm = () => {
    const trimmed = name.trim();
    onSave?.(trimmed, description.trim() || undefined);
    setName("");
    setDescription("");
    setSaving(false);
    setOverwriteConfirm(null);
  };

  const handleQuickSave = () => {
    if (!activeProject) return;
    onSave?.(activeProject);
    clearTimeout(savedTimerRef.current);
    setSavedFeedback(true);
    savedTimerRef.current = setTimeout(() => setSavedFeedback(false), 1500);
  };

  const handleOpenSaveAs = () => {
    if (activeProject) {
      setName(activeProject + " copy");
    }
    setOverwriteConfirm(null);
    setSaving(true);
  };

  const handleDeleteClick = (e, projectName) => {
    e.stopPropagation();
    if (confirmDelete === projectName) {
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

  const handleCodeClick = useCallback(async (e, projectName) => {
    e.stopPropagation();
    if (expandedProject === projectName) {
      setExpandedProject(null);
      setPreviewCode(null);
      return;
    }
    // Close file tree if open on same project
    if (projectFilesExpanded === projectName) {
      setProjectFilesExpanded(null);
      setProjectFiles([]);
      setProjectFilePreview(null);
    }
    setExpandedProject(projectName);
    setPreviewCode(null);
    setLoadingPreview(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectName)}/scene`
      );
      if (res.ok) {
        const scene = await res.json();
        setPreviewCode(scene.script || null);
      } else {
        setPreviewCode(null);
      }
    } catch {
      setPreviewCode(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [expandedProject, projectFilesExpanded]);

  const handleBrowseProjectFiles = useCallback(async (e, projectName) => {
    e.stopPropagation();
    if (projectFilesExpanded === projectName) {
      setProjectFilesExpanded(null);
      setProjectFiles([]);
      setProjectFilePreview(null);
      return;
    }
    // Close code preview if open on same project
    if (expandedProject === projectName) {
      setExpandedProject(null);
      setPreviewCode(null);
    }
    setProjectFilesExpanded(projectName);
    setProjectFiles([]);
    setProjectFilePreview(null);
    setLoadingProjectFiles(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectName)}/files`
      );
      if (res.ok) {
        const data = await res.json();
        setProjectFiles(data.files || []);
      }
    } catch { /* ignore */ }
    setLoadingProjectFiles(false);
  }, [projectFilesExpanded, expandedProject]);

  const handleWsFileDelete = useCallback(async (filepath) => {
    if (onDeleteWorkspaceFile) {
      await onDeleteWorkspaceFile(filepath);
      fetchWsFiles();
    }
  }, [onDeleteWorkspaceFile, fetchWsFiles]);

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
          {saving ? (
            <button
              onClick={() => { setSaving(false); setOverwriteConfirm(null); }}
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
        <form onSubmit={handleSave} className="p-2 border-b border-zinc-700 flex flex-col gap-1.5 nodrag">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setOverwriteConfirm(null); }}
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
          {overwriteConfirm ? (
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded px-2.5 py-2 flex flex-col gap-1.5">
              <p className="text-[11px] text-yellow-400">
                Project "{overwriteConfirm}" already exists. Overwrite it?
              </p>
              <div className="flex items-center gap-2 self-end">
                <button
                  type="button"
                  onClick={handleOverwriteCancel}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleOverwriteConfirm}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white text-[11px] px-2.5 py-1 rounded transition-colors"
                >
                  Overwrite
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded transition-colors self-end"
            >
              Save
            </button>
          )}
        </form>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto nodrag nowheel nopan"
      >
        {/* ─── Current Workspace section ─── */}
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
                onFileSelect={(file) => {
                  setWsFilePreview((prev) => prev?.path === file.path ? null : file);
                  setProjectFilePreview(null);
                }}
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

        {/* ─── Saved Projects section ─── */}
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center text-zinc-500 py-8 gap-2">
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
          const isCodeExpanded = expandedProject === p.name;
          const isFilesExpanded = projectFilesExpanded === p.name;
          return (
            <div key={p.name}>
              <div
                onClick={() => onLoad?.(p.name)}
                className={`group px-3 py-2 cursor-pointer hover:bg-zinc-800 transition-colors border-l-2 ${
                  isActive
                    ? "border-indigo-500 bg-zinc-800/50"
                    : "border-transparent"
                }`}
              >
                <div className="flex items-start gap-2">
                  <ThumbnailImg src={thumbUrl(p)} alt={p.display_name || p.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {p.display_name || p.name}
                      </span>
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
                        <span className="flex items-center gap-1 ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleBrowseProjectFiles(e, p.name)}
                            className={`transition-colors ${
                              isFilesExpanded
                                ? "text-indigo-400 hover:text-indigo-300"
                                : "text-zinc-500 hover:text-zinc-300"
                            }`}
                            title="Browse files"
                          >
                            <FolderBrowseIcon />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(e, p.name)}
                            className="text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <TrashIcon />
                          </button>
                        </span>
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

              {/* Code preview panel */}
              {isCodeExpanded && (
                loadingPreview ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-3 border-b border-zinc-700 bg-zinc-900/80 flex items-center gap-2"
                  >
                    <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                    <span className="text-[10px] text-zinc-500">Loading...</span>
                  </div>
                ) : (
                  <CodePreviewPanel
                    script={previewCode}
                    onClose={() => { setExpandedProject(null); setPreviewCode(null); }}
                  />
                )
              )}

              {/* Project file tree panel */}
              {isFilesExpanded && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="border-b border-zinc-700 bg-zinc-900/80"
                >
                  {loadingProjectFiles ? (
                    <div className="px-3 py-3 flex items-center gap-2">
                      <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                      <span className="text-[10px] text-zinc-500">Loading files...</span>
                    </div>
                  ) : (
                    <div className="pl-3">
                      <FileTree
                        files={projectFiles}
                        baseUrl={`${API_BASE}/api/projects/${encodeURIComponent(p.name)}/file`}
                        onFileSelect={(file) => {
                          setProjectFilePreview((prev) => prev?.path === file.path ? null : file);
                          setWsFilePreview(null);
                        }}
                        selectedFile={projectFilePreview?.path}
                      />
                      {projectFilePreview && (
                        <FilePreview
                          file={projectFilePreview}
                          baseUrl={`${API_BASE}/api/projects/${encodeURIComponent(p.name)}/file`}
                          onClose={() => setProjectFilePreview(null)}
                        />
                      )}
                  </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
