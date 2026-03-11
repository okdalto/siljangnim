import { useEffect, useRef, useState, useCallback } from "react";

const PIP_W = 144;
const PIP_H = 81;
const SNAP_MARGIN = 12;
const TOP_INSET = 52;
const BOTTOM_INSET = 96;

/** Compute snap targets as absolute {x, y} positions. */
function getSnapTargets(winW, winH) {
  return [
    { x: winW - PIP_W - SNAP_MARGIN, y: winH - PIP_H - BOTTOM_INSET }, // bottom-right
    { x: SNAP_MARGIN, y: winH - PIP_H - BOTTOM_INSET },               // bottom-left
    { x: SNAP_MARGIN, y: TOP_INSET },                                   // top-left
    { x: winW - PIP_W - SNAP_MARGIN, y: TOP_INSET },                   // top-right
  ];
}

/** Find the nearest corner position. */
function snapToCorner(x, y, winW, winH) {
  const targets = getSnapTargets(winW, winH);
  let best = targets[0];
  let bestDist = Infinity;
  const cx = x + PIP_W / 2;
  const cy = y + PIP_H / 2;
  for (const t of targets) {
    const tcx = t.x + PIP_W / 2;
    const tcy = t.y + PIP_H / 2;
    const d = (cx - tcx) ** 2 + (cy - tcy) ** 2;
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}

export default function MobilePiP({ engineRef, onTap, onClose }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const posRef = useRef(null); // current {x, y} — lazy-initialized
  const dragState = useRef(null);

  // Lazy-init position (needs window dimensions)
  const getPos = useCallback(() => {
    if (!posRef.current) {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      posRef.current = { x: winW - PIP_W - SNAP_MARGIN, y: winH - PIP_H - BOTTOM_INSET };
    }
    return posRef.current;
  }, []);

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

  // Apply position via transform
  const applyPos = useCallback((x, y, animate) => {
    const el = containerRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none";
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  // Double tap detection
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    if (!touch) return;
    const p = getPos();
    dragState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      origX: p.x,
      origY: p.y,
      moved: false,
    };
  }, [getPos]);

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

    applyPos(x, y, false);
  }, [applyPos]);

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
          // Single tap — no-op
        }, 300);
      }
      return;
    }

    // Snap to nearest corner with spring easing
    const el = containerRef.current;
    if (!el) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const rect = el.getBoundingClientRect();
    const snapped = snapToCorner(rect.left, rect.top, winW, winH);

    posRef.current = snapped;
    applyPos(snapped.x, snapped.y, true);
  }, [onTap, applyPos]);

  const initPos = getPos();

  return (
    <div
      ref={containerRef}
      className={`fixed z-40 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{
        width: PIP_W,
        height: PIP_H,
        top: 0,
        left: 0,
        transform: `translate(${initPos.x}px, ${initPos.y}px)`,
        transition: "opacity 0.3s ease-out",
        touchAction: "none",
        willChange: "transform",
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
