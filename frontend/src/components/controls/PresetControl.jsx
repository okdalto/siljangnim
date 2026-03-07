import { useState, useCallback } from "react";

/**
 * Preset selector — lets the user pick from predefined value sets.
 * On selection, applies all uniform values from the chosen preset.
 *
 * ctrl.presets — array of { label: string, values: { uniform: value, ... } }
 * ctrl.allowSave — if true, shows a "Save" button to capture current values (future)
 */
export default function PresetControl({ ctrl, onUniformChange, engineRef }) {
  const presets = ctrl.presets || [];
  const [activeIdx, setActiveIdx] = useState(-1);

  const applyPreset = useCallback(
    (idx) => {
      const preset = presets[idx];
      if (!preset?.values) return;
      setActiveIdx(idx);
      for (const [uniform, value] of Object.entries(preset.values)) {
        onUniformChange?.(uniform, value);
      }
    },
    [presets, onUniformChange]
  );

  const handleSave = useCallback(() => {
    const engine = engineRef?.current;
    if (!engine) return;
    const ctx = engine.ctx || {};
    const uniforms = ctx.uniforms || {};
    const name = prompt("Preset name:");
    if (!name) return;
    // Dispatch custom event so external code can capture it
    window.dispatchEvent(
      new CustomEvent("preset-save", {
        detail: { name, values: { ...uniforms } },
      })
    );
  }, [engineRef]);

  return (
    <div className="space-y-1.5">
      <label className="flex justify-between items-center text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        {ctrl.allowSave && (
          <button
            onClick={handleSave}
            className="text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors px-1"
            title="Save current values as preset"
          >
            + Save
          </button>
        )}
      </label>
      <div className="flex flex-wrap gap-1">
        {presets.map((p, i) => (
          <button
            key={i}
            onClick={() => applyPreset(i)}
            className={`text-[11px] px-2 py-1 rounded transition-colors ${
              activeIdx === i
                ? "bg-indigo-500/30 text-indigo-300 border border-indigo-500"
                : "bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500"
            }`}
          >
            {p.label}
          </button>
        ))}
        {presets.length === 0 && (
          <span className="text-[10px] text-zinc-600 italic">No presets defined</span>
        )}
      </div>
    </div>
  );
}
