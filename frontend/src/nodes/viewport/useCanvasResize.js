import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manages canvas resolution: fixed vs auto via ResizeObserver.
 * Returns { resolution, fixedResolution, setFixedResolution }.
 */
export default function useCanvasResize(engineRef, containerRef, { initialFixedResolution, onFixedResolutionChange }) {
  const [resolution, setResolution] = useState([0, 0]);
  const [fixedResolution, setFixedResolutionRaw] = useState(() => initialFixedResolution ?? null);
  const setFixedResolution = useCallback((v) => {
    setFixedResolutionRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      onFixedResolutionChange?.(next);
      return next;
    });
  }, [onFixedResolutionChange]);

  // Sync fixedResolution when project is restored
  const prevInitFixedRes = useRef(initialFixedResolution);
  useEffect(() => {
    if (initialFixedResolution !== prevInitFixedRes.current) {
      prevInitFixedRes.current = initialFixedResolution;
      setFixedResolutionRaw(initialFixedResolution ?? null);
    }
  }, [initialFixedResolution]);

  const fixedResRef = useRef(fixedResolution);
  fixedResRef.current = fixedResolution;

  // Apply fixed resolution or revert to auto
  useEffect(() => {
    const engine = engineRef.current;
    const container = containerRef.current;
    if (!engine) return;
    if (fixedResolution) {
      engine.resize(fixedResolution[0], fixedResolution[1]);
      setResolution(fixedResolution);
    } else if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rw = Math.floor(rect.width * dpr);
        const rh = Math.floor(rect.height * dpr);
        engine.resize(rw, rh);
        setResolution([rw, rh]);
      }
    }
  }, [fixedResolution]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize observer (stable — never recreated)
  useEffect(() => {
    const container = containerRef.current;
    const engine = engineRef.current;
    if (!container || !engine) return;

    const observer = new ResizeObserver((entries) => {
      if (fixedResRef.current) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const rw = Math.floor(width * dpr);
          const rh = Math.floor(height * dpr);
          engine.resize(rw, rh);
          setResolution([rw, rh]);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { resolution, fixedResolution, setFixedResolution };
}
