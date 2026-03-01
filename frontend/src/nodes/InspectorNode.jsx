import { useEffect, useRef, useState, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";

function stepDecimals(step) {
  if (!step || step >= 1) return 0;
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

function EditableRangeLabel({ value, onChange, side }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const ref = useRef(null);

  const commit = useCallback(() => {
    const v = parseFloat(text);
    if (!isNaN(v)) onChange(v);
    else setText(String(value));
    setEditing(false);
  }, [text, value, onChange]);

  const start = useCallback(() => {
    setText(String(value));
    setEditing(true);
    setTimeout(() => ref.current?.select(), 0);
  }, [value]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setText(String(value)); setEditing(false); }
        }}
        className={`w-12 bg-zinc-800 text-zinc-100 text-[10px] rounded px-1 py-0 outline-none ring-1 ring-indigo-500 tabular-nums ${side === "left" ? "text-left" : "text-right"}`}
      />
    );
  }

  return (
    <span
      onClick={start}
      className="text-[10px] text-zinc-600 hover:text-zinc-400 cursor-text tabular-nums transition-colors"
      title="Click to edit range"
    >
      {value}
    </span>
  );
}

function SliderControl({ ctrl, onUniformChange, keyframeManagerRef, engineRef, onOpenKeyframeEditor }) {
  const [value, setValue] = useState(ctrl.default ?? 0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [rangeMin, setRangeMin] = useState(ctrl.min ?? 0);
  const [rangeMax, setRangeMax] = useState(ctrl.max ?? 1);
  const inputRef = useRef(null);
  const sliderRef = useRef(null);
  const valueDisplayRef = useRef(null);
  const decimals = Math.max(stepDecimals(ctrl.step), 0);

  const defaultVal = ctrl.default ?? 0;

  const hasKf = keyframeManagerRef?.current?.hasKeyframes(ctrl.uniform);

  // Sync from ctrl when agent updates min/max
  useEffect(() => {
    if (ctrl.min != null) setRangeMin(ctrl.min);
    if (ctrl.max != null) setRangeMax(ctrl.max);
  }, [ctrl.min, ctrl.max]);

  // rAF loop: when keyframes are active, track interpolated value via DOM
  useEffect(() => {
    if (!hasKf) return;
    let rafId;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const km = keyframeManagerRef?.current;
      const engine = engineRef?.current;
      if (!km || !engine) return;
      const v = km.evaluate(ctrl.uniform, engine.getCurrentTime());
      if (v !== null) {
        if (sliderRef.current) sliderRef.current.value = v;
        if (valueDisplayRef.current) valueDisplayRef.current.textContent = v.toFixed(decimals);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [hasKf, ctrl.uniform, keyframeManagerRef, engineRef, decimals]);

  const handleChange = useCallback(
    (e) => {
      const v = parseFloat(e.target.value);
      setValue(v);
      onUniformChange?.(ctrl.uniform, v);
    },
    [ctrl.uniform, onUniformChange]
  );

  const handleReset = useCallback(() => {
    setValue(defaultVal);
    onUniformChange?.(ctrl.uniform, defaultVal);
  }, [defaultVal, ctrl.uniform, onUniformChange]);

  const startEditing = useCallback(() => {
    setEditText(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value]);

  const commitEdit = useCallback(() => {
    const v = parseFloat(editText);
    if (!isNaN(v)) {
      const clamped = Math.min(Math.max(v, rangeMin), rangeMax);
      setValue(clamped);
      onUniformChange?.(ctrl.uniform, clamped);
    }
    setEditing(false);
  }, [editText, rangeMin, rangeMax, ctrl.uniform, onUniformChange]);

  const handleKeyDown = useCallback(
    (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commitEdit();
      if (e.key === "Escape") setEditing(false);
    },
    [commitEdit]
  );

  const handleMinChange = useCallback((v) => {
    if (v >= rangeMax) return;
    setRangeMin(v);
    if (value < v) { setValue(v); onUniformChange?.(ctrl.uniform, v); }
  }, [rangeMax, value, ctrl.uniform, onUniformChange]);

  const handleMaxChange = useCallback((v) => {
    if (v <= rangeMin) return;
    setRangeMax(v);
    if (value > v) { setValue(v); onUniformChange?.(ctrl.uniform, v); }
  }, [rangeMin, value, ctrl.uniform, onUniformChange]);

  return (
    <div className="space-y-1">
      <label className="flex justify-between items-center text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        <span className="flex items-center gap-1">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="w-16 bg-zinc-800 text-zinc-100 text-xs text-right rounded px-1 py-0 outline-none ring-1 ring-indigo-500"
            />
          ) : (
            <span
              ref={valueDisplayRef}
              onClick={startEditing}
              className="cursor-text hover:text-zinc-200 tabular-nums"
              title="Click to edit"
            >
              {value.toFixed(decimals)}
            </span>
          )}
          <button
            onClick={handleReset}
            className={`transition-colors ${value !== defaultVal ? "text-zinc-500 hover:text-zinc-200" : "invisible"}`}
            title={`Reset to ${defaultVal}`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8a6 6 0 0 1 10.47-4" />
              <path d="M14 8a6 6 0 0 1-10.47 4" />
              <polyline points="12 2 13 4.5 10.5 4.5" />
              <polyline points="4 14 3 11.5 5.5 11.5" />
            </svg>
          </button>
          {onOpenKeyframeEditor && (
            <button
              onClick={() => onOpenKeyframeEditor(ctrl)}
              className={`transition-colors ${hasKf ? "text-indigo-400 hover:text-indigo-300" : "text-zinc-600 hover:text-zinc-400"}`}
              title="Keyframe editor"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1 L12 8 L8 15 L4 8 Z" />
              </svg>
            </button>
          )}
        </span>
      </label>
      <input
        ref={sliderRef}
        type="range"
        min={rangeMin}
        max={rangeMax}
        step={ctrl.step}
        value={value}
        onChange={handleChange}
        className="w-full accent-indigo-500"
      />
      <div className="flex justify-between">
        <EditableRangeLabel value={rangeMin} onChange={handleMinChange} side="left" />
        <EditableRangeLabel value={rangeMax} onChange={handleMaxChange} side="right" />
      </div>
    </div>
  );
}

function ToggleControl({ ctrl, onUniformChange }) {
  const [checked, setChecked] = useState(!!ctrl.default);

  const toggle = useCallback(() => {
    setChecked((prev) => {
      const next = !prev;
      onUniformChange?.(ctrl.uniform, next ? 1.0 : 0.0);
      return next;
    });
  }, [ctrl.uniform, onUniformChange]);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{ctrl.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={toggle}
        className={`relative w-8 h-[18px] rounded-full transition-colors ${
          checked ? "bg-indigo-500" : "bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-3.5" : ""
          }`}
        />
      </button>
    </div>
  );
}

function ButtonControl({ ctrl, onUniformChange }) {
  const [firing, setFiring] = useState(false);

  const handleClick = useCallback(() => {
    onUniformChange?.(ctrl.uniform, 1.0);
    setFiring(true);
    setTimeout(() => {
      onUniformChange?.(ctrl.uniform, 0.0);
      setFiring(false);
    }, 100);
  }, [ctrl.uniform, onUniformChange]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={firing}
      className={`w-full text-xs font-medium px-3 py-1.5 rounded transition-colors ${
        firing
          ? "bg-indigo-400 text-white"
          : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
      }`}
    >
      {ctrl.label}
    </button>
  );
}

function ColorControl({ ctrl, onUniformChange }) {
  const [color, setColor] = useState(() => {
    const d = ctrl.default || "#ffffff";
    if (typeof d === "string") return d.slice(0, 7);
    return "#ffffff";
  });
  const [alpha, setAlpha] = useState(() => {
    const d = ctrl.default;
    if (typeof d === "string" && d.length === 9) {
      return parseInt(d.slice(7, 9), 16) / 255;
    }
    return 1;
  });

  const emit = useCallback(
    (hex, a) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      onUniformChange?.(ctrl.uniform, [r, g, b, a]);
    },
    [ctrl.uniform, onUniformChange]
  );

  const handleColorChange = useCallback(
    (e) => {
      const hex = e.target.value;
      setColor(hex);
      emit(hex, alpha);
    },
    [alpha, emit]
  );

  const handleAlphaChange = useCallback(
    (e) => {
      const a = parseFloat(e.target.value);
      setAlpha(a);
      emit(color, a);
    },
    [color, emit]
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{ctrl.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 tabular-nums">{Math.round(alpha * 100)}%</span>
          <input
            type="color"
            value={color}
            onChange={handleColorChange}
            className="w-8 h-6 rounded border border-zinc-600 bg-transparent cursor-pointer"
          />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={alpha}
        onChange={handleAlphaChange}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}

function DropdownControl({ ctrl, onUniformChange }) {
  const [value, setValue] = useState(ctrl.default ?? 0);

  const handleChange = useCallback(
    (e) => {
      const v = parseFloat(e.target.value);
      setValue(v);
      onUniformChange?.(ctrl.uniform, v);
    },
    [ctrl.uniform, onUniformChange]
  );

  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{ctrl.label}</label>
      <select
        value={value}
        onChange={handleChange}
        className="w-full bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border border-zinc-600 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
      >
        {(ctrl.options || []).map((opt, i) => (
          <option key={i} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Pad2dControl({ ctrl, onUniformChange }) {
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
      const y = maxY - ny * (maxY - minY); // Y inverted: top = max
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

  // Normalized position for display (0-1)
  const dotX = ((pos[0] - minX) / (maxX - minX)) * 100;
  const dotY = ((maxY - pos[1]) / (maxY - minY)) * 100; // Y inverted

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
        {/* Crosshair lines */}
        <div
          className="absolute left-0 right-0 h-px bg-zinc-600 pointer-events-none"
          style={{ top: `${dotY}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-zinc-600 pointer-events-none"
          style={{ left: `${dotX}%` }}
        />
        {/* Dot indicator */}
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${dotX}%`, top: `${dotY}%` }}
        />
      </div>
    </div>
  );
}

function SeparatorControl({ ctrl }) {
  return (
    <div className="pt-1">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-700 pb-1">
        {ctrl.label}
      </p>
    </div>
  );
}

function TextControl({ ctrl, onUniformChange }) {
  const [value, setValue] = useState(ctrl.default ?? 0);
  const [editText, setEditText] = useState(String(ctrl.default ?? 0));
  const inputRef = useRef(null);

  const commit = useCallback(() => {
    const v = parseFloat(editText);
    if (!isNaN(v)) {
      setValue(v);
      onUniformChange?.(ctrl.uniform, v);
      setEditText(String(v));
    } else {
      setEditText(String(value)); // restore on bad input
    }
  }, [editText, value, ctrl.uniform, onUniformChange]);

  const handleKeyDown = useCallback(
    (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        commit();
        inputRef.current?.blur();
      }
      if (e.key === "Escape") {
        setEditText(String(value));
        inputRef.current?.blur();
      }
    },
    [commit, value]
  );

  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{ctrl.label}</label>
      <input
        ref={inputRef}
        type="text"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="w-full bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border border-zinc-600 outline-none focus:ring-1 focus:ring-indigo-500 tabular-nums"
      />
    </div>
  );
}

/* ---------- shared Catmull-Rom helper (same logic as GLEngine.sampleCurve) ---------- */
function sampleCurve(points, t) {
  if (!points || points.length === 0) return 0;
  if (points.length === 1) return points[0][1];
  const pts = points.slice().sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[n - 1][0]) return pts[n - 1][1];
  let idx = 0;
  for (let j = 0; j < n - 1; j++) {
    if (t >= pts[j][0] && t <= pts[j + 1][0]) { idx = j; break; }
  }
  const m = new Array(n);
  for (let k = 0; k < n; k++) {
    if (k === 0) m[k] = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]);
    else if (k === n - 1) m[k] = (pts[n - 1][1] - pts[n - 2][1]) / (pts[n - 1][0] - pts[n - 2][0]);
    else m[k] = (pts[k + 1][1] - pts[k - 1][1]) / (pts[k + 1][0] - pts[k - 1][0]);
  }
  const dx = pts[idx + 1][0] - pts[idx][0];
  const u = (t - pts[idx][0]) / dx;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * pts[idx][1] + h10 * m[idx] * dx + h01 * pts[idx + 1][1] + h11 * m[idx + 1] * dx;
}

function GraphControl({ ctrl, onUniformChange }) {
  const yMin = ctrl.min ?? 0;
  const yMax = ctrl.max ?? 1;
  const defaultPts = ctrl.default || [[0, 0], [1, 1]];

  const [points, setPoints] = useState(() =>
    defaultPts.map((p) => [...p]).sort((a, b) => a[0] - b[0])
  );
  const canvasRef = useRef(null);
  const dragging = useRef(null); // index of dragged point
  const containerRef = useRef(null);

  const PAD = 20; // canvas padding

  // Convert data coords ↔ canvas coords
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

  // Draw
  const draw = useCallback(
    (pts) => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx2d = cvs.getContext("2d");
      const w = cvs.width;
      const h = cvs.height;

      // Background
      ctx2d.fillStyle = "#27272a"; // zinc-800
      ctx2d.fillRect(0, 0, w, h);

      // Grid lines
      ctx2d.strokeStyle = "#3f3f46"; // zinc-700
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

      // Curve (sample many points)
      const sorted = pts.slice().sort((a, b) => a[0] - b[0]);
      if (sorted.length >= 2) {
        ctx2d.strokeStyle = "#818cf8"; // indigo-400
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

      // Control points
      for (const p of sorted) {
        const [cx, cy] = toCanvas(p[0], p[1], w, h);
        ctx2d.fillStyle = "#6366f1"; // indigo-500
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = "#c7d2fe"; // indigo-200
        ctx2d.lineWidth = 1;
        ctx2d.stroke();
      }
    },
    [toCanvas]
  );

  // Redraw on points change
  useEffect(() => {
    draw(points);
  }, [points, draw]);

  // Resize observer for canvas
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
    // Init size
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
        // Add new point
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
      // First/last point: lock x
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
      // Don't delete first/last
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

export default function InspectorNode({ data }) {
  const {
    controls = [],
    onUniformChange,
    keyframeManagerRef,
    engineRef,
    onOpenKeyframeEditor,
  } = data;
  const controlsRef = useRef(null);

  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.stopPropagation();
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={240} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Inspector
      </div>

      {/* Dynamic Controls */}
      <div ref={controlsRef} className="flex-1 px-4 py-3 space-y-3 overflow-y-auto nodrag nowheel">
        {controls.length === 0 && (
          <p className="text-zinc-500 text-sm italic">No controls yet.</p>
        )}
        {controls.filter((c) => c.type !== "rotation3d" && c.type !== "pad2d").map((ctrl) => {
          const key = ctrl.uniform || ctrl.label;
          if (ctrl.type === "slider") {
            return <SliderControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} keyframeManagerRef={keyframeManagerRef} engineRef={engineRef} onOpenKeyframeEditor={onOpenKeyframeEditor} />;
          }
          if (ctrl.type === "toggle") {
            return <ToggleControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "color") {
            return <ColorControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "button") {
            return <ButtonControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "dropdown") {
            return <DropdownControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "pad2d") {
            return <Pad2dControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "separator") {
            return <SeparatorControl key={key} ctrl={ctrl} />;
          }
          if (ctrl.type === "text") {
            return <TextControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "graph") {
            return <GraphControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          return null;
        })}

      </div>
    </div>
  );
}
