import { useEffect, useLayoutEffect, useState, useRef } from "react";

/**
 * Custom node selection fully decoupled from ReactFlow's node state.
 * Uses a separate selectedIds state + DOM data-attribute for visual feedback.
 * Immune to race conditions from frequent setNodes calls.
 */
export default function useNodeSelection() {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  // Pointer-down handler for selection
  useEffect(() => {
    const handlePointerDown = (e) => {
      const flowEl = e.target.closest('.react-flow');
      if (!flowEl) return;
      if (e.target.closest('.react-flow__controls') ||
          e.target.closest('.react-flow__minimap') ||
          e.target.closest('.react-flow__panel')) return;

      const nodeEl = e.target.closest('.react-flow__node');

      if (!nodeEl) {
        // Pane click — deselect all
        if (selectedIdsRef.current.size > 0) setSelectedIds(new Set());
        return;
      }

      const nodeId = nodeEl.getAttribute('data-id');
      if (!nodeId) return;

      const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;

      setSelectedIds((prev) => {
        if (isMulti) {
          // Toggle selection with modifier key
          const next = new Set(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return next;
        }
        // Without modifier: if clicking an already-selected node in a multi-selection,
        // keep the selection (user is about to drag the group)
        if (prev.size > 1 && prev.has(nodeId)) {
          return prev;
        }
        // Otherwise, select only this node
        return new Set([nodeId]);
      });
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Sync selection to DOM data-attribute (useLayoutEffect = before paint, no flash)
  useLayoutEffect(() => {
    document.querySelectorAll('.react-flow__node').forEach((el) => {
      const nodeId = el.getAttribute('data-id');
      if (selectedIds.has(nodeId)) {
        el.setAttribute('data-custom-selected', '');
      } else {
        el.removeAttribute('data-custom-selected');
      }
    });
  }, [selectedIds]);

  return { selectedIds, setSelectedIds, selectedIdsRef };
}
