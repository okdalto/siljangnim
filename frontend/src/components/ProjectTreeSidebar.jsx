import { useCallback, useEffect, useRef, useState } from "react";
import ProjectTreeNode from "./ProjectTreeNode.jsx";
import ProjectTreeContextMenu from "./ProjectTreeContextMenu.jsx";
import SaveProjectForm from "./SaveProjectForm.jsx";
import ProjectListItem from "./ProjectListItem.jsx";
import GitHubAuthButton from "./GitHubAuthButton.jsx";
import { buildTree, getAncestorIds } from "../engine/projectTree.js";

export default function ProjectTreeSidebar({
  isOpen,
  treeNodes,
  activeNodeId,
  projectName,
  onSelectNode,
  onDoubleClickNode,
  onBranch,
  onDuplicate,
  onRename,
  onToggleFavorite,
  onPinCheckpoint,
  onDeleteNode,
  onContinueFrom,
  // Compare mode
  compareSourceId,
  onStartCompare,
  onSelectCompareTarget,
  onCancelCompare,
  // Project management
  projectList,
  activeProject,
  onProjectSave,
  onProjectLoad,
  onProjectDelete,
  onProjectRename,
  onProjectImport,
  saveStatus,
  // GitHub
  github,
  onGitHubSave,
  onGitHubLoad,
  onExportZip,
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const savedTimerRef = useRef(null);
  const importInputRef = useRef(null);

  const { roots, childrenMap } = buildTree(treeNodes);
  const nodesMap = new Map(treeNodes.map((n) => [n.id, n]));
  const ancestorIds = activeNodeId ? new Set(getAncestorIds(activeNodeId, nodesMap)) : new Set();

  // Listen for global Cmd+S when no active project
  useEffect(() => {
    const handleOpenSave = () => setSaving(true);
    window.addEventListener("open-save-dialog", handleOpenSave);
    return () => window.removeEventListener("open-save-dialog", handleOpenSave);
  }, []);

  const toggleExpand = useCallback((nodeId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e, node) => {
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleNodeSelect = useCallback((nodeId) => {
    if (compareSourceId) {
      onSelectCompareTarget?.(nodeId);
    } else {
      onSelectNode(nodeId);
    }
  }, [compareSourceId, onSelectCompareTarget, onSelectNode]);

  const handleContextAction = useCallback((action, node) => {
    switch (action) {
      case "continue":
        onContinueFrom?.(node.id);
        break;
      case "branch": {
        const title = prompt("Branch name:", `Branch from "${node.title}"`);
        if (title) onBranch?.(node.id, title);
        break;
      }
      case "compare":
        onStartCompare?.(node.id);
        break;
      case "duplicate":
        onDuplicate?.(node.id);
        break;
      case "rename": {
        const newTitle = prompt("New name:", node.title);
        if (newTitle && newTitle !== node.title) onRename?.(node.id, newTitle);
        break;
      }
      case "favorite":
        onToggleFavorite?.(node.id);
        break;
      case "checkpoint":
        onPinCheckpoint?.(node.id);
        break;
      case "delete":
        if (window.confirm(`Delete "${node.title}" and all its children?`)) {
          onDeleteNode?.(node.id);
        }
        break;
    }
  }, [onContinueFrom, onBranch, onDuplicate, onRename, onToggleFavorite, onPinCheckpoint, onDeleteNode, onStartCompare]);

  const handleQuickSave = useCallback(() => {
    if (!activeProject) return;
    onProjectSave?.(activeProject);
    clearTimeout(savedTimerRef.current);
    setSavedFeedback(true);
    savedTimerRef.current = setTimeout(() => setSavedFeedback(false), 1500);
  }, [activeProject, onProjectSave]);

  const handleImportFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) onProjectImport?.(file);
    e.target.value = "";
  }, [onProjectImport]);

  const handleExportZip = useCallback(async () => {
    if (!activeProject) return;
    try {
      const { downloadProjectZip } = await import("../engine/zipIO.js");
      await downloadProjectZip(activeProject);
    } catch (e) {
      console.error("Export failed:", e);
    }
  }, [activeProject]);

  const renderNode = (node, depth = 0) => {
    const children = childrenMap.get(node.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(node.id) || ancestorIds.has(node.id);
    const isCompareSource = compareSourceId === node.id;

    return (
      <div key={node.id}>
        <ProjectTreeNode
          node={node}
          depth={depth}
          isActive={node.id === activeNodeId}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          onSelect={handleNodeSelect}
          onDoubleClick={onDoubleClickNode}
          onContextMenu={handleContextMenu}
          onToggleExpand={toggleExpand}
          projectName={projectName}
          isCompareSource={isCompareSource}
          isCompareMode={!!compareSourceId}
        />
        {isExpanded && hasChildren && (
          <div>
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className="fixed top-10 left-0 bottom-10 z-30 flex flex-col overflow-hidden"
        style={{
          width: isOpen ? 256 : 0,
          background: "var(--chrome-bg)",
          borderRight: isOpen ? "1px solid var(--chrome-border)" : "none",
          transition: "width 0.2s ease",
        }}
      >
        {isOpen && (
          <>
            {/* ── Project actions bar ── */}
            <div
              className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--chrome-border)" }}
            >
              {saving ? (
                <button
                  onClick={() => setSaving(false)}
                  className="text-[10px] px-2 py-1 rounded transition-colors"
                  style={{ color: "var(--chrome-text-muted)", background: "var(--input-bg)" }}
                >
                  Cancel
                </button>
              ) : (
                <>
                  {activeProject ? (
                    <button
                      onClick={handleQuickSave}
                      className="text-[10px] px-2 py-1 rounded transition-colors"
                      style={{
                        color: savedFeedback ? "#fff" : "var(--chrome-text-secondary)",
                        background: savedFeedback ? "#059669" : "var(--input-bg)",
                      }}
                    >
                      {savedFeedback ? "Saved!" : "Save"}
                    </button>
                  ) : null}
                  <button
                    onClick={() => setSaving(true)}
                    className="text-[10px] px-2 py-1 rounded transition-colors"
                    style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
                  >
                    Save As
                  </button>
                  <button
                    onClick={() => importInputRef.current?.click()}
                    className="text-[10px] px-2 py-1 rounded transition-colors"
                    style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
                  >
                    Import
                  </button>
                  {activeProject && (
                    <button
                      onClick={handleExportZip}
                      className="text-[10px] px-2 py-1 rounded transition-colors"
                      style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
                    >
                      Export
                    </button>
                  )}
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".zip,.json"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                </>
              )}
            </div>

            {/* ── GitHub section ── */}
            {github?.clientIdConfigured && (
              <div
                className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--chrome-border)" }}
              >
                {github.isAuthenticated ? (
                  <>
                    <GitHubAuthButton {...github} onLogin={github.login} onLogout={github.logout} onCancelLogin={github.cancelLogin} />
                    <div className="ml-auto flex gap-1">
                      {activeProject && (
                        <button
                          onClick={onGitHubSave}
                          className="text-[10px] px-2 py-1 rounded transition-colors"
                          style={{ color: "#58a6ff", background: "var(--input-bg)" }}
                        >
                          Push
                        </button>
                      )}
                      <button
                        onClick={onGitHubLoad}
                        className="text-[10px] px-2 py-1 rounded transition-colors"
                        style={{ color: "#58a6ff", background: "var(--input-bg)" }}
                      >
                        Pull
                      </button>
                    </div>
                  </>
                ) : (
                  <GitHubAuthButton {...github} onLogin={github.login} onLogout={github.logout} onCancelLogin={github.cancelLogin} />
                )}
              </div>
            )}

            {/* ── Save form ── */}
            {saving && (
              <SaveProjectForm
                onSave={(name, desc) => {
                  onProjectSave?.(name, desc);
                  setSaving(false);
                }}
                onCancel={() => setSaving(false)}
              />
            )}

            {/* ── Saved Projects section (collapsible) ── */}
            <div className="flex-shrink-0" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
              <button
                onClick={() => setProjectsExpanded((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left hover:bg-white/5 transition-colors"
              >
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  style={{
                    color: "var(--chrome-text-muted)",
                    transform: projectsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.15s",
                  }}
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <span className="text-[11px] font-medium" style={{ color: "var(--chrome-text-secondary)" }}>
                  Saved Projects
                </span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--chrome-text-muted)" }}>
                  {projectList?.length || 0}
                </span>
              </button>
              {projectsExpanded && (
                <div className="max-h-[40vh] overflow-y-auto">
                  {(!projectList || projectList.length === 0) ? (
                    <div className="px-3 py-3 text-[10px] text-center" style={{ color: "var(--chrome-text-muted)" }}>
                      No saved projects yet.
                    </div>
                  ) : (
                    projectList.map((p) => (
                      <ProjectListItem
                        key={p.name}
                        project={p}
                        isActive={activeProject === (p.display_name || p.name)}
                        onLoad={onProjectLoad}
                        onDelete={onProjectDelete}
                        onRename={onProjectRename}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* ── Compare mode banner ── */}
            {compareSourceId && (
              <div
                className="px-3 py-2 text-xs flex items-center justify-between flex-shrink-0"
                style={{ background: "rgba(99,102,241,0.15)", borderBottom: "1px solid var(--chrome-border)", color: "var(--accent-color, #6366f1)" }}
              >
                <span>Select target to compare</span>
                <button
                  onClick={onCancelCompare}
                  className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10"
                  style={{ color: "var(--chrome-text-muted)" }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* ── Version Tree header ── */}
            <div
              className="flex items-center justify-between px-3 py-1.5 text-xs font-medium flex-shrink-0"
              style={{ color: "var(--chrome-text-secondary)" }}
            >
              <span>Version Tree</span>
              <span className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>
                {treeNodes.length} nodes
              </span>
            </div>

            {/* ── Tree content ── */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
              {roots.length === 0 ? (
                <div
                  className="px-3 py-4 text-xs text-center"
                  style={{ color: "var(--chrome-text-muted)" }}
                >
                  No version history yet.
                  <br />
                  Send a prompt to start.
                </div>
              ) : (
                roots.map((root) => renderNode(root, 0))
              )}
            </div>
          </>
        )}
      </div>

      {contextMenu && (
        <ProjectTreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
