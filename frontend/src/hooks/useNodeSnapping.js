import { useCallback, useRef, useState } from "react";
import { getNodeEdges, findEdgeSnap, findSizeMatch } from "../utils/snapAlgorithms.js";

const DEFAULT_SNAP_THRESHOLD = 8;

/**
 * Apply drag snap logic for a single axis ("x" or "y").
 * Returns { offset, guides } and mutates lock[axis] for hysteresis.
 */
function applyDragSnapAxis(axis, lock, movingNode, movingEdges, otherEdges, dragging, startInfo, SNAP_THRESHOLD, SNAP_EXIT_THRESHOLD) {
  const pos = dragging.position[axis];
  const escaped = axis === "x" ? startInfo.escapedX : startInfo.escapedY;
  const otherAxis = axis === "x" ? "y" : "x";

  if (lock[axis] !== null && Math.abs(pos - lock[axis]) <= SNAP_EXIT_THRESHOLD) {
    const offset = lock[axis] - pos;
    const lockedPos = { ...dragging.position, [axis]: lock[axis] };
    const lockedEdges = getNodeEdges({ ...movingNode, position: lockedPos });
    const guides = findEdgeSnap(lockedEdges, otherEdges, axis, undefined, SNAP_THRESHOLD).guides;
    return { offset, guides };
  }

  lock[axis] = null;
  const snap = findEdgeSnap(movingEdges, otherEdges, axis, undefined, SNAP_THRESHOLD);
  const snappedVal = pos + snap.offset;
  if (snap.snapped && !escaped && Math.abs(snappedVal - startInfo[axis]) < 2) {
    return { offset: 0, guides: [] };
  }
  if (snap.snapped) lock[axis] = snappedVal;
  return { offset: snap.offset, guides: snap.guides };
}

/**
 * Apply resize snap logic for a single dimension ("x" for width, "y" for height).
 * Returns { finalSize, finalPos, guides } and mutates resizeLockRef entry.
 */
function applyResizeSnapAxis(axis, resizingEdges, otherEdges, rawSize, rawPos, edge, resizeLockRef, resizingId, rawWidth, rawHeight, rawPosX, rawPosY, locked, lockObj, SNAP_THRESHOLD, SNAP_EXIT_THRESHOLD) {
  if (locked) {
    const sizeKey = axis === "x" ? "lockedWidth" : "lockedHeight";
    const posKey = axis === "x" ? "lockedPosX" : "lockedPosY";
    const otherAxis = axis === "x" ? "y" : "x";
    const lockedEdges = getNodeEdges({
      measured: null,
      position: { x: axis === "x" ? lockObj[posKey] : rawPosX, y: axis === "y" ? lockObj[posKey] : rawPosY },
      width: axis === "x" ? lockObj[sizeKey] : rawWidth,
      height: axis === "y" ? lockObj[sizeKey] : rawHeight,
    });
    const snap = findEdgeSnap(lockedEdges, otherEdges, axis, edge, SNAP_THRESHOLD);
    return { finalSize: lockObj[sizeKey], finalPos: lockObj[posKey], guides: snap.snapped ? snap.guides : [] };
  }

  const snap = findEdgeSnap(resizingEdges, otherEdges, axis, edge, SNAP_THRESHOLD);
  const sizeMatch = findSizeMatch(resizingEdges, otherEdges, SNAP_THRESHOLD);
  const sizeSnapKey = axis === "x" ? "widthSnap" : "heightSnap";
  const isStart = (axis === "x" && edge === "left") || (axis === "y" && edge === "top");

  let snapSize = rawSize;
  let snapPos = rawPos;
  const guides = [];

  if (snap.snapped) {
    if (isStart) {
      snapPos = rawPos + snap.offset;
      snapSize = rawSize - snap.offset;
    } else {
      snapSize = rawSize + snap.offset;
    }
    guides.push(...snap.guides);
  }
  if (sizeMatch[sizeSnapKey] !== null) {
    const delta = sizeMatch[sizeSnapKey] - snapSize;
    if (isStart) snapPos -= delta;
    snapSize = sizeMatch[sizeSnapKey];
  }

  if (snapSize !== rawSize) {
    const sizeKey = axis === "x" ? "lockedWidth" : "lockedHeight";
    const posKey = axis === "x" ? "lockedPosX" : "lockedPosY";
    const targetKey = axis === "x" ? "widthTarget" : "heightTarget";
    if (!resizeLockRef.current[resizingId]) {
      resizeLockRef.current[resizingId] = {
        lockedWidth: rawWidth, lockedHeight: rawHeight,
        lockedPosX: rawPosX, lockedPosY: rawPosY,
        widthTarget: null, heightTarget: null,
      };
    }
    resizeLockRef.current[resizingId][sizeKey] = snapSize;
    resizeLockRef.current[resizingId][posKey] = snapPos;
    resizeLockRef.current[resizingId][targetKey] = snapSize;
  }

  return { finalSize: snapSize, finalPos: snapPos, guides };
}

