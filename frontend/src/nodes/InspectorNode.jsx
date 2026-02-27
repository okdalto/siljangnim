export default function InspectorNode({ data }) {
  const { controls = [], onUniformChange } = data;

  return (
    <div className="w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Inspector
      </div>

      {/* Dynamic Controls */}
      <div className="p-3 space-y-3 nodrag">
        {controls.length === 0 && (
          <p className="text-zinc-500 text-sm italic">No controls yet.</p>
        )}
        {controls.map((ctrl, i) => {
          if (ctrl.type === "slider") {
            return (
              <div key={i} className="space-y-1">
                <label className="flex justify-between text-xs text-zinc-400">
                  <span>{ctrl.label}</span>
                  <span>{ctrl.value?.toFixed(2) ?? ctrl.default}</span>
                </label>
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step}
                  defaultValue={ctrl.default}
                  onChange={(e) =>
                    onUniformChange?.(ctrl.uniform, parseFloat(e.target.value))
                  }
                  className="w-full accent-indigo-500"
                />
              </div>
            );
          }
          if (ctrl.type === "toggle") {
            return (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">{ctrl.label}</span>
                <input
                  type="checkbox"
                  defaultChecked={ctrl.default}
                  onChange={(e) =>
                    onUniformChange?.(ctrl.uniform, e.target.checked ? 1.0 : 0.0)
                  }
                  className="accent-indigo-500"
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
