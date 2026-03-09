import { useState, useCallback, useEffect } from "react";
import useExternalUniformChange from "../../hooks/useExternalUniformChange.js";
import { rgbArrayToHex, hexToRgb } from "../../utils/colorUtils.js";

function parseColorDefault(d) {
  const hex = (typeof d === "string" ? d : "#ffffff").slice(0, 7);
  const a = (typeof d === "string" && d.length === 9) ? parseInt(d.slice(7, 9), 16) / 255 : 1;
  return { hex: hex || "#ffffff", a };
}

export default function ColorControl({ ctrl, onUniformChange }) {
  const [color, setColor] = useState(() => parseColorDefault(ctrl.default).hex);
  const [alpha, setAlpha] = useState(() => parseColorDefault(ctrl.default).a);

  // Sync from ctrl.default when the agent updates uniform values in scene.json
  const ctrlDefault = ctrl.default;
  useEffect(() => {
    const { hex, a } = parseColorDefault(ctrlDefault);
    setColor(hex);
    setAlpha(a);
  }, [ctrlDefault]);

  useExternalUniformChange(ctrl.uniform, (v) => {
    if (Array.isArray(v) && v.length >= 3) {
      setColor(rgbArrayToHex(v));
      if (v.length >= 4) setAlpha(v[3]);
    }
  });

  const emit = useCallback(
    (hex, a) => {
      const [r, g, b] = hexToRgb(hex);
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
