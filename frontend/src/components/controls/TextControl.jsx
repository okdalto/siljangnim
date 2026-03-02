import { useRef, useState, useCallback } from "react";

export default function TextControl({ ctrl, onUniformChange }) {
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
      setEditText(String(value));
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
