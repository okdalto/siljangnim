import { useRef, useState, useCallback, useEffect } from "react";
import useExternalUniformChange from "../../hooks/useExternalUniformChange.js";

const LABELS = ["X", "Y", "Z"];
const COLORS = ["text-red-400", "text-green-400", "text-blue-400"];

export default function Vec3Control({ ctrl, onUniformChange }) {
  const [values, setValues] = useState(() => {
    const d = ctrl.default || [0, 0, 0];
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  });
  const [editIdx, setEditIdx] = useState(-1);
  const [editText, setEditText] = useState("");
  const inputRef = useRef(null);
  const step = ctrl.step ?? 0.01;
  const min = ctrl.min ?? -Infinity;
  const max = ctrl.max ?? Infinity;

  useExternalUniformChange(ctrl.uniform, (v) => {
    if (Array.isArray(v) && v.length >= 3) setValues([v[0], v[1], v[2]]);
  });

  // Sync from ctrl.default when the agent updates uniform values
  const ctrlDefault = ctrl.default;
  useEffect(() => {
    const d = ctrlDefault || [0, 0, 0];
    setValues([d[0] ?? 0, d[1] ?? 0, d[2] ?? 0]);
  }, [ctrlDefault]);

  const emit = useCallback(
    (next) => {
      onUniformChange?.(ctrl.uniform, next);
    },
    [ctrl.uniform, onUniformChange]
  );

  const handleScrub = useCallback(
    (idx, e) => {
      const v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      const clamped = Math.min(max, Math.max(min, v));
      setValues((prev) => {
        const next = [...prev];
        next[idx] = clamped;
        emit(next);
        return next;
      });
    },
    [emit, min, max]
  );

  const startEdit = useCallback((idx) => {
    setEditIdx(idx);
    setEditText(String(values[idx]));
    setTimeout(() => inputRef.current?.select(), 0);
  }, [values]);

  const commitEdit = useCallback(() => {
    if (editIdx < 0) return;
    const v = parseFloat(editText);
    if (!isNaN(v)) {
      const clamped = Math.min(max, Math.max(min, v));
      setValues((prev) => {
        const next = [...prev];
        next[editIdx] = clamped;
        emit(next);
        return next;
      });
    }
    setEditIdx(-1);
  }, [editIdx, editText, emit, min, max]);

  const handleReset = useCallback(() => {
    const d = ctrl.default || [0, 0, 0];
    const next = [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    setValues(next);
    emit(next);
  }, [ctrl.default, emit]);

  return (
    <div className="space-y-1">
      <label className="flex justify-between items-center text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        <button
          onClick={handleReset}
          className="text-zinc-500 hover:text-zinc-200 transition-colors"
          title="Reset"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8a6 6 0 0 1 10.47-4" />
            <path d="M14 8a6 6 0 0 1-10.47 4" />
            <polyline points="12 2 13 4.5 10.5 4.5" />
            <polyline points="4 14 3 11.5 5.5 11.5" />
          </svg>
        </button>
      </label>
      <div className="flex gap-1">
        {LABELS.map((lbl, i) => (
          <div key={lbl} className="flex-1 flex items-center gap-1">
            <span className={`text-[10px] font-semibold ${COLORS[i]}`}>{lbl}</span>
            {editIdx === i ? (
              <input
                ref={inputRef}
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditIdx(-1);
                }}
                className="w-full bg-zinc-800 text-zinc-100 text-[11px] rounded px-1 py-0.5 outline-none ring-1 ring-indigo-500 tabular-nums"
              />
            ) : (
              <input
                type="number"
                value={values[i]}
                step={step}
                onChange={(e) => handleScrub(i, e)}
                onClick={() => startEdit(i)}
                className="w-full bg-zinc-800 text-zinc-200 text-[11px] rounded px-1 py-0.5 border border-zinc-700 outline-none focus:ring-1 focus:ring-indigo-500 tabular-nums"
                style={{ MozAppearance: "textfield" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
