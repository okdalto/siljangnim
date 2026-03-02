import { useCallback, useState } from "react";

export default function useCustomPanels(sendRef) {
  const [customPanels, setCustomPanels] = useState(new Map());

  const openPanel = useCallback((id, data) => {
    setCustomPanels((prev) => {
      const next = new Map(prev);
      next.set(id, {
        title: data.title || "Panel",
        html: data.html || "",
        width: data.width || 320,
        height: data.height || 300,
      });
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

  const handleClosePanel = useCallback(
    (panelId) => {
      setCustomPanels((prev) => {
        const next = new Map(prev);
        next.delete(panelId);
        return next;
      });
      sendRef.current?.({ type: "close_panel", id: panelId });
    },
    [sendRef]
  );

  return {
    customPanels,
    handleClosePanel,
    openPanel,
    closePanel,
  };
}
