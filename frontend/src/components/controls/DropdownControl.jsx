import { useState, useCallback, useEffect } from "react";

export default function DropdownControl({ ctrl, onUniformChange }) {
  const [value, setValue] = useState(ctrl.default ?? 0);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail.uniform === ctrl.uniform) setValue(e.detail.value);
    };
    window.addEventListener("uniform-external-change", handler);
    return () => window.removeEventListener("uniform-external-change", handler);
  }, [ctrl.uniform]);

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
