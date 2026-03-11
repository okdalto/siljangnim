import { useEffect, useRef, useState, useCallback } from "react";

const PIP_W = 144;
const PIP_H = 81;
const SNAP_MARGIN = 12;
const TOP_INSET = 52;
const BOTTOM_INSET = 96;

/** Find the nearest corner and return its {top/bottom, left/right} style. */
function snapToCorner(x, y, winW, winH) {
  const cx = x + PIP_W / 2;
  const cy = y + PIP_H / 2;
  const midX = winW / 2;
  const midY = winH / 2;

  const isRight = cx >= midX;
  const isBottom = cy >= midY;

  return {
    ...(isBottom ? { bottom: BOTTOM_INSET } : { top: TOP_INSET }),
    ...(isRight ? { right: SNAP_MARGIN } : { left: SNAP_MARGIN }),
  };
}

/** Convert corner style object to absolute {x, y} for drag tracking. */
function cornerToXY(pos, winW, winH) {
  const x = pos.right != null ? winW - PIP_W - pos.right : pos.left;
  const y = pos.bottom != null ? winH - PIP_H - pos.bottom : pos.top;
  return { x, y };
}

export default function MobilePiP({ engineRef, onTap, onClose }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ bottom: BOTTOM_INSET, right: SNAP_MARGIN });
  const dragState = useRef(null); // { startX, startY, origX, origY }

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Capture canvas frames at ~15 FPS
  useEffect(() => {
    let rafId;
    let lastCapture = 0;
    const FPS_INTERVAL = 66;
    const tick = (now) => {
      rafId = requestAnimationFrame(tick);
      if (now - lastCapture < FPS_INTERVAL) return;
      lastCapture = now;
      const canvas = engineRef.current?.canvas;
      if (!canvas || !imgRef.current) return;
      try {
        imgRef.current.src = canvas.toDataURL("image/jpeg", 0.6);
      } catch (_) {
        /* ignore security errors */
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [engineRef]);

  // Double tap: scroll to viewport
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    if (!touch) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const xy = cornerToXY(pos, winW, winH);
    dragState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      origX: xy.x,
      origY: xy.y,
      moved: false,
    };
  }, [pos]);

  const handleTouchMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - ds.startX;
    const dy = touch.clientY - ds.startY;

    if (!ds.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    ds.moved = true;

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const x = Math.max(0, Math.min(winW - PIP_W, ds.origX + dx));
    const y = Math.max(0, Math.min(winH - PIP_H, ds.origY + dy));

    // Use transform for smooth drag (no re-layout)
    if (containerRef.current) {
      containerRef.current.style.transition = "none";
      containerRef.current.style.top = `${y}px`;
      containerRef.current.style.bottom = "auto";
      containerRef.current.style.left = `${x}px`;
      containerRef.current.style.right = "auto";
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const ds = dragState.current;
    dragState.current = null;

    if (!ds || !ds.moved) {
      // It was a tap, not a drag
      const now = Date.now();
      const elapsed = now - lastTapRef.current;
      lastTapRef.current = now;

      if (elapsed < 300) {
        clearTimeout(tapTimerRef.current);
        onTap?.();
      } else {
        tapTimerRef.current = setTimeout(() => {
          // Single tap — no-op (drag-only now)
        }, 300);
      }
      return;
    }

    // Snap to nearest corner
    const el = containerRef.current;
    if (!el) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const rect = el.getBoundingClientRect();
    const snapped = snapToCorner(rect.left, rect.top, winW, winH);

    // Animate to snapped position
    el.style.transition = "all 0.3s ease-out";
    el.style.top = snapped.top != null ? `${snapped.top}px` : "auto";
    el.style.bottom = snapped.bottom != null ? `${snapped.bottom}px` : "auto";
    el.style.left = snapped.left != null ? `${snapped.left}px` : "auto";
    el.style.right = snapped.right != null ? `${snapped.right}px` : "auto";

    setPos(snapped);
  }, [onTap]);

  return (
    <div
      ref={containerRef}
      className={`fixed z-40 transition-all duration-300 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
      style={{
        width: PIP_W,
        height: PIP_H,
        top: pos.top ?? "auto",
        bottom: pos.bottom ?? "auto",
        left: pos.left ?? "auto",
        right: pos.right ?? "auto",
        touchAction: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <img
        ref={imgRef}
        className="w-full h-full rounded-lg shadow-lg border border-white/20 object-cover cursor-pointer bg-black pointer-events-none"
        draggable={false}
        alt="PiP viewport"
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-neutral-800 border border-white/20 text-white text-xs flex items-center justify-center shadow cursor-pointer hover:bg-neutral-700"
      >
        ×
      </button>
    </div>
  );
}
