import { useCallback, useRef } from "react";

const MAX_HISTORY = 50;

/** Effective rendered width/height — checks every place ReactFlow may store it. */
function effectiveSize(node) {
  return {
    w: node.width ?? node.measured?.width ?? node.style?.width ?? 0,
    h: node.height ?? node.measured?.height ?? node.style?.height ?? 0,
  };
}

function takeSnapshot(nodes) {
  const snap = new Map();
  for (const n of nodes) {
    const { w, h } = effectiveSize(n);
    snap.set(n.id, {
      position: { ...n.position },
      style: n.style ? { ...n.style } : undefined,
      width: w,
      height: h,
    });
  }
  return snap;
}

function applySnapshot(setNodes, snapshot) {
  setNodes((nds) =>
    nds.map((n) => {
      const saved = snapshot.get(n.id);
      if (!saved) return n;
      return {
        ...n,
        position: { ...saved.position },
        width: saved.width,
        height: saved.height,
        style: { ...n.style, width: saved.width, height: saved.height },
      };
    })
  );
}

export default function useNodeLayoutHistory(nodes, onNodesChange, setNodes) {
  const historyRef = useRef({ past: [], future: [] });
  const pendingRef = useRef(null); // snapshot taken at drag/resize start
  const activeIdsRef = useRef(new Set()); // node IDs currently being dragged/resized
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const wrappedOnNodesChange = useCallback(
    (changes) => {
      // Detect drag/resize start: dragging=true or resizing=true
      for (const c of changes) {
        const isDragStart = c.type === "position" && c.dragging === true;
        const isResizeStart = c.type === "dimensions" && c.resizing === true;

        if (isDragStart || isResizeStart) {
          if (activeIdsRef.current.size === 0) {
            // First node starting interaction — capture snapshot
            pendingRef.current = takeSnapshot(nodesRef.current);
          }
          activeIdsRef.current.add(c.id);
        }
      }

      // Detect drag/resize end: dragging=false or resizing=false
      for (const c of changes) {
        const isDragEnd = c.type === "position" && c.dragging === false;
        const isResizeEnd = c.type === "dimensions" && c.resizing === false;

        if (isDragEnd || isResizeEnd) {
          activeIdsRef.current.delete(c.id);

          if (activeIdsRef.current.size === 0 && pendingRef.current) {
            const beforeSnapshot = pendingRef.current;
            pendingRef.current = null;

            // Use rAF to read the final node state after this change is applied
            requestAnimationFrame(() => {
              const currentNodes = nodesRef.current;
              let changed = false;
              for (const n of currentNodes) {
                const prev = beforeSnapshot.get(n.id);
                if (!prev) continue;
                const { w, h } = effectiveSize(n);
                if (
                  n.position.x !== prev.position.x ||
                  n.position.y !== prev.position.y ||
                  w !== prev.width ||
                  h !== prev.height
                ) {
                  changed = true;
                  break;
                }
              }
              if (changed) {
                const hist = historyRef.current;
                hist.past.push(beforeSnapshot);
                if (hist.past.length > MAX_HISTORY) hist.past.shift();
                hist.future.length = 0; // clear redo stack
              }
            });
          }
        }
      }

      // Always forward to the next handler in the chain
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const snapshot = h.past.pop();
    h.future.push(takeSnapshot(nodesRef.current));
    applySnapshot(setNodes, snapshot);
  }, [setNodes]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const snapshot = h.future.pop();
    h.past.push(takeSnapshot(nodesRef.current));
    applySnapshot(setNodes, snapshot);
  }, [setNodes]);

  return { onNodesChange: wrappedOnNodesChange, undo, redo };
}
