import { useEffect, useRef } from "react";

export default function BufferPreviewControl({ ctrl, engineRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");

    const intervalId = setInterval(() => {
      const engine = engineRef?.current;
      if (!engine) return;
      const imageData = engine.captureBuffer(ctrl.stateKey, ctrl.maxSize || 256);
      if (!imageData) return;

      // Resize canvas to match captured buffer dimensions
      if (canvas.width !== imageData.width || canvas.height !== imageData.height) {
        canvas.width = imageData.width;
        canvas.height = imageData.height;
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
        style={{ background: "#000", aspectRatio: "1 / 1", imageRendering: "pixelated" }}
      />
    </div>
  );
}
