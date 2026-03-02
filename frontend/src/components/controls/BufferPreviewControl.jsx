import { useEffect, useRef, useState } from "react";

export default function BufferPreviewControl({ ctrl, engineRef }) {
  const canvasRef = useRef(null);
  const [aspect, setAspect] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");

    const intervalId = setInterval(() => {
      const engine = engineRef?.current;
      if (!engine) return;
      const imageData = engine.captureBuffer(ctrl.stateKey, ctrl.maxSize || 256);
      if (!imageData) return;

      if (canvas.width !== imageData.width || canvas.height !== imageData.height) {
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        setAspect(imageData.width / imageData.height);
      }
      ctx2d.putImageData(imageData, 0, 0);
    }, 200); // ~5fps

    return () => clearInterval(intervalId);
  }, [ctrl.stateKey, ctrl.maxSize, engineRef]);

  return (
    <div className="space-y-1">
      <label className="block text-xs text-zinc-400">{ctrl.label}</label>
      <canvas
        ref={canvasRef}
        className="w-full rounded"
        style={{ background: "#000", aspectRatio: `${aspect}` }}
      />
    </div>
  );
}
