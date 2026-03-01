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
  const [color, setColor] = useState(ctrl.default || "#ffffff");

  const handleChange = useCallback(
    (e) => {
      const hex = e.target.value;
      setColor(hex);
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      onUniformChange?.(ctrl.uniform, [r, g, b]);
    },
    [ctrl.uniform, onUniformChange]
  );

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{ctrl.label}</span>
      <input
        type="color"
        value={color}
        onChange={handleChange}
        className="w-8 h-6 rounded border border-zinc-600 bg-transparent cursor-pointer"
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
          return null;
        })}

      </div>
    </div>
  );
}
