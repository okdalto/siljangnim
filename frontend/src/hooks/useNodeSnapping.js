import { useCallback, useRef, useState } from "react";
import { getNodeEdges, findEdgeSnap, findSizeMatch } from "../utils/snapAlgorithms.js";

const DEFAULT_SNAP_THRESHOLD = 8;

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

        // X-axis snap with hysteresis
        let xOffset = 0;
        let xGuides = [];
        if (lock.x !== null && Math.abs(dragging.position.x - lock.x) <= SNAP_EXIT_THRESHOLD) {
          xOffset = lock.x - dragging.position.x;
          // Show guides at locked position
          const lockedEdges = getNodeEdges({ ...movingNode, position: { x: lock.x, y: dragging.position.y } });
          xGuides = findEdgeSnap(lockedEdges, otherEdges, "x", undefined, SNAP_THRESHOLD).guides;
        } else {
          lock.x = null;
          const xSnap = findEdgeSnap(movingEdges, otherEdges, "x", undefined, SNAP_THRESHOLD);
          const snappedX = dragging.position.x + xSnap.offset;
          // Suppress snap that would pull back to start position (overlap escape)
          if (xSnap.snapped && !startInfo.escapedX && Math.abs(snappedX - startInfo.x) < 2) {
            // Don't snap — let the node escape from overlap
          } else {
            xOffset = xSnap.offset;
            xGuides = xSnap.guides;
            if (xSnap.snapped) {
              lock.x = snappedX;
            }
          }
        }

        // Y-axis snap with hysteresis
        let yOffset = 0;
        let yGuides = [];
        if (lock.y !== null && Math.abs(dragging.position.y - lock.y) <= SNAP_EXIT_THRESHOLD) {
          yOffset = lock.y - dragging.position.y;
          // Show guides at locked position
          const lockedEdges = getNodeEdges({ ...movingNode, position: { x: dragging.position.x, y: lock.y } });
          yGuides = findEdgeSnap(lockedEdges, otherEdges, "y", undefined, SNAP_THRESHOLD).guides;
        } else {
          lock.y = null;
          const ySnap = findEdgeSnap(movingEdges, otherEdges, "y", undefined, SNAP_THRESHOLD);
          const snappedY = dragging.position.y + ySnap.offset;
          // Suppress snap that would pull back to start position (overlap escape)
          if (ySnap.snapped && !startInfo.escapedY && Math.abs(snappedY - startInfo.y) < 2) {
            // Don't snap — let the node escape from overlap
          } else {
            yOffset = ySnap.offset;
            yGuides = ySnap.guides;
            if (ySnap.snapped) {
              lock.y = snappedY;
            }
          }
        }

        dragSnapLock.current[dragging.id] = lock;
        setGuides([...xGuides, ...yGuides]);

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

        let finalWidth = widthLocked ? lock.lockedWidth : rawWidth;
        let finalHeight = heightLocked ? lock.lockedHeight : rawHeight;
        let finalPosX = widthLocked ? lock.lockedPosX : rawPosX;
        let finalPosY = heightLocked ? lock.lockedPosY : rawPosY;
        let allGuides = [];

        // --- X-axis (width) snapping ---
        if (!widthLocked) {
          const xSnap = findEdgeSnap(resizingEdges, otherEdges, "x", xEdge, SNAP_THRESHOLD);
          const sizeMatch = findSizeMatch(resizingEdges, otherEdges, SNAP_THRESHOLD);

          let snapWidth = rawWidth;
          let snapPosX = rawPosX;

          if (xSnap.snapped) {
            if (xEdge === "right") {
              snapWidth = rawWidth + xSnap.offset;
            } else {
              // left edge: position moves, width adjusts inversely
              snapPosX = rawPosX + xSnap.offset;
              snapWidth = rawWidth - xSnap.offset;
            }
            allGuides.push(...xSnap.guides);
          }
          if (sizeMatch.widthSnap !== null) {
            const widthDelta = sizeMatch.widthSnap - snapWidth;
            if (xEdge === "left") {
              snapPosX -= widthDelta;
            }
            snapWidth = sizeMatch.widthSnap;
          }

          finalWidth = snapWidth;
          finalPosX = snapPosX;

          if (finalWidth !== rawWidth) {
            if (!resizeLock.current[resizing.id]) {
              resizeLock.current[resizing.id] = {
                lockedWidth: rawWidth, lockedHeight: rawHeight,
                lockedPosX: rawPosX, lockedPosY: rawPosY,
                widthTarget: null, heightTarget: null,
              };
            }
            resizeLock.current[resizing.id].lockedWidth = finalWidth;
            resizeLock.current[resizing.id].lockedPosX = finalPosX;
            resizeLock.current[resizing.id].widthTarget = finalWidth;
          }
        } else {
          // Show guides while width-locked
          const lockedEdges = getNodeEdges({
            measured: null,
            position: { x: finalPosX, y: rawPosY },
            width: finalWidth,
            height: rawHeight,
          });
          const xSnap = findEdgeSnap(lockedEdges, otherEdges, "x", xEdge, SNAP_THRESHOLD);
          if (xSnap.snapped) allGuides.push(...xSnap.guides);
        }

        // --- Y-axis (height) snapping ---
        if (!heightLocked) {
          const ySnap = findEdgeSnap(resizingEdges, otherEdges, "y", yEdge, SNAP_THRESHOLD);
          const sizeMatch = findSizeMatch(resizingEdges, otherEdges, SNAP_THRESHOLD);

          let snapHeight = rawHeight;
          let snapPosY = rawPosY;

          if (ySnap.snapped) {
            if (yEdge === "bottom") {
              snapHeight = rawHeight + ySnap.offset;
            } else {
              // top edge: position moves, height adjusts inversely
              snapPosY = rawPosY + ySnap.offset;
              snapHeight = rawHeight - ySnap.offset;
            }
            allGuides.push(...ySnap.guides);
          }
          if (sizeMatch.heightSnap !== null) {
            const heightDelta = sizeMatch.heightSnap - snapHeight;
            if (yEdge === "top") {
              snapPosY -= heightDelta;
            }
            snapHeight = sizeMatch.heightSnap;
          }

          finalHeight = snapHeight;
          finalPosY = snapPosY;

          if (finalHeight !== rawHeight) {
            if (!resizeLock.current[resizing.id]) {
              resizeLock.current[resizing.id] = {
                lockedWidth: rawWidth, lockedHeight: rawHeight,
                lockedPosX: rawPosX, lockedPosY: rawPosY,
                widthTarget: null, heightTarget: null,
              };
            }
            resizeLock.current[resizing.id].lockedHeight = finalHeight;
            resizeLock.current[resizing.id].lockedPosY = finalPosY;
            resizeLock.current[resizing.id].heightTarget = finalHeight;
          }
        } else {
          // Show guides while height-locked
          const lockedEdges = getNodeEdges({
            measured: null,
            position: { x: rawPosX, y: finalPosY },
            width: rawWidth,
            height: finalHeight,
          });
          const ySnap = findEdgeSnap(lockedEdges, otherEdges, "y", yEdge, SNAP_THRESHOLD);
          if (ySnap.snapped) allGuides.push(...ySnap.guides);
        }

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
