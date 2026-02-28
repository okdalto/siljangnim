import { useEffect, useRef, useState, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";

function SliderControl({ ctrl, onUniformChange }) {
  const [value, setValue] = useState(ctrl.default ?? 0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef(null);

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
            {value.toFixed(2)}
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

/* ── Quaternion / 3-D helpers for arcball ─────────────────────────── */

function normalizeQuat(q) {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return len < 1e-12 ? [1, 0, 0, 0] : [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function multiplyQuat(a, b) {
  return normalizeQuat([
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ]);
}

function quatRotateVec(q, v) {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + y * tz - z * ty,
    vy + w * ty + z * tx - x * tz,
    vz + w * tz + x * ty - y * tx,
  ];
}

function quatFromVectors(from, to) {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (dot > 0.999999) return [1, 0, 0, 0];
  if (dot < -0.999999) {
    // 180-degree rotation — pick an arbitrary perpendicular axis
    let axis = [1, 0, 0];
    if (Math.abs(from[0]) > 0.9) axis = [0, 1, 0];
    const cx = from[1] * axis[2] - from[2] * axis[1];
    const cy = from[2] * axis[0] - from[0] * axis[2];
    const cz = from[0] * axis[1] - from[1] * axis[0];
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    return normalizeQuat([0, cx / len, cy / len, cz / len]);
  }
  const cx = from[1] * to[2] - from[2] * to[1];
  const cy = from[2] * to[0] - from[0] * to[2];
  const cz = from[0] * to[1] - from[1] * to[0];
  return normalizeQuat([1 + dot, cx, cy, cz]);
}

function screenToSphere(clientX, clientY, rect) {
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const r2 = nx * nx + ny * ny;
  if (r2 <= 1) return [nx, ny, Math.sqrt(1 - r2)];
  const len = Math.sqrt(r2);
  return [nx / len, ny / len, 0];
}

function renderCubePreview(ctx, w, h, quat) {
  const dpr = window.devicePixelRatio || 1;
  ctx.canvas.width = w * dpr;
  ctx.canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const s = Math.min(w, h) * 0.32;
  const cx = w / 2;
  const cy = h / 2;

  // Unit cube vertices (centred on origin)
  const verts = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1],
  ];

  // Edges as vertex-index pairs
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  // Axes (origin → +axis, length 1.4)
  const axes = [
    { dir: [1.4, 0, 0], color: "rgba(239,68,68," },   // X red
    { dir: [0, 1.4, 0], color: "rgba(34,197,94," },    // Y green
    { dir: [0, 0, 1.4], color: "rgba(59,130,246," },   // Z blue
  ];

  // Project after rotation
  const project = (v) => {
    const r = quatRotateVec(quat, v);
    return [cx + r[0] * s, cy - r[1] * s, r[2]];
  };

  const projected = verts.map(project);

  // Draw edges with depth-based opacity
  edges.forEach(([a, b]) => {
    const pa = projected[a];
    const pb = projected[b];
    const avgZ = (pa[2] + pb[2]) / 2;
    const alpha = 0.25 + 0.55 * ((avgZ + 1) / 2); // -1..1 → 0.25..0.8
    ctx.strokeStyle = `rgba(161,161,170,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  });

  // Draw axes
  const origin = project([0, 0, 0]);
  axes.forEach(({ dir, color }) => {
    const tip = project(dir);
    const alpha = 0.4 + 0.5 * ((tip[2] + 1) / 2);
    ctx.strokeStyle = color + alpha.toFixed(2) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    // small dot at tip
    ctx.fillStyle = color + Math.min(1, alpha + 0.2).toFixed(2) + ")";
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ── Rotation3dControl — 3-D arcball camera orbit ────────────────── */

function Rotation3dControl({ ctrl, onUniformChange }) {
  const canvasRef = useRef(null);
  const dragging = useRef(false);
  const lastSphere = useRef(null);

  // Compute initial quaternion from default camera position + target
  const initQuat = useCallback(() => {
    const defaultPos = ctrl.default || [2, 1.5, 2];
    const target = ctrl.target || [0, 0, 0];
    const dir = [
      defaultPos[0] - target[0],
      defaultPos[1] - target[1],
      defaultPos[2] - target[2],
    ];
    const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
    if (len < 1e-12) return [1, 0, 0, 0];
    const norm = [dir[0] / len, dir[1] / len, dir[2] / len];
    return quatFromVectors([0, 0, 1], norm);
  }, [ctrl.default, ctrl.target]);

  const [quat, setQuat] = useState(initQuat);

  // Derive distance once
  const distance = useRef(
    ctrl.distance ||
      (() => {
        const d = ctrl.default || [2, 1.5, 2];
        const t = ctrl.target || [0, 0, 0];
        return Math.sqrt(
          (d[0] - t[0]) ** 2 + (d[1] - t[1]) ** 2 + (d[2] - t[2]) ** 2
        );
      })()
  );

  // Render wireframe cube on quat change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    renderCubePreview(ctx, rect.width, rect.height, quat);
  }, [quat]);

  // Push uniforms on quat change
  useEffect(() => {
    const target = ctrl.target || [0, 0, 0];
    const dir = quatRotateVec(quat, [0, 0, 1]);
    const dist = distance.current;
    const camPos = [
      target[0] + dir[0] * dist,
      target[1] + dir[1] * dist,
      target[2] + dir[2] * dist,
    ];
    const uniforms = ctrl.uniforms || [];
    if (uniforms[0]) onUniformChange?.(uniforms[0], camPos[0]);
    if (uniforms[1]) onUniformChange?.(uniforms[1], camPos[1]);
    if (uniforms[2]) onUniformChange?.(uniforms[2], camPos[2]);
  }, [quat, ctrl.target, ctrl.uniforms, onUniformChange]);

  // Drag handlers
  const onPointerDown = useCallback(
    (e) => {
      dragging.current = true;
      canvasRef.current?.setPointerCapture(e.pointerId);
      const rect = canvasRef.current.getBoundingClientRect();
      lastSphere.current = screenToSphere(e.clientX, e.clientY, rect);
    },
    []
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!dragging.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cur = screenToSphere(e.clientX, e.clientY, rect);
      const prev = lastSphere.current;
      if (!prev) return;
      const delta = quatFromVectors(prev, cur);
      setQuat((q) => multiplyQuat(delta, q));
      lastSphere.current = cur;
    },
    []
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    lastSphere.current = null;
  }, []);

  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{ctrl.label}</label>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="w-full aspect-square bg-zinc-800 rounded border border-zinc-600 cursor-grab active:cursor-grabbing touch-none"
        style={{ imageRendering: "auto" }}
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
          if (ctrl.type === "rotation3d") {
            return <Rotation3dControl key={ctrl.uniforms?.[0] || ctrl.label} ctrl={ctrl} onUniformChange={onUniformChange} />;
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
