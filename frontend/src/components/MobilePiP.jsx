import { useEffect, useRef, useState } from "react";

export default function MobilePiP({ engineRef, onTap, onClose }) {
  const imgRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fade in after mount
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

  return (
    <div
      className={`fixed bottom-24 right-3 z-40 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ width: 144, height: 81 }}
    >
      <img
        ref={imgRef}
        onClick={onTap}
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
