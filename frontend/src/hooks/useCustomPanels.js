import { useCallback, useRef, useState } from "react";

export default function useCustomPanels(sendRef) {
  const [customPanels, setCustomPanels] = useState(new Map());
  const customPanelsRef = useRef(customPanels);
  customPanelsRef.current = customPanels;
  const historyRef = useRef({ past: [], future: [] });
  const pendingRestoreRef = useRef(null);

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
    // Reset history when panels are fully restored (project load, etc.)
    historyRef.current = { past: [], future: [] };
    pendingRestoreRef.current = null;

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
    (panelId, opts = {}) => {
      const { seq, nodePosition, nodeStyle } = opts;

      // Read panel data and push to history outside the updater to avoid
      // double-push in React StrictMode (updaters may run twice).
      const panelData = customPanelsRef.current.get(panelId);
      if (panelData) {
        historyRef.current.past.push({
          id: panelId,
          data: { ...panelData },
          nodePosition,
          nodeStyle,
          seq,
        });
        historyRef.current.future = [];
      }

      setCustomPanels((prev) => {
        const next = new Map(prev);
        next.delete(panelId);
        return next;
      });

      // Immediately notify backend
      sendRef.current?.({ type: "close_panel", id: panelId });
    },
    [sendRef]
  );

  const undoPanelClose = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return false;
    const entry = h.past.pop();
    h.future.push(entry);

    // Re-add the panel to the map
    setCustomPanels((prev) => {
      const next = new Map(prev);
      next.set(entry.id, entry.data);
      return next;
    });

    // Set pending restore so App.jsx can place the node back at its old position
    pendingRestoreRef.current = {
      id: `panel_${entry.id}`,
      position: entry.nodePosition,
      style: entry.nodeStyle,
    };

    // Notify backend to restore the panel in panels.json
    sendRef.current?.({ type: "restore_panel", id: entry.id, data: entry.data });

    return true;
  }, [sendRef]);

  const redoPanelClose = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return false;
    const entry = h.future.pop();
    h.past.push(entry);

    // Remove from map
    setCustomPanels((prev) => {
      const next = new Map(prev);
      next.delete(entry.id);
      return next;
    });

    // Notify backend
    sendRef.current?.({ type: "close_panel", id: entry.id });

    return true;
  }, [sendRef]);

  return {
    customPanels,
    handleClosePanel,
    openPanel,
    closePanel,
    restorePanels,
    panelHistoryRef: historyRef,
    undoPanelClose,
    redoPanelClose,
    pendingRestoreRef,
  };
}
