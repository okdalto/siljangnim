import { useEffect } from "react";

/**
 * Centralized keyboard shortcut handler.
 * Consolidates T, Space, F, Ctrl+Z/Shift+Z, Cmd+S into a single keydown listener.
 */
export default function useKeyboardShortcuts({
  setPaused,
  toggleSidebar,
  rfInstanceRef,
  selectedIdsRef,
  undo,
  redo,
  undoUniform,
  redoUniform,
  uniformHistoryRef,
  layoutHistoryRef,
  kf,
  panels,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      const isTextEntry =
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target.isContentEditable ||
        (tag === "INPUT" && ["text", "number", "search", "url", "email", "password"].includes(e.target.type));
      const isFormField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;

      // Cmd+S / Ctrl+S — prevent browser default
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        return;
      }

      // Ctrl+Z / Cmd+Z — undo/redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (isTextEntry) return;
        e.preventDefault();
        if (kf.isEditorOpen.current) {
          if (e.shiftKey) kf.redoKeyframes();
          else kf.undoKeyframes();
        } else if (e.shiftKey) {
          // REDO: 3-way seq comparison
          const uFuture = uniformHistoryRef.current.future;
          const lFuture = layoutHistoryRef.current.future;
          const pFuture = panels.panelHistoryRef.current.future;
          const uSeq = uFuture.length > 0 ? uFuture[uFuture.length - 1].seq ?? 0 : -1;
          const lSeq = lFuture.length > 0 ? lFuture[lFuture.length - 1].seq ?? 0 : -1;
          const pSeq = pFuture.length > 0 ? pFuture[pFuture.length - 1].seq ?? 0 : -1;
          const maxSeq = Math.max(uSeq, lSeq, pSeq);
          if (maxSeq < 0) return;
          if (pSeq === maxSeq) panels.redoPanelClose();
          else if (uSeq >= lSeq) redoUniform();
          else redo();
        } else {
          // UNDO: 3-way seq comparison
          const uPast = uniformHistoryRef.current.past;
          const lPast = layoutHistoryRef.current.past;
          const pPast = panels.panelHistoryRef.current.past;
          const uSeq = uPast.length > 0 ? uPast[uPast.length - 1].seq ?? 0 : -1;
          const lSeq = lPast.length > 0 ? lPast[lPast.length - 1].seq ?? 0 : -1;
          const pSeq = pPast.length > 0 ? pPast[pPast.length - 1].seq ?? 0 : -1;
          const maxSeq = Math.max(uSeq, lSeq, pSeq);
          if (maxSeq < 0) return;
          if (pSeq === maxSeq) panels.undoPanelClose();
          else if (uSeq >= lSeq) undoUniform();
          else undo();
        }
        return;
      }

      // Skip remaining shortcuts if in a form field
      if (isFormField) return;

      switch (e.code) {
        case "KeyT":
          e.preventDefault();
          toggleSidebar();
          break;
        case "Space":
          e.preventDefault();
          setPaused((p) => !p);
          break;
        case "KeyF": {
          e.preventDefault();
          const rf = rfInstanceRef.current;
          if (!rf) return;
          const ids = selectedIdsRef.current;
          rf.fitView({
            nodes: ids.size > 0 ? [...ids].map((id) => ({ id })) : undefined,
            duration: 300,
            padding: 0.15,
          });
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    setPaused, toggleSidebar, undo, redo, undoUniform, redoUniform,
    kf.undoKeyframes, kf.redoKeyframes, kf.isEditorOpen,
    panels.undoPanelClose, panels.redoPanelClose,
  ]);
}
