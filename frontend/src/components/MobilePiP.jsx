import { useEffect, useRef, useState, useCallback } from "react";

const CORNERS = [
  { bottom: 96, right: 12 },  // bottom-right (default)
  { bottom: 96, left: 12 },   // bottom-left
  { top: 52, left: 12 },      // top-left
  { top: 52, right: 12 },     // top-right
];

export default function MobilePiP({ engineRef, onTap, onClose }) {
  const imgRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [cornerIdx, setCornerIdx] = useState(0);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    let rafId;
    let lastCapture = 0;
    const FPS_INTERVAL = 66; // ~15 FPS
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

  // Single tap: cycle corner, double tap: scroll to viewport
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastTapRef.current;
    lastTapRef.current = now;

    if (elapsed < 300) {
      // Double tap — scroll to viewport
      clearTimeout(tapTimerRef.current);
      onTap?.();
    } else {
      // Single tap — cycle corner (with delay to detect double tap)
      tapTimerRef.current = setTimeout(() => {
        setCornerIdx((prev) => (prev + 1) % CORNERS.length);
      }, 300);
    }
  }, [onTap]);

  const pos = CORNERS[cornerIdx];

  return (
    <div
      className={`fixed z-40 transition-all duration-300 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
      style={{
        width: 144,
        height: 81,
        top: pos.top ?? "auto",
        bottom: pos.bottom ?? "auto",
        left: pos.left ?? "auto",
        right: pos.right ?? "auto",
      }}
    >
      <img
        ref={imgRef}
        onClick={handleTap}
        className="w-full h-full rounded-lg shadow-lg border border-white/20 object-cover cursor-pointer bg-black"
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
