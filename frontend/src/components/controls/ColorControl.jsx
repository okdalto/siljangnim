import { useState, useCallback, useEffect } from "react";

export default function ColorControl({ ctrl, onUniformChange }) {
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

  useEffect(() => {
    const handler = (e) => {
      if (e.detail.uniform === ctrl.uniform) {
        const v = e.detail.value;
        if (Array.isArray(v) && v.length >= 3) {
          const r = Math.round(v[0] * 255).toString(16).padStart(2, "0");
          const g = Math.round(v[1] * 255).toString(16).padStart(2, "0");
          const b = Math.round(v[2] * 255).toString(16).padStart(2, "0");
          setColor(`#${r}${g}${b}`);
          if (v.length >= 4) setAlpha(v[3]);
        }
      }
    };
    window.addEventListener("uniform-external-change", handler);
    return () => window.removeEventListener("uniform-external-change", handler);
  }, [ctrl.uniform]);

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
