export function getNodeEdges(node) {
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

export function findEdgeSnap(edges, otherEdgesList, axis, movingKeys, threshold) {
  const otherKeys =
    axis === "x"
      ? ["left", "right", "centerX"]
      : ["top", "bottom", "centerY"];
  const searchKeys = movingKeys
    ? (Array.isArray(movingKeys) ? movingKeys : [movingKeys])
    : otherKeys;

  let bestDist = Infinity;
  let bestOffset = 0;
  const candidates = [];

  for (const movingKey of searchKeys) {
    const movingVal = edges[movingKey];
    for (const other of otherEdgesList) {
      for (const otherKey of otherKeys) {
        const otherVal = other[otherKey];
        const dist = Math.abs(movingVal - otherVal);
        if (dist < threshold) {
          const offset = otherVal - movingVal;
          candidates.push({ dist, offset, otherVal, other });
          if (dist < bestDist) {
            bestDist = dist;
            bestOffset = offset;
          }
        }
      }
    }
  }

  // Collect guides for ALL matches compatible with the best offset (within 1px).
  // This shows snap guides on both sides when both edges align simultaneously.
  const guides = [];
  for (const c of candidates) {
    if (Math.abs(c.offset - bestOffset) <= 1) {
      guides.push(
        axis === "x"
          ? { axis: "x", position: c.otherVal, from: Math.min(edges.top, c.other.top), to: Math.max(edges.bottom, c.other.bottom) }
          : { axis: "y", position: c.otherVal, from: Math.min(edges.left, c.other.left), to: Math.max(edges.right, c.other.right) }
      );
    }
  }

  return { offset: bestOffset, guides, snapped: bestDist < Infinity };
}

export function findSizeMatch(resizingEdges, otherEdgesList, threshold) {
  let widthSnap = null;
  let heightSnap = null;

  for (const other of otherEdgesList) {
    if (widthSnap === null) {
      const dist = Math.abs(resizingEdges.width - other.width);
      if (dist > 0 && dist < threshold) {
        widthSnap = other.width;
      }
    }
    if (heightSnap === null) {
      const dist = Math.abs(resizingEdges.height - other.height);
      if (dist > 0 && dist < threshold) {
        heightSnap = other.height;
      }
    }
  }

  return { widthSnap, heightSnap };
}
