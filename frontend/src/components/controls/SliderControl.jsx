import { useEffect, useRef, useState, useCallback } from "react";

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

export default function SliderControl({ ctrl, onUniformChange, keyframeManagerRef, engineRef, onOpenKeyframeEditor }) {
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

  useEffect(() => {
    if (ctrl.min != null) setRangeMin(ctrl.min);
    if (ctrl.max != null) setRangeMax(ctrl.max);
  }, [ctrl.min, ctrl.max]);

  // Listen for external value changes (undo/redo)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail.uniform === ctrl.uniform) {
        setValue(e.detail.value);
      }
    };
    window.addEventListener("uniform-external-change", handler);
    return () => window.removeEventListener("uniform-external-change", handler);
  }, [ctrl.uniform]);

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
