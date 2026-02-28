import { useEffect, useRef, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";

/**
 * BufferViewportNode — displays a named intermediate render buffer.
 * Uses 2D canvas + putImageData at ~15fps from GLEngine.getBufferImageData().
 */
export default function BufferViewportNode({ id, data }) {
  const { bufferName, engineRef, onClose } = data;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stopped = false;
    let timer;

    const draw = () => {
      if (stopped) return;
      const engine = engineRef?.current;
      if (engine && bufferName) {
        const imageData = engine.getBufferImageData(bufferName);
        if (imageData) {
          canvas.width = imageData.width;
          canvas.height = imageData.height;
          ctx.putImageData(imageData, 0, 0);
        }
      }
      timer = setTimeout(draw, 1000 / 15); // ~15fps
    };

    draw();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [bufferName, engineRef]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const canvas = canvasRef.current;
        if (canvas) {
          // Canvas sizing is handled by CSS; actual resolution by the engine
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleClose = useCallback(() => {
    onClose?.(id);
  }, [id, onClose]);

  return (
    <>
      <NodeResizer minWidth={200} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      <div className="w-full h-full bg-black rounded-xl overflow-hidden border border-zinc-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab shrink-0 flex items-center justify-between">
          <span>{bufferName || "Buffer"}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-400">
              Buffer
            </span>
            <button
              onClick={handleClose}
              className="nodrag text-zinc-500 hover:text-red-400 text-xs transition-colors"
            >
              x
            </button>
          </div>
        </div>

        {/* 2D Canvas */}
        <div ref={containerRef} className="flex-1 relative nodrag min-h-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      </div>
    </>
  );
}
