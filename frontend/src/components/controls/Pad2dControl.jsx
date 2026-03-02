import { useRef, useState, useCallback } from "react";

export default function Pad2dControl({ ctrl, onUniformChange }) {
  const minX = ctrl.min?.[0] ?? -1;
  const minY = ctrl.min?.[1] ?? -1;
  const maxX = ctrl.max?.[0] ?? 1;
  const maxY = ctrl.max?.[1] ?? 1;
  const [pos, setPos] = useState(ctrl.default || [0, 0]);
  const padRef = useRef(null);
  const dragging = useRef(false);

  const updateFromPointer = useCallback(
    (e) => {
      const rect = padRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const x = minX + nx * (maxX - minX);
      const y = maxY - ny * (maxY - minY);
      const next = [x, y];
      setPos(next);
      onUniformChange?.(ctrl.uniform, next);
    },
    [minX, minY, maxX, maxY, ctrl.uniform, onUniformChange]
  );

  const onPointerDown = useCallback(
    (e) => {
      dragging.current = true;
      padRef.current?.setPointerCapture(e.pointerId);
      updateFromPointer(e);
    },
    [updateFromPointer]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (dragging.current) updateFromPointer(e);
    },
    [updateFromPointer]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onDoubleClick = useCallback(() => {
    const def = ctrl.default || [0, 0];
    setPos(def);
    onUniformChange?.(ctrl.uniform, def);
  }, [ctrl.default, ctrl.uniform, onUniformChange]);

  const dotX = ((pos[0] - minX) / (maxX - minX)) * 100;
  const dotY = ((maxY - pos[1]) / (maxY - minY)) * 100;

  return (
    <div className="space-y-1">
      <label className="flex justify-between text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        <span className="tabular-nums">
          {pos[0].toFixed(2)}, {pos[1].toFixed(2)}
        </span>
      </label>
      <div
        ref={padRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        className="relative w-full aspect-square bg-zinc-800 rounded border border-zinc-600 cursor-crosshair touch-none"
      >
        <div
          className="absolute left-0 right-0 h-px bg-zinc-600 pointer-events-none"
          style={{ top: `${dotY}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-zinc-600 pointer-events-none"
          style={{ left: `${dotX}%` }}
        />
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${dotX}%`, top: `${dotY}%` }}
        />
      </div>
    </div>
  );
}
