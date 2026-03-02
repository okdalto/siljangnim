import { useEffect, useRef, useState, useCallback } from "react";
import { sampleCurve } from "../../utils/curves.js";

export default function GraphControl({ ctrl, onUniformChange }) {
  const yMin = ctrl.min ?? 0;
  const yMax = ctrl.max ?? 1;
  const defaultPts = ctrl.default || [[0, 0], [1, 1]];

  const [points, setPoints] = useState(() =>
    defaultPts.map((p) => [...p]).sort((a, b) => a[0] - b[0])
  );
  const canvasRef = useRef(null);
  const dragging = useRef(null);
  const containerRef = useRef(null);

  const PAD = 20;

  const toCanvas = useCallback(
    (px, py, w, h) => [
      PAD + px * (w - 2 * PAD),
      (h - PAD) - ((py - yMin) / (yMax - yMin)) * (h - 2 * PAD),
    ],
    [yMin, yMax]
  );

  const fromCanvas = useCallback(
    (cx, cy, w, h) => [
      Math.max(0, Math.min(1, (cx - PAD) / (w - 2 * PAD))),
      Math.max(yMin, Math.min(yMax, yMin + (1 - (cy - PAD) / (h - 2 * PAD)) * (yMax - yMin))),
    ],
    [yMin, yMax]
  );

  const draw = useCallback(
    (pts) => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx2d = cvs.getContext("2d");
      const w = cvs.width;
      const h = cvs.height;

      ctx2d.fillStyle = "#27272a";
      ctx2d.fillRect(0, 0, w, h);

      ctx2d.strokeStyle = "#3f3f46";
      ctx2d.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const gy = PAD + (i / 4) * (h - 2 * PAD);
        ctx2d.beginPath();
        ctx2d.moveTo(PAD, gy);
        ctx2d.lineTo(w - PAD, gy);
        ctx2d.stroke();
      }
      for (let i = 0; i <= 4; i++) {
        const gx = PAD + (i / 4) * (w - 2 * PAD);
        ctx2d.beginPath();
        ctx2d.moveTo(gx, PAD);
        ctx2d.lineTo(gx, h - PAD);
        ctx2d.stroke();
      }

      const sorted = pts.slice().sort((a, b) => a[0] - b[0]);
      if (sorted.length >= 2) {
        ctx2d.strokeStyle = "#818cf8";
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        const steps = w - 2 * PAD;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const y = sampleCurve(sorted, t);
          const [cx, cy] = toCanvas(t, y, w, h);
          if (s === 0) ctx2d.moveTo(cx, cy);
          else ctx2d.lineTo(cx, cy);
        }
        ctx2d.stroke();
      }

      for (const p of sorted) {
        const [cx, cy] = toCanvas(p[0], p[1], w, h);
        ctx2d.fillStyle = "#6366f1";
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = "#c7d2fe";
        ctx2d.lineWidth = 1;
        ctx2d.stroke();
      }
    },
    [toCanvas]
  );

  useEffect(() => {
    draw(points);
  }, [points, draw]);

  useEffect(() => {
    const container = containerRef.current;
    const cvs = canvasRef.current;
    if (!container || !cvs) return;
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      cvs.width = Math.round(rect.width);
      cvs.height = 120;
      draw(points);
    });
    ro.observe(container);
    const rect = container.getBoundingClientRect();
    cvs.width = Math.round(rect.width);
    cvs.height = 120;
    draw(points);
    return () => ro.disconnect();
  }, [draw, points]);

  const emit = useCallback(
    (pts) => {
      onUniformChange?.(ctrl.uniform, pts.map((p) => [...p]));
    },
    [ctrl.uniform, onUniformChange]
  );

  const findPoint = useCallback(
    (cx, cy, w, h) => {
      for (let i = 0; i < points.length; i++) {
        const [px, py] = toCanvas(points[i][0], points[i][1], w, h);
        if (Math.hypot(cx - px, cy - py) < 10) return i;
      }
      return -1;
    },
    [points, toCanvas]
  );

  const handlePointerDown = useCallback(
    (e) => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const idx = findPoint(cx, cy, cvs.width, cvs.height);
      if (idx >= 0) {
        dragging.current = idx;
        cvs.setPointerCapture(e.pointerId);
      } else {
        const [x, y] = fromCanvas(cx, cy, cvs.width, cvs.height);
        const newPts = [...points, [x, y]].sort((a, b) => a[0] - b[0]);
        setPoints(newPts);
        emit(newPts);
      }
    },
    [points, findPoint, fromCanvas, emit]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (dragging.current === null) return;
      const cvs = canvasRef.current;
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      let [x, y] = fromCanvas(cx, cy, cvs.width, cvs.height);
      const idx = dragging.current;
      if (idx === 0) x = 0;
      else if (idx === points.length - 1) x = 1;
      const newPts = points.map((p, i) => (i === idx ? [x, y] : [...p]));
      setPoints(newPts);
      emit(newPts);
    },
    [points, fromCanvas, emit]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  const handleDoubleClick = useCallback(
    (e) => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const idx = findPoint(cx, cy, cvs.width, cvs.height);
      if (idx > 0 && idx < points.length - 1) {
        const newPts = points.filter((_, i) => i !== idx);
        setPoints(newPts);
        emit(newPts);
      }
    },
    [points, findPoint, emit]
  );

  const handleReset = useCallback(() => {
    const def = defaultPts.map((p) => [...p]).sort((a, b) => a[0] - b[0]);
    setPoints(def);
    emit(def);
  }, [defaultPts, emit]);

  return (
    <div className="space-y-1">
      <label className="flex justify-between items-center text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        <button
          onClick={handleReset}
          className="text-zinc-500 hover:text-zinc-200 transition-colors"
          title="Reset curve"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8a6 6 0 0 1 10.47-4" />
            <path d="M14 8a6 6 0 0 1-10.47 4" />
            <polyline points="12 2 13 4.5 10.5 4.5" />
            <polyline points="4 14 3 11.5 5.5 11.5" />
          </svg>
        </button>
      </label>
      <div ref={containerRef} className="w-full">
        <canvas
          ref={canvasRef}
          height={120}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          className="w-full rounded border border-zinc-600 cursor-crosshair touch-none"
          style={{ height: 120 }}
        />
      </div>
    </div>
  );
}
