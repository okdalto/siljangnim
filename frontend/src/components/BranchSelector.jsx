import { useState, useRef, useEffect } from "react";

/**
 * Branch selector for prompt-branch UX.
 * Shows current branch context and allows:
 * - Sending prompt as a new branch from any node
 * - Quick-switching between branches
 * - A/B adopting a branch
 */
export default function BranchSelector({
  treeNodes = [],
  activeNodeId,
  onBranchFromNode,
  onSwitchToNode,
  onAdoptBranch,
  compact = true,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("continue"); // "continue" | "branch"
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const activeNode = treeNodes.find((n) => n.id === activeNodeId);

  // Find leaf nodes (nodes with no children) — these are branch tips
  const nodesById = new Map(treeNodes.map((n) => [n.id, n]));
  const childSet = new Set(treeNodes.map((n) => n.parentId).filter(Boolean));
  const leafNodes = treeNodes.filter((n) => !childSet.has(n.id));

  // Build branch paths: for each leaf, trace back using map lookup (O(n) per branch)
  const branches = leafNodes.map((leaf) => {
    const pathIds = new Set();
    let cur = leaf;
    let depth = 0;
    while (cur) {
      pathIds.add(cur.id);
      depth++;
      cur = cur.parentId ? nodesById.get(cur.parentId) : null;
    }
    return {
      tip: leaf,
      depth,
      label: leaf.title || `Node ${leaf.id.slice(0, 6)}`,
      isActive: leaf.id === activeNodeId || pathIds.has(activeNodeId),
    };
  });

  const handleBranchPrompt = (nodeId) => {
    setSelectedSourceId(nodeId);
    setMode("branch");
    setOpen(false);
    onBranchFromNode?.(nodeId);
  };

  const handleSwitchBranch = (nodeId) => {
    onSwitchToNode?.(nodeId);
    setOpen(false);
  };

  if (!compact) {
    return null; // Full mode not implemented yet
  }

  // Active branch indicator
  const activeBranch = branches.find((b) => b.isActive);
  const branchLabel = mode === "branch" && selectedSourceId
    ? `Branch from ${(treeNodes.find((n) => n.id === selectedSourceId)?.title || "").slice(0, 15)}...`
    : activeBranch
      ? activeBranch.label.slice(0, 20)
      : "main";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors"
        style={{
          color: mode === "branch" ? "#f59e0b" : "var(--chrome-text-muted)",
          borderColor: mode === "branch" ? "rgba(245,158,11,0.3)" : "var(--chrome-border)",
          background: mode === "branch" ? "rgba(245,158,11,0.1)" : "transparent",
        }}
        title="Branch selector"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3v12" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 01-9 9" />
        </svg>
        <span className="truncate max-w-[80px]">{branchLabel}</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-1 left-0 z-50 rounded-lg border shadow-xl min-w-[220px] max-h-[300px] overflow-y-auto"
          style={{ background: "var(--node-bg)", borderColor: "var(--node-border)" }}
        >
          {/* Mode toggle */}
          <div className="flex border-b" style={{ borderColor: "var(--chrome-border)" }}>
            <button
              onClick={() => setMode("continue")}
              className={`flex-1 text-[10px] py-1.5 transition-colors ${mode === "continue" ? "text-white bg-white/10" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Continue
            </button>
            <button
              onClick={() => setMode("branch")}
              className={`flex-1 text-[10px] py-1.5 transition-colors ${mode === "branch" ? "text-amber-400 bg-amber-500/10" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              New Branch
            </button>
          </div>

          {mode === "continue" ? (
            // Branch switch list
            <div className="p-1">
              <div className="text-[9px] text-zinc-500 px-2 py-1">Switch to branch tip:</div>
              {branches.length === 0 ? (
                <div className="text-[10px] text-zinc-600 px-2 py-2 text-center">No branches yet</div>
              ) : (
                branches.map((b) => (
                  <button
                    key={b.tip.id}
                    onClick={() => handleSwitchBranch(b.tip.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors flex items-center gap-1.5 ${
                      b.isActive ? "text-white bg-white/10" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: b.isActive ? "#6366f1" : "#52525b" }}
                    />
                    <span className="truncate">{b.label}</span>
                    <span className="ml-auto text-[9px] text-zinc-600">{b.depth}d</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            // Branch source picker
            <div className="p-1">
              <div className="text-[9px] text-zinc-500 px-2 py-1">Branch from node:</div>
              {treeNodes.length === 0 ? (
                <div className="text-[10px] text-zinc-600 px-2 py-2 text-center">No nodes to branch from</div>
              ) : (
                treeNodes.slice(-20).reverse().map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleBranchPrompt(node.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors ${
                      node.id === selectedSourceId ? "text-amber-400 bg-amber-500/10" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    }`}
                  >
                    <div className="truncate">{node.title || node.id.slice(0, 12)}</div>
                    <div className="text-[9px] text-zinc-600">{node.type === "checkpoint" ? "checkpoint" : "prompt"}</div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Adopt action (if comparing) */}
          {onAdoptBranch && activeNode && (
            <div className="border-t p-1" style={{ borderColor: "var(--chrome-border)" }}>
              <button
                onClick={() => { onAdoptBranch(activeNodeId); setOpen(false); }}
                className="w-full text-[10px] py-1.5 rounded text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
              >
                Adopt current branch as main
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
