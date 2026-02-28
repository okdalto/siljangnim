import { useEffect, useRef, useState, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";

function stepDecimals(step) {
  if (!step || step >= 1) return 0;
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

function SliderControl({ ctrl, onUniformChange }) {
  const [value, setValue] = useState(ctrl.default ?? 0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef(null);
  const decimals = Math.max(stepDecimals(ctrl.step), 0);

  const handleChange = useCallback(
    (e) => {
      const v = parseFloat(e.target.value);
      setValue(v);
      onUniformChange?.(ctrl.uniform, v);
    },
    [ctrl.uniform, onUniformChange]
  );

  const startEditing = useCallback(() => {
    setEditText(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value]);

  const commitEdit = useCallback(() => {
    const v = parseFloat(editText);
    if (!isNaN(v)) {
      const clamped = Math.min(Math.max(v, ctrl.min ?? -Infinity), ctrl.max ?? Infinity);
      setValue(clamped);
      onUniformChange?.(ctrl.uniform, clamped);
    }
    setEditing(false);
  }, [editText, ctrl.min, ctrl.max, ctrl.uniform, onUniformChange]);

  const handleKeyDown = useCallback(
    (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commitEdit();
      if (e.key === "Escape") setEditing(false);
    },
    [commitEdit]
  );

  return (
    <div className="space-y-1">
      <label className="flex justify-between text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-16 bg-zinc-800 text-zinc-100 text-xs text-right rounded px-1 py-0 outline-none ring-1 ring-indigo-500"
          />
        ) : (
          <span
            onClick={startEditing}
            className="cursor-text hover:text-zinc-200 tabular-nums"
            title="Click to edit"
          >
            {value.toFixed(decimals)}
          </span>
        )}
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

function ButtonControl({ ctrl, onUniformChange }) {
  const [firing, setFiring] = useState(false);

  const handleClick = useCallback(() => {
    onUniformChange?.(ctrl.uniform, 1.0);
    setFiring(true);
    setTimeout(() => {
      onUniformChange?.(ctrl.uniform, 0.0);
      setFiring(false);
    }, 100);
  }, [ctrl.uniform, onUniformChange]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={firing}
      className={`w-full text-xs font-medium px-3 py-1.5 rounded transition-colors ${
        firing
          ? "bg-indigo-400 text-white"
          : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
      }`}
    >
      {ctrl.label}
    </button>
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

function DropdownControl({ ctrl, onUniformChange }) {
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

function Pad2dControl({ ctrl, onUniformChange }) {
  const minX = ctrl.min?.[0] ?? -1;
  const minY = ctrl.min?.[1] ?? -1;
  const maxX = ctrl.max?.[0] ?? 1;
  const maxY = ctrl.max?.[1] ?? 1;
  const [pos, setPos] = useState(ctrl.default || [0, 0]);
  const padRef = useRef(null);
  const dragging = useRef(false);

  const updateFromPointer = useCallback(
    (e) => {
      const rect = padRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const x = minX + nx * (maxX - minX);
      const y = maxY - ny * (maxY - minY); // Y inverted: top = max
      const next = [x, y];
      setPos(next);
      onUniformChange?.(ctrl.uniform, next);
    },
    [minX, minY, maxX, maxY, ctrl.uniform, onUniformChange]
  );

  const onPointerDown = useCallback(
    (e) => {
      dragging.current = true;
      padRef.current?.setPointerCapture(e.pointerId);
      updateFromPointer(e);
    },
    [updateFromPointer]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (dragging.current) updateFromPointer(e);
    },
    [updateFromPointer]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onDoubleClick = useCallback(() => {
    const def = ctrl.default || [0, 0];
    setPos(def);
    onUniformChange?.(ctrl.uniform, def);
  }, [ctrl.default, ctrl.uniform, onUniformChange]);

  // Normalized position for display (0-1)
  const dotX = ((pos[0] - minX) / (maxX - minX)) * 100;
  const dotY = ((maxY - pos[1]) / (maxY - minY)) * 100; // Y inverted

  return (
    <div className="space-y-1">
      <label className="flex justify-between text-xs text-zinc-400">
        <span>{ctrl.label}</span>
        <span className="tabular-nums">
          {pos[0].toFixed(2)}, {pos[1].toFixed(2)}
        </span>
      </label>
      <div
        ref={padRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        className="relative w-full aspect-square bg-zinc-800 rounded border border-zinc-600 cursor-crosshair touch-none"
      >
        {/* Crosshair lines */}
        <div
          className="absolute left-0 right-0 h-px bg-zinc-600 pointer-events-none"
          style={{ top: `${dotY}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-zinc-600 pointer-events-none"
          style={{ left: `${dotX}%` }}
        />
        {/* Dot indicator */}
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${dotX}%`, top: `${dotY}%` }}
        />
      </div>
    </div>
  );
}

function SeparatorControl({ ctrl }) {
  return (
    <div className="pt-1">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-700 pb-1">
        {ctrl.label}
      </p>
    </div>
  );
}

function TextControl({ ctrl, onUniformChange }) {
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
      setEditText(String(value)); // restore on bad input
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
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={240} minHeight={150} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Inspector
      </div>

      {/* Dynamic Controls */}
      <div ref={controlsRef} className="flex-1 px-4 py-3 space-y-3 overflow-y-auto nodrag nowheel">
        {controls.length === 0 && bufferNames.length === 0 && (
          <p className="text-zinc-500 text-sm italic">No controls yet.</p>
        )}
        {controls.filter((c) => c.type !== "rotation3d" && c.type !== "pad2d").map((ctrl) => {
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
          if (ctrl.type === "button") {
            return <ButtonControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "dropdown") {
            return <DropdownControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "pad2d") {
            return <Pad2dControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
          }
          if (ctrl.type === "separator") {
            return <SeparatorControl key={key} ctrl={ctrl} />;
          }
          if (ctrl.type === "text") {
            return <TextControl key={key} ctrl={ctrl} onUniformChange={onUniformChange} />;
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
