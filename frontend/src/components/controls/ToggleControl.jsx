import { useState, useCallback } from "react";
import useExternalUniformChange from "../../hooks/useExternalUniformChange.js";

export default function ToggleControl({ ctrl, onUniformChange }) {
  const [checked, setChecked] = useState(!!ctrl.default);

  useExternalUniformChange(ctrl.uniform, (v) => setChecked(v > 0.5));

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