/**
 * @param {Array} nodes - Current nodes array
 * @param {Function} originalOnNodesChange - Raw onNodesChange from useNodesState
 * @param {Function} setNodes - Node state setter
 * @param {{ snapEnabled?: boolean, snapThreshold?: number }} snapSettings
 * @returns {{ onNodesChange: Function, guides: Array<{axis: string, position: number, from: number, to: number}> }}
 */
export default function useNodeSnapping(nodes, originalOnNodesChange, setNodes, snapSettings, selectedIdsRef) {
  const [guides, setGuides] = useState([]);
  const lastSnappedPosition = useRef({});
  // Drag snap hysteresis: { [nodeId]: { x: snappedPosX | null, y: snappedPosY | null } }
  const dragSnapLock = useRef({});
  // Drag start info for overlap escape: { [nodeId]: { x, y, escapedX, escapedY } }
  const dragStartInfo = useRef({});
  // Multi-select drag: initial positions of all selected nodes at drag start
  const multiDragStart = useRef(null);
  // Resize snap lock: { lockedWidth, lockedHeight, lockedPosX, lockedPosY, widthTarget, heightTarget }
  const resizeLock = useRef({});
  // Resize direction detected on first frame: { xEdge: 'left'|'right', yEdge: 'top'|'bottom' }
  const resizeDir = useRef({});

  const onNodesChange = useCallback(
    (changes) => {
      const snapEnabled = snapSettings?.snapEnabled ?? true;
      const SNAP_THRESHOLD = snapSettings?.snapThreshold ?? DEFAULT_SNAP_THRESHOLD;
      const SNAP_EXIT_THRESHOLD = SNAP_THRESHOLD * 1.5;

      // If snapping is disabled, pass through directly
      if (!snapEnabled) {
        if (guides.length > 0) setGuides([]);
        originalOnNodesChange(changes);
        return;
      }

      const dragging = changes.find(
        (c) => c.type === "position" && c.dragging === true
      );
      const resizing = changes.find(
        (c) => c.type === "dimensions" && c.resizing === true
      );

      const dragEnd = changes.find(
        (c) => c.type === "position" && c.dragging === false
      );
      const resizeEnd = changes.find(
        (c) => c.type === "dimensions" && c.resizing === false
      );

      if (dragEnd || resizeEnd) {
        setGuides([]);
        if (dragEnd) {
          // Apply final snapped position for the primary dragged node
          if (lastSnappedPosition.current[dragEnd.id]) {
            dragEnd.position = lastSnappedPosition.current[dragEnd.id];
            delete lastSnappedPosition.current[dragEnd.id];
          }
          // Finalize multi-select drag: update all other selected nodes
          const mds = multiDragStart.current;
          if (mds && mds.primaryId === dragEnd.id && mds.others.length > 0) {
            const primaryStart = mds.positions.get(dragEnd.id);
            const finalPos = dragEnd.position || nodes.find((n) => n.id === dragEnd.id)?.position;
            if (primaryStart && finalPos) {
              const dx = finalPos.x - primaryStart.x;
              const dy = finalPos.y - primaryStart.y;
              // We'll apply the delta via setNodes after originalOnNodesChange
              const otherPositions = mds.others.map((id) => {
                const start = mds.positions.get(id);
                return { id, x: start.x + dx, y: start.y + dy };
              });
              // Apply changes, then set other nodes
              originalOnNodesChange(changes);
              setNodes((nds) =>
                nds.map((n) => {
                  const op = otherPositions.find((p) => p.id === n.id);
                  return op ? { ...n, position: { x: op.x, y: op.y } } : n;
                })
              );
              delete dragSnapLock.current[dragEnd.id];
              delete dragStartInfo.current[dragEnd.id];
              multiDragStart.current = null;
              return;
            }
          }
          delete dragSnapLock.current[dragEnd.id];
          delete dragStartInfo.current[dragEnd.id];
          multiDragStart.current = null;
        }
        if (resizeEnd) {
          const lock = resizeLock.current[resizeEnd.id];
          delete resizeLock.current[resizeEnd.id];
          delete resizeDir.current[resizeEnd.id];
          if (lock) {
            originalOnNodesChange(changes);
            setNodes((nds) =>
              nds.map((n) =>
                n.id === resizeEnd.id
                  ? {
                      ...n,
                      position: { x: lock.lockedPosX, y: lock.lockedPosY },
                      style: { ...n.style, width: lock.lockedWidth, height: lock.lockedHeight },
                    }
                  : n
              )
            );
            return;
          }
        }
        originalOnNodesChange(changes);
        return;
      }

      if (dragging && dragging.position) {
        const movingNode = nodes.find((n) => n.id === dragging.id);
        if (!movingNode) {
          originalOnNodesChange(changes);
          return;
        }

        // Determine which nodes are part of this multi-select drag
        const selected = selectedIdsRef?.current || new Set();
        const isMultiDrag = selected.size > 1 && selected.has(dragging.id);

        // Initialize multi-drag start positions on first drag frame
        if (isMultiDrag && !multiDragStart.current) {
          const positions = new Map();
          const others = [];
          for (const id of selected) {
            const n = nodes.find((nd) => nd.id === id);
            if (n) {
              positions.set(id, { x: n.position.x, y: n.position.y });
              if (id !== dragging.id) others.push(id);
            }
          }
          multiDragStart.current = { primaryId: dragging.id, positions, others };
        }

        // Track drag start position for overlap escape
        if (!dragStartInfo.current[dragging.id]) {
          dragStartInfo.current[dragging.id] = {
            x: movingNode.position.x,
            y: movingNode.position.y,
            escapedX: false,
            escapedY: false,
          };
        }
        const startInfo = dragStartInfo.current[dragging.id];
        if (!startInfo.escapedX && Math.abs(dragging.position.x - startInfo.x) > SNAP_THRESHOLD) {
          startInfo.escapedX = true;
        }
        if (!startInfo.escapedY && Math.abs(dragging.position.y - startInfo.y) > SNAP_THRESHOLD) {
          startInfo.escapedY = true;
        }

        const movingEdges = getNodeEdges({
          ...movingNode,
          position: dragging.position,
        });

        // Exclude other selected nodes from snap targets during multi-drag
        const excludeIds = isMultiDrag ? selected : new Set([dragging.id]);
        const otherEdges = nodes
          .filter((n) => !excludeIds.has(n.id))
          .map(getNodeEdges);

        const lock = dragSnapLock.current[dragging.id] || { x: null, y: null };

        const xResult = applyDragSnapAxis("x", lock, movingNode, movingEdges, otherEdges, dragging, startInfo, SNAP_THRESHOLD, SNAP_EXIT_THRESHOLD);
        const yResult = applyDragSnapAxis("y", lock, movingNode, movingEdges, otherEdges, dragging, startInfo, SNAP_THRESHOLD, SNAP_EXIT_THRESHOLD);
        const xOffset = xResult.offset;
        const yOffset = yResult.offset;

        dragSnapLock.current[dragging.id] = lock;
        setGuides([...xResult.guides, ...yResult.guides]);

        const snappedPos = {
          x: dragging.position.x + xOffset,
          y: dragging.position.y + yOffset,
        };
        dragging.position = snappedPos;
        lastSnappedPosition.current[dragging.id] = snappedPos;

        // Move other selected nodes by the same delta
        const mds = multiDragStart.current;
        if (mds && mds.primaryId === dragging.id && mds.others.length > 0) {
          const primaryStart = mds.positions.get(dragging.id);
          const dx = snappedPos.x - primaryStart.x;
          const dy = snappedPos.y - primaryStart.y;
          // Apply changes for the primary node first, then batch-update others
          originalOnNodesChange(changes);
          setNodes((nds) =>
            nds.map((n) => {
              if (!mds.others.includes(n.id)) return n;
              const start = mds.positions.get(n.id);
              return { ...n, position: { x: start.x + dx, y: start.y + dy } };
            })
          );
          return;
        }
      } else if (resizing) {
        const resizingNode = nodes.find((n) => n.id === resizing.id);
        if (!resizingNode) {
          originalOnNodesChange(changes);
          return;
        }

        // Accompanying position change (exists when left/top handle is used)
        const posChange = changes.find(
          (c) => c.type === "position" && c.id === resizing.id
        );

        // Raw values from ReactFlow
        const rawWidth =
          resizing.dimensions?.width ??
          resizingNode.style?.width ??
          resizingNode.measured?.width ??
          resizingNode.width ??
          0;
        const rawHeight =
          resizing.dimensions?.height ??
          resizingNode.style?.height ??
          resizingNode.measured?.height ??
          resizingNode.height ??
          0;
        const rawPosX = posChange?.position?.x ?? resizingNode.position.x;
        const rawPosY = posChange?.position?.y ?? resizingNode.position.y;

        // Detect resize direction (once per resize operation)
        if (!resizeDir.current[resizing.id]) {
          if (posChange?.position) {
            const dx = posChange.position.x - resizingNode.position.x;
            const dy = posChange.position.y - resizingNode.position.y;
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
              resizeDir.current[resizing.id] = {
                xEdge: Math.abs(dx) > 0.1 ? "left" : "right",
                yEdge: Math.abs(dy) > 0.1 ? "top" : "bottom",
              };
            }
          }
          if (!posChange && !resizeDir.current[resizing.id]) {
            resizeDir.current[resizing.id] = { xEdge: "right", yEdge: "bottom" };
          }
        }

        // Direction not yet detected (no movement yet), skip snapping this frame
        if (!resizeDir.current[resizing.id]) {
          originalOnNodesChange(changes);
          return;
        }

        const { xEdge, yEdge } = resizeDir.current[resizing.id];
        const lock = resizeLock.current[resizing.id];

        // Check hysteresis locks
        let widthLocked = false;
        let heightLocked = false;
        if (lock) {
          if (lock.widthTarget !== null && Math.abs(rawWidth - lock.widthTarget) < SNAP_EXIT_THRESHOLD) {
            widthLocked = true;
          } else if (lock.widthTarget !== null) {
            lock.widthTarget = null;
          }
          if (lock.heightTarget !== null && Math.abs(rawHeight - lock.heightTarget) < SNAP_EXIT_THRESHOLD) {
            heightLocked = true;
          } else if (lock.heightTarget !== null) {
            lock.heightTarget = null;
          }
          if (!widthLocked && !heightLocked) {
            delete resizeLock.current[resizing.id];
          }
        }

        // Build edges from raw values for snap detection
        const resizingEdges = getNodeEdges({
          measured: null,
          position: { x: rawPosX, y: rawPosY },
          width: rawWidth,
          height: rawHeight,
        });

        const otherEdges = nodes
          .filter((n) => n.id !== resizing.id)
          .map(getNodeEdges);

        const allGuides = [];

        const xRes = applyResizeSnapAxis("x", resizingEdges, otherEdges, rawWidth, rawPosX, xEdge, resizeLock, resizing.id, rawWidth, rawHeight, rawPosX, rawPosY, widthLocked, lock, SNAP_THRESHOLD, SNAP_EXIT_THRESHOLD);
        const yRes = applyResizeSnapAxis("y", resizingEdges, otherEdges, rawHeight, rawPosY, yEdge, resizeLock, resizing.id, rawWidth, rawHeight, rawPosX, rawPosY, heightLocked, lock, SNAP_THRESHOLD, SNAP_EXIT_THRESHOLD);

        const finalWidth = xRes.finalSize;
        const finalPosX = xRes.finalPos;
        const finalHeight = yRes.finalSize;
        const finalPosY = yRes.finalPos;
        allGuides.push(...xRes.guides, ...yRes.guides);

        setGuides(allGuides);

        // Override dimensions
        if (resizing.dimensions) {
          resizing.dimensions = {
            ...resizing.dimensions,
            width: finalWidth,
            height: finalHeight,
          };
        }
        // Override position (for left/top handle resize)
        if (posChange) {
          posChange.position = { x: finalPosX, y: finalPosY };
        }
      } else {
        if (guides.length > 0) setGuides([]);
      }

      originalOnNodesChange(changes);
    },
    [nodes, originalOnNodesChange, setNodes, guides.length, snapSettings?.snapEnabled, snapSettings?.snapThreshold]
  );

  return { onNodesChange, guides };
}
