import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readNodeThumbnailUrl } from "../engine/storage.js";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const NODE_W = 140;
const NODE_H = 48;
const GAP_X = 32;
const GAP_Y = 64;
const EDGE_RADIUS = 12;

// ---------------------------------------------------------------------------
// Tree layout — assign (x, y) to each node
// ---------------------------------------------------------------------------

function layoutTree(roots, childrenMap) {
  const positions = new Map(); // nodeId → { x, y }
  let nextX = 0;

  function measure(node, depth) {
    const children = childrenMap.get(node.id) || [];
    if (children.length === 0) {
      const x = nextX;
      nextX += 1;
      positions.set(node.id, { col: x, row: depth });
      return { min: x, max: x };
    }

    let groupMin = Infinity;
    let groupMax = -Infinity;
    for (const child of children) {
      const range = measure(child, depth + 1);
      groupMin = Math.min(groupMin, range.min);
      groupMax = Math.max(groupMax, range.max);
    }

    const center = (groupMin + groupMax) / 2;
    positions.set(node.id, { col: center, row: depth });
    return { min: groupMin, max: groupMax };
  }

  for (const root of roots) {
    measure(root, 0);
  }

  // Convert col/row to pixel positions
  const result = new Map();
  for (const [id, { col, row }] of positions) {
    result.set(id, {
      x: col * (NODE_W + GAP_X),
      y: row * (NODE_H + GAP_Y),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Spring physics
// ---------------------------------------------------------------------------

function useSpring(targetX, targetY) {
  const ref = useRef({ x: targetX, y: targetY, vx: 0, vy: 0 });
  const [pos, setPos] = useState({ x: targetX, y: targetY });
  const rafRef = useRef(null);
  const targetRef = useRef({ x: targetX, y: targetY });
  targetRef.current = { x: targetX, y: targetY };

  useEffect(() => {
    const STIFFNESS = 0.08;
    const DAMPING = 0.72;
    const EPSILON = 0.3;

    let active = true;

    function tick() {
      if (!active) return;
      const s = ref.current;
      const t = targetRef.current;

      const dx = t.x - s.x;
      const dy = t.y - s.y;

      s.vx = (s.vx + dx * STIFFNESS) * DAMPING;
      s.vy = (s.vy + dy * STIFFNESS) * DAMPING;
      s.x += s.vx;
      s.y += s.vy;

      if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON && Math.abs(s.vx) < EPSILON && Math.abs(s.vy) < EPSILON) {
        s.x = t.x;
        s.y = t.y;
        s.vx = 0;
        s.vy = 0;
        setPos({ x: s.x, y: s.y });
        // stop animating until target changes
        return;
      }

      setPos({ x: s.x, y: s.y });
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetX, targetY]);

  return pos;
}

// ---------------------------------------------------------------------------
// Node component
// ---------------------------------------------------------------------------

const TYPE_COLORS = {
  prompt_node: "#6366f1",
  manual_edit_node: "#f59e0b",
  asset_node: "#06b6d4",
  timeline_node: "#10b981",
  agent_repair_node: "#ef4444",
};

function TreeNode({ node, x, y, isActive, isCompareSource, isCompareMode, onSelect, onDoubleClick, onContextMenu, projectName }) {
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    if (!node.thumbnailRef) return;
    let cancelled = false;
    readNodeThumbnailUrl(projectName, node.id).then((url) => {
      if (!cancelled && url) setThumbUrl(url);
    });
    return () => { cancelled = true; };
  }, [node.id, node.thumbnailRef, projectName]);

  useEffect(() => {
    return () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl); };
  }, [thumbUrl]);

  const color = TYPE_COLORS[node.type] || "#6366f1";
  const isFavorite = node.tags?.includes("favorite");

  return (
    <div
      className="absolute select-none cursor-pointer group"
      data-tree-node=""
      style={{
        left: x,
        top: y,
        width: NODE_W,
        height: NODE_H,
        transform: "translate(-50%, -50%)",
      }}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
    >
      <div
        className="w-full h-full rounded-lg flex items-center gap-2 px-2 overflow-hidden transition-shadow"
        style={{
          background: isActive ? `${color}22` : "var(--node-bg, #1e1e2e)",
          border: isCompareSource
            ? "2px solid #eab308"
            : isActive
              ? `2px solid ${color}`
              : "1px solid var(--chrome-border, #333)",
          boxShadow: isActive ? `0 0 12px ${color}44` : "0 2px 6px rgba(0,0,0,0.3)",
          cursor: isCompareMode ? "crosshair" : "pointer",
        }}
      >
        {/* Dot / Thumbnail */}
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-8 h-6 rounded-sm object-cover flex-shrink-0" />
        ) : (
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: color, boxShadow: isActive ? `0 0 6px ${color}` : "none" }}
          />
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-medium truncate leading-tight"
            style={{ color: isActive ? "#fff" : "var(--chrome-text-secondary, #aaa)" }}
          >
            {node.title}
          </div>
          {node.summary && (
            <div
              className="text-[9px] truncate leading-tight mt-0.5"
              style={{ color: "var(--chrome-text-muted, #666)" }}
            >
              {node.summary}
            </div>
          )}
        </div>

        {/* Indicators */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          {node.isCheckpoint && (
            <div className="w-1.5 h-1.5 rounded-sm" style={{ background: "#6366f1" }} title="Checkpoint" />
          )}
          {isFavorite && (
            <div className="text-[8px]" title="Favorite">⭐</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge rendering (SVG)
// ---------------------------------------------------------------------------

function TreeEdges({ roots, childrenMap, positions }) {
  const lines = [];

  function walk(node) {
    const from = positions.get(node.id);
    if (!from) return;
    const children = childrenMap.get(node.id) || [];
    for (const child of children) {
      const to = positions.get(child.id);
      if (!to) continue;

      const x1 = from.x;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y - NODE_H / 2;
      const midY = (y1 + y2) / 2;

      lines.push(
        <path
          key={`${node.id}-${child.id}`}
          d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
          fill="none"
          stroke="var(--chrome-border, #444)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
      walk(child);
    }
  }

  for (const root of roots) walk(root);

  return <>{lines}</>;
}

// ---------------------------------------------------------------------------
// Main canvas component
// ---------------------------------------------------------------------------

export default function VersionTreeCanvas({
  treeNodes,
  activeNodeId,
  projectName,
  onSelectNode,
  onDoubleClickNode,
  onContextMenu,
  compareSourceId,
  isCompareMode,
  autoFocus = false,
}) {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 256, h: 400 });
  const [zoom, setZoom] = useState(1);
  const [focusMode, setFocusMode] = useState(false); // F key toggle

  // Auto-focus when sidebar opens so arrow keys work immediately
  useEffect(() => {
    if (autoFocus) {
      // Delay slightly to ensure DOM is ready after sidebar transition
      requestAnimationFrame(() => containerRef.current?.focus());
    }
  }, [autoFocus]);

  // Observe container size
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build tree structure
  const { roots, childrenMap, nodesMap } = useMemo(() => {
    const cm = new Map();
    const r = [];
    const nm = new Map();
    const sorted = [...treeNodes].sort((a, b) => a.createdAt - b.createdAt);
    for (const node of sorted) {
      nm.set(node.id, node);
      if (!cm.has(node.id)) cm.set(node.id, []);
      if (node.parentId === null) {
        r.push(node);
      } else {
        if (!cm.has(node.parentId)) cm.set(node.parentId, []);
        cm.get(node.parentId).push(node);
      }
    }
    return { roots: r, childrenMap: cm, nodesMap: nm };
  }, [treeNodes]);

  // Focus mode: filter to ancestor chain + descendants of active node
  const visibleNodes = useMemo(() => {
    if (!focusMode || !activeNodeId || !nodesMap.has(activeNodeId)) return treeNodes;
    const visible = new Set();
    // Ancestors
    let cur = activeNodeId;
    while (cur) {
      visible.add(cur);
      cur = nodesMap.get(cur)?.parentId;
    }
    // Descendants
    const stack = [activeNodeId];
    while (stack.length) {
      const id = stack.pop();
      visible.add(id);
      for (const child of childrenMap.get(id) || []) stack.push(child.id);
    }
    return treeNodes.filter((n) => visible.has(n.id));
  }, [focusMode, activeNodeId, treeNodes, nodesMap, childrenMap]);

  // Rebuild layout from visible nodes
  const { visibleRoots, visibleChildrenMap } = useMemo(() => {
    const cm = new Map();
    const r = [];
    const nodeSet = new Set(visibleNodes.map((n) => n.id));
    const sorted = [...visibleNodes].sort((a, b) => a.createdAt - b.createdAt);
    for (const node of sorted) {
      if (!cm.has(node.id)) cm.set(node.id, []);
      if (node.parentId === null || !nodeSet.has(node.parentId)) {
        r.push(node);
      } else {
        if (!cm.has(node.parentId)) cm.set(node.parentId, []);
        cm.get(node.parentId).push(node);
      }
    }
    return { visibleRoots: r, visibleChildrenMap: cm };
  }, [visibleNodes]);

  // Layout (uses visible nodes in focus mode)
  const positions = useMemo(() => layoutTree(visibleRoots, visibleChildrenMap), [visibleRoots, visibleChildrenMap]);

  // Compute content bounds
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { x, y } of positions.values()) {
      minX = Math.min(minX, x - NODE_W / 2);
      maxX = Math.max(maxX, x + NODE_W / 2);
      minY = Math.min(minY, y - NODE_H / 2);
      maxY = Math.max(maxY, y + NODE_H / 2);
    }
    if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return { minX, maxX, minY, maxY };
  }, [positions]);

  // Drag state
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Target: center active node
  const activePos = activeNodeId ? positions.get(activeNodeId) : null;
  const centerTargetX = activePos ? containerSize.w / 2 - activePos.x : containerSize.w / 2 - (bounds.minX + bounds.maxX) / 2;
  const centerTargetY = activePos ? containerSize.h / 2 - activePos.y : containerSize.h / 2 - (bounds.minY + bounds.maxY) / 2;

  const targetX = centerTargetX + dragOffset.x;
  const targetY = centerTargetY + dragOffset.y;

  const springPos = useSpring(targetX, targetY);

  // Reset drag offset when active node changes
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [activeNodeId]);

  // Keyboard navigation + F key focus toggle
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      // F key: toggle focus mode
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFocusMode((v) => !v);
        setDragOffset({ x: 0, y: 0 });
        return;
      }

      // Zoom keys
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => Math.min(2.5, z + 0.15));
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.3, z - 0.15));
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
        setDragOffset({ x: 0, y: 0 });
        return;
      }

      if (!activeNodeId) return;
      const activeNode = nodesMap.get(activeNodeId);
      if (!activeNode) return;

      let targetId = null;

      switch (e.key) {
        case "ArrowUp": {
          if (activeNode.parentId && nodesMap.has(activeNode.parentId)) {
            targetId = activeNode.parentId;
          }
          break;
        }
        case "ArrowDown": {
          const children = childrenMap.get(activeNodeId) || [];
          if (children.length > 0) targetId = children[0].id;
          break;
        }
        case "ArrowLeft":
        case "ArrowRight": {
          const parentId = activeNode.parentId;
          const siblings = parentId ? (childrenMap.get(parentId) || []) : roots;
          if (siblings.length <= 1) break;
          const idx = siblings.findIndex((n) => n.id === activeNodeId);
          if (idx < 0) break;
          const next = e.key === "ArrowRight"
            ? siblings[(idx + 1) % siblings.length]
            : siblings[(idx - 1 + siblings.length) % siblings.length];
          targetId = next.id;
          break;
        }
        default:
          return;
      }

      if (targetId && targetId !== activeNodeId) {
        e.preventDefault();
        onDoubleClickNode(targetId);
      }
    };

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [activeNodeId, nodesMap, childrenMap, roots, onDoubleClickNode]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((z) => Math.max(0.3, Math.min(2.5, z * factor)));
  }, []);

  // Drag handlers
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    // Focus the container so keyboard navigation works
    containerRef.current?.focus();
    // Don't start drag if clicking on a tree node
    if (e.target.closest("[data-tree-node]")) return;
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: dragOffset.x,
      offsetY: dragOffset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [dragOffset]);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setDragOffset({
      x: dragRef.current.offsetX + dx,
      y: dragRef.current.offsetY + dy,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  // Attach wheel handler (passive: false needed for preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Content width/height for SVG
  const contentW = bounds.maxX - bounds.minX + NODE_W * 2;
  const contentH = bounds.maxY - bounds.minY + NODE_H * 2;

  if (treeNodes.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center" style={{ color: "var(--chrome-text-muted)" }}>
        <div className="text-xs text-center px-4">
          No version history yet.<br />Send a prompt to start.
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative outline-none"
      tabIndex={0}
      style={{ cursor: dragRef.current.dragging ? "grabbing" : "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      data-tree-bg=""
    >
      <div
        style={{
          position: "absolute",
          left: springPos.x,
          top: springPos.y,
          width: contentW,
          height: contentH,
          transform: `scale(${zoom})`,
          transformOrigin: "0 0",
        }}
        data-tree-bg=""
      >
        {/* Edges */}
        <svg
          style={{ position: "absolute", left: 0, top: 0, width: contentW, height: contentH, overflow: "visible", pointerEvents: "none" }}
        >
          <TreeEdges roots={visibleRoots} childrenMap={visibleChildrenMap} positions={positions} />
        </svg>

        {/* Nodes */}
        {visibleNodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          return (
            <TreeNode
              key={node.id}
              node={node}
              x={p.x}
              y={p.y}
              isActive={node.id === activeNodeId}
              isCompareSource={compareSourceId === node.id}
              isCompareMode={isCompareMode}
              onSelect={onSelectNode}
              onDoubleClick={onDoubleClickNode}
              onContextMenu={onContextMenu}
              projectName={projectName}
            />
          );
        })}
      </div>

      {/* Zoom / Focus controls */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 pointer-events-auto" style={{ zIndex: 10 }}>
        <button
          onClick={() => setFocusMode((v) => !v)}
          className="w-6 h-6 rounded flex items-center justify-center text-[10px] transition-colors"
          style={{
            background: focusMode ? "var(--accent, #6366f1)" : "var(--input-bg, #333)",
            color: focusMode ? "#fff" : "var(--chrome-text-muted)",
            border: "1px solid var(--chrome-border, #444)",
          }}
          title={focusMode ? "Show full tree (F)" : "Focus on active branch (F)"}
        >
          F
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
          className="w-6 h-6 rounded flex items-center justify-center text-xs transition-colors"
          style={{ background: "var(--input-bg, #333)", color: "var(--chrome-text-muted)", border: "1px solid var(--chrome-border, #444)" }}
          title="Zoom out (−)"
        >
          −
        </button>
        <button
          onClick={() => { setZoom(1); setDragOffset({ x: 0, y: 0 }); }}
          className="min-w-[32px] h-6 rounded flex items-center justify-center text-[10px] transition-colors"
          style={{ background: "var(--input-bg, #333)", color: "var(--chrome-text-muted)", border: "1px solid var(--chrome-border, #444)" }}
          title="Reset zoom (0)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
          className="w-6 h-6 rounded flex items-center justify-center text-xs transition-colors"
          style={{ background: "var(--input-bg, #333)", color: "var(--chrome-text-muted)", border: "1px solid var(--chrome-border, #444)" }}
          title="Zoom in (+)"
        >
          +
        </button>
      </div>
    </div>
  );
}
