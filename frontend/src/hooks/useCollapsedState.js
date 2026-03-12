import { useState, useCallback, useRef, useEffect } from "react";

export function useCollapsedState(initialValue, onChange) {
  const [collapsed, setRaw] = useState(() => initialValue ?? false);
  const setCollapsed = useCallback((v) => {
    setRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      onChange?.(next);
      return next;
    });
  }, [onChange]);
  // Sync from external restore (e.g. project load)
  const prevInit = useRef(initialValue);
  useEffect(() => {
    if (initialValue !== prevInit.current) {
      prevInit.current = initialValue;
      setRaw(initialValue ?? false);
    }
  }, [initialValue]);
  return [collapsed, setCollapsed];
}
