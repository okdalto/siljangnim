import { useCallback, useRef, useState } from "react";

const SNAP_THRESHOLD = 8;
const SNAP_EXIT_THRESHOLD = 12;

function getNodeEdges(node) {
  const w = node.measured?.width ?? node.width ?? node.style?.width ?? 0;
  const h = node.measured?.height ?? node.height ?? node.style?.height ?? 0;
  const x = node.position.x;
  const y = node.position.y;
  return {
    left: x,
    right: x + w,
    centerX: x + w / 2,
    top: y,
    bottom: y + h,
    centerY: y + h / 2,
    width: w,
    height: h,
  };
}

function findEdgeSnap(edges, otherEdgesList, axis, movingKeys) {
  const otherKeys =
    axis === "x"
      ? ["left", "right", "centerX"]
      : ["top", "bottom", "centerY"];
  const searchKeys = movingKeys
    ? (Array.isArray(movingKeys) ? movingKeys : [movingKeys])
    : otherKeys;

  let bestDist = Infinity;
  let bestOffset = 0;
  let bestGuides = [];

  for (const movingKey of searchKeys) {
    const movingVal = edges[movingKey];
    for (const other of otherEdgesList) {
      for (const otherKey of otherKeys) {
        const otherVal = other[otherKey];
        const dist = Math.abs(movingVal - otherVal);
        if (dist < SNAP_THRESHOLD && dist < bestDist) {
          bestDist = dist;
          bestOffset = otherVal - movingVal;
          bestGuides = axis === "x"
            ? [{ axis: "x", position: otherVal, from: Math.min(edges.top, other.top), to: Math.max(edges.bottom, other.bottom) }]
            : [{ axis: "y", position: otherVal, from: Math.min(edges.left, other.left), to: Math.max(edges.right, other.right) }];
        }
      }
    }
  }

  return { offset: bestOffset, guides: bestGuides, snapped: bestDist < Infinity };
}

function findSizeMatch(resizingEdges, otherEdgesList) {
  let widthSnap = null;
  let heightSnap = null;

  for (const other of otherEdgesList) {
    if (widthSnap === null) {
      const dist = Math.abs(resizingEdges.width - other.width);
      if (dist > 0 && dist < SNAP_THRESHOLD) {
        widthSnap = other.width;
      }
    }
    if (heightSnap === null) {
      const dist = Math.abs(resizingEdges.height - other.height);
      if (dist > 0 && dist < SNAP_THRESHOLD) {
        heightSnap = other.height;
      }
    }
  }

  return { widthSnap, heightSnap };
}

export default function useNodeSnapping(nodes, originalOnNodesChange, setNodes) {
  const [guides, setGuides] = useState([]);
  const lastSnappedPosition = useRef({});
  // Resize snap lock: { lockedWidth, lockedHeight, lockedPosX, lockedPosY, widthTarget, heightTarget }
  const resizeLock = useRef({});
  // Resize direction detected on first frame: { xEdge: 'left'|'right', yEdge: 'top'|'bottom' }
  const resizeDir = useRef({});

  const onNodesChange = useCallback(
    (changes) => {
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
        if (dragEnd && lastSnappedPosition.current[dragEnd.id]) {
          dragEnd.position = lastSnappedPosition.current[dragEnd.id];
          delete lastSnappedPosition.current[dragEnd.id];
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

        const movingEdges = getNodeEdges({
          ...movingNode,
          position: dragging.position,
        });

        const otherEdges = nodes
          .filter((n) => n.id !== dragging.id)
          .map(getNodeEdges);

        const xSnap = findEdgeSnap(movingEdges, otherEdges, "x");
        const ySnap = findEdgeSnap(movingEdges, otherEdges, "y");

        setGuides([...xSnap.guides, ...ySnap.guides]);

        const snappedPos = {
          x: dragging.position.x + xSnap.offset,
          y: dragging.position.y + ySnap.offset,
        };
        dragging.position = snappedPos;
        lastSnappedPosition.current[dragging.id] = snappedPos;
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
          resizingNode.measured?.width ??
          resizingNode.width ??
          resizingNode.style?.width ??
          0;
        const rawHeight =
          resizing.dimensions?.height ??
          resizingNode.measured?.height ??
          resizingNode.height ??
          resizingNode.style?.height ??
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
          const xSnap = findEdgeSnap(resizingEdges, otherEdges, "x", xEdge);
          const sizeMatch = findSizeMatch(resizingEdges, otherEdges);

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
          const xSnap = findEdgeSnap(lockedEdges, otherEdges, "x", xEdge);
          if (xSnap.snapped) allGuides.push(...xSnap.guides);
        }

        // --- Y-axis (height) snapping ---
        if (!heightLocked) {
          const ySnap = findEdgeSnap(resizingEdges, otherEdges, "y", yEdge);
          const sizeMatch = findSizeMatch(resizingEdges, otherEdges);

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
          const ySnap = findEdgeSnap(lockedEdges, otherEdges, "y", yEdge);
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
    [nodes, originalOnNodesChange, setNodes, guides.length]
  );

  return { onNodesChange, guides };
}
