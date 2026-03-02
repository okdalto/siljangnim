import { useCallback, useRef, useState } from "react";

const UNDO_TIMEOUT = 5000;

export default function useCustomPanels(sendRef) {
  const [customPanels, setCustomPanels] = useState(new Map());
  // Recently closed panel for undo: { id, data } | null
  const [recentlyClosed, setRecentlyClosed] = useState(null);
  const undoTimerRef = useRef(null);

  // Finalize a pending close (send to backend, clear undo state)
  const _finalizePendingClose = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setRecentlyClosed((prev) => {
      if (prev) {
        sendRef.current?.({ type: "close_panel", id: prev.id });
      }
      return null;
    });
  }, [sendRef]);

  const openPanel = useCallback((id, data) => {
    setCustomPanels((prev) => {
      const next = new Map(prev);
      const entry = {
        title: data.title || "Panel",
        width: data.width || 320,
        height: data.height || 300,
      };
      if (data.controls) {
        entry.controls = data.controls;
      } else {
        entry.html = data.html || "";
      }
      next.set(id, entry);
      return next;
    });
  }, []);

  const closePanel = useCallback((id) => {
    setCustomPanels((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const restorePanels = useCallback((panelsObj) => {
    // Clear any pending undo when panels are fully restored (project load, etc.)
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setRecentlyClosed(null);

    const next = new Map();
    if (panelsObj) {
      for (const [id, data] of Object.entries(panelsObj)) {
        const entry = {
          title: data.title || "Panel",
          width: data.width || 320,
          height: data.height || 300,
        };
        if (data.controls) {
          entry.controls = data.controls;
        } else {
          entry.html = data.html || "";
        }
        next.set(id, entry);
      }
    }
    setCustomPanels(next);
  }, []);

  const handleClosePanel = useCallback(
    (panelId) => {
      // Finalize any previous pending close first
      _finalizePendingClose();

      // Save panel data for undo before removing
      setCustomPanels((prev) => {
        const panelData = prev.get(panelId);
        if (panelData) {
          setRecentlyClosed({ id: panelId, data: { ...panelData } });
        }
        const next = new Map(prev);
        next.delete(panelId);
        return next;
      });

      // Start undo timer — backend is notified only after timeout
      undoTimerRef.current = setTimeout(() => {
        undoTimerRef.current = null;
        setRecentlyClosed((prev) => {
          if (prev && prev.id === panelId) {
            sendRef.current?.({ type: "close_panel", id: panelId });
          }
          return null;
        });
      }, UNDO_TIMEOUT);
    },
    [sendRef, _finalizePendingClose]
  );

  const undoClosePanel = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setRecentlyClosed((prev) => {
      if (prev) {
        // Re-add the panel
        setCustomPanels((panels) => {
          const next = new Map(panels);
          next.set(prev.id, prev.data);
          return next;
        });
      }
      return null;
    });
  }, []);

  const dismissUndo = useCallback(() => {
    _finalizePendingClose();
  }, [_finalizePendingClose]);

  return {
    customPanels,
    handleClosePanel,
    openPanel,
    closePanel,
    restorePanels,
    recentlyClosed,
    undoClosePanel,
    dismissUndo,
  };
}
