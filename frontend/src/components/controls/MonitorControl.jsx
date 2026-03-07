import { useEffect, useRef, useState } from "react";

/**
 * Read-only monitor that displays a value from ctx.state or ctx.uniforms.
 * Updates at ~10fps to avoid excessive re-renders.
 *
 * ctrl.stateKey  — dot-path into ctx.state (e.g. "particleCount")
 * ctrl.uniform   — alternatively read from ctx.uniforms
 * ctrl.format    — "number" (default), "int", "percent", "text"
 */
export default function MonitorControl({ ctrl, engineRef }) {
  const [display, setDisplay] = useState("—");
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const engine = engineRef?.current;
      if (!engine) return;
      const ctx = engine.ctx || {};

      let raw;
      if (ctrl.stateKey) {
        raw = getNestedValue(ctx.state, ctrl.stateKey);
      } else if (ctrl.uniform) {
        raw = ctx.uniforms?.[ctrl.uniform];
      }

      if (raw == null) { setDisplay("—"); return; }

      const fmt = ctrl.format || "number";
      if (fmt === "int") setDisplay(String(Math.round(Number(raw))));
      else if (fmt === "percent") setDisplay((Number(raw) * 100).toFixed(1) + "%");
      else if (fmt === "text") setDisplay(String(raw));
      else setDisplay(typeof raw === "number" ? raw.toFixed(3) : JSON.stringify(raw));
    }, 100);

    return () => clearInterval(intervalRef.current);
  }, [ctrl.stateKey, ctrl.uniform, ctrl.format, engineRef]);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{ctrl.label}</span>
      <span className="text-xs text-zinc-200 tabular-nums font-mono bg-zinc-800 px-2 py-0.5 rounded">
        {display}
      </span>
    </div>
  );
}

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}
