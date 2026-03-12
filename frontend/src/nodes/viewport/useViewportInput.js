import { useCallback } from "react";

/**
 * Returns all mouse / touch / keyboard event handlers for the viewport canvas.
 */
export default function useViewportInput(engineRef, canvasRef, containerRef) {
  const getCanvasCoords = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseMove = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    engine.updateMouse(coords[0], coords[1], e.buttons > 0);
    if (!engine._mouseHover) engine.updateMouseHover(true);
  }, [getCanvasCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseDown = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    engine.updateMouse(coords[0], coords[1], true);
    containerRef.current?.focus();
  }, [getCanvasCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseUp = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    engine.updateMouse(coords[0], coords[1], false);
  }, [getCanvasCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseEnter = useCallback(() => {
    engineRef.current?.updateMouseHover(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseLeave = useCallback(() => {
    engineRef.current?.updateMouseHover(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTouchStart = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine || !e.touches.length) return;
    const touch = e.touches[0];
    const coords = getCanvasCoords(touch.clientX, touch.clientY);
    if (!coords) return;
    engine.updateMouse(coords[0], coords[1], true);
    e.preventDefault();
  }, [getCanvasCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTouchMove = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine || !e.touches.length) return;
    const touch = e.touches[0];
    const coords = getCanvasCoords(touch.clientX, touch.clientY);
    if (!coords) return;
    engine.updateMouse(coords[0], coords[1], true);
    e.preventDefault();
  }, [getCanvasCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTouchEnd = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.updateMouse(engine._mouse[0], engine._mouse[1], false);
    e.preventDefault();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine) return;
    e.stopPropagation();
    e.preventDefault();
    engine.updateKey(e.code, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyUp = useCallback((e) => {
    const engine = engineRef.current;
    if (!engine) return;
    e.stopPropagation();
    e.preventDefault();
    engine.updateKey(e.code, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.releaseAllKeys();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    handleMouseMove, handleMouseDown, handleMouseUp,
    handleMouseEnter, handleMouseLeave,
    handleTouchStart, handleTouchMove, handleTouchEnd,
    handleKeyDown, handleKeyUp, handleBlur,
    toggleFullscreen,
  };
}
