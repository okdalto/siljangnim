import { useEffect, useRef, useState, useCallback } from "react";

function SliderControl({ ctrl, onUniformChange }) {
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
      <label className="flex justify-between text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        <span>{value.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min={ctrl.min}
        max={ctrl.max}
        step={ctrl.step}
        value={value}
        onChange={handleChange}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}

function ToggleControl({ ctrl, onUniformChange }) {
  const [checked, setChecked] = useState(!!ctrl.default);

  const handleChange = useCallback(
    (e) => {
      setChecked(e.target.checked);
      onUniformChange?.(ctrl.uniform, e.target.checked ? 1.0 : 0.0);
    },
    [ctrl.uniform, onUniformChange]
  );

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{ctrl.label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="accent-indigo-500"
      />
    </div>
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

export default function InspectorNode({ data }) {
  const {
    controls = [],
    bufferNames = [],
    onUniformChange,
    onOpenBufferViewport,
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
    <div className="w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Inspector
      </div>

      {/* Dynamic Controls */}
      <div ref={controlsRef} className="p-3 space-y-3 max-h-72 overflow-y-auto nodrag nowheel">
        {controls.length === 0 && bufferNames.length === 0 && (
          <p className="text-zinc-500 text-sm italic">No controls yet.</p>
        )}
        {controls.map((ctrl) => {
          const key = ctrl.uniform || ctrl.label;
          if (ctrl.type === "slider") {
            return <SliderControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "toggle") {
            return <ToggleControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "color") {
            return <ColorControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          return null;
        })}

        {/* Buffer Viewports */}
        {bufferNames.length > 0 && (
          <div className="pt-2 border-t border-zinc-700 space-y-1.5">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Buffers
            </p>
            {bufferNames.map((name) => (
              <button
                key={name}
                onClick={() => onOpenBufferViewport?.(name)}
                className="w-full text-left text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1.5 rounded transition-colors flex items-center justify-between"
              >
                <span>{name}</span>
                <span className="text-zinc-500 text-[10px]">View</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
