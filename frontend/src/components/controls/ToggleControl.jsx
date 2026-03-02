import { useState, useCallback, useEffect } from "react";

export default function ToggleControl({ ctrl, onUniformChange }) {
  const [checked, setChecked] = useState(!!ctrl.default);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail.uniform === ctrl.uniform) {
        setChecked(e.detail.value > 0.5);
      }
    };
    window.addEventListener("uniform-external-change", handler);
    return () => window.removeEventListener("uniform-external-change", handler);
  }, [ctrl.uniform]);

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
