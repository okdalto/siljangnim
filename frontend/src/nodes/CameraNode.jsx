import { useEffect, useRef, useState, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import { normalizeQuat, multiplyQuat, quatRotateVec, quatFromVectors } from "../utils/quaternion.js";

function screenToSphere(clientX, clientY, rect) {
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const r2 = nx * nx + ny * ny;
  if (r2 <= 1) return [nx, ny, Math.sqrt(1 - r2)];
  const len = Math.sqrt(r2);
  return [nx / len, ny / len, 0];
}

function renderCubePreview(ctx, w, h, quat, zoom = 1, panOffset = [0, 0]) {
  const dpr = window.devicePixelRatio || 1;
  ctx.canvas.width = w * dpr;
  ctx.canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const s = Math.min(w, h) * 0.32 * zoom;
  const cx = w / 2 + panOffset[0];
  const cy = h / 2 + panOffset[1];

  const verts = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1],
  ];

  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  const axes = [
    { dir: [1.4, 0, 0], color: "rgba(239,68,68," },
    { dir: [0, 1.4, 0], color: "rgba(34,197,94," },
    { dir: [0, 0, 1.4], color: "rgba(59,130,246," },
  ];

  const project = (v) => {
    const r = quatRotateVec(quat, v);
    return [cx + r[0] * s, cy - r[1] * s, r[2]];
  };

  const projected = verts.map(project);

  edges.forEach(([a, b]) => {
    const pa = projected[a];
    const pb = projected[b];
    const avgZ = (pa[2] + pb[2]) / 2;
    const alpha = 0.25 + 0.55 * ((avgZ + 1) / 2);
    ctx.strokeStyle = `rgba(161,161,170,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  });

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
    ctx.fillStyle = color + Math.min(1, alpha + 0.2).toFixed(2) + ")";
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ── CameraNode — standalone 3-D arcball camera node ─────────────── */

export default function CameraNode({ data }) {
  const { ctrl, onUniformChange } = data;
  const canvasRef = useRef(null);
  const dragging = useRef(false);
  const lastSphere = useRef(null);

  const initQuat = useCallback(() => {
    const defaultPos = ctrl?.default || [2, 1.5, 2];
    const tgt = ctrl?.target || [0, 0, 0];
    const dir = [
      defaultPos[0] - tgt[0],
      defaultPos[1] - tgt[1],
      defaultPos[2] - tgt[2],
    ];
    const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
    if (len < 1e-12) return [1, 0, 0, 0];
    const norm = [dir[0] / len, dir[1] / len, dir[2] / len];
    return quatFromVectors(norm, [0, 0, 1]);
  }, [ctrl?.default, ctrl?.target]);

  const [quat, setQuat] = useState(initQuat);
  const [dist, setDist] = useState(() => {
    if (ctrl?.distance) return ctrl.distance;
    const d = ctrl?.default || [2, 1.5, 2];
    const t = ctrl?.target || [0, 0, 0];
    return Math.sqrt((d[0] - t[0]) ** 2 + (d[1] - t[1]) ** 2 + (d[2] - t[2]) ** 2);
  });
  const [target, setTarget] = useState(ctrl?.target || [0, 0, 0]);

  const initialDist = useRef(dist);
  const initialTarget = useRef(target);

  const quatRef = useRef(quat);
  const distRef = useRef(dist);
  useEffect(() => { quatRef.current = quat; }, [quat]);
  useEffect(() => { distRef.current = dist; }, [dist]);

  // Render wireframe cube
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const zoom = Math.min(3, Math.max(0.2, initialDist.current / dist));
    const inv = [quat[0], -quat[1], -quat[2], -quat[3]];
    const camDir = quatRotateVec(inv, [0, 0, 1]);
    const fx = -camDir[0], fy = -camDir[1], fz = -camDir[2];
    const rLen = Math.sqrt(fz * fz + fx * fx);
    const right3d = rLen > 1e-6 ? [-fz / rLen, 0, fx / rLen] : [1, 0, 0];
    const up3d = [
      right3d[1] * fz - right3d[2] * fy,
      right3d[2] * fx - right3d[0] * fz,
      right3d[0] * fy - right3d[1] * fx,
    ];
    const dt = [
      target[0] - initialTarget.current[0],
      target[1] - initialTarget.current[1],
      target[2] - initialTarget.current[2],
    ];
    const pixPerUnit = Math.min(rect.width, rect.height) * 0.15;
    const panX = -(dt[0] * right3d[0] + dt[1] * right3d[1] + dt[2] * right3d[2]) * pixPerUnit * zoom;
    const panY = (dt[0] * up3d[0] + dt[1] * up3d[1] + dt[2] * up3d[2]) * pixPerUnit * zoom;
    renderCubePreview(ctx, rect.width, rect.height, quat, zoom, [panX, panY]);
  }, [quat, dist, target]);

  // Push uniforms on quat/dist/target change
  useEffect(() => {
    if (!ctrl) return;
    const invQuat = [quat[0], -quat[1], -quat[2], -quat[3]];
    const dir = quatRotateVec(invQuat, [0, 0, 1]);
    const camPos = [
      target[0] + dir[0] * dist,
      target[1] + dir[1] * dist,
      target[2] + dir[2] * dist,
    ];
    const uniforms = ctrl.uniforms || [];
    if (uniforms[0]) onUniformChange?.(uniforms[0], camPos[0]);
    if (uniforms[1]) onUniformChange?.(uniforms[1], camPos[1]);
    if (uniforms[2]) onUniformChange?.(uniforms[2], camPos[2]);
    const tU = ctrl.targetUniforms || ["u_cam_target_x", "u_cam_target_y", "u_cam_target_z"];
    onUniformChange?.(tU[0], target[0]);
    onUniformChange?.(tU[1], target[1]);
    onUniformChange?.(tU[2], target[2]);
  }, [quat, dist, target, ctrl, onUniformChange]);

  // Wheel: pinch → zoom, two-finger scroll → pan
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey) {
        const factor = 1 + e.deltaY * 0.01;
        setDist((d) => Math.max(0.1, d * factor));
      } else {
        const q = quatRef.current;
        const inv = [q[0], -q[1], -q[2], -q[3]];
        const camDir = quatRotateVec(inv, [0, 0, 1]);
        const fx = -camDir[0], fy = -camDir[1], fz = -camDir[2];
        const rLen = Math.sqrt(fz * fz + fx * fx);
        const right = rLen > 1e-6 ? [-fz / rLen, 0, fx / rLen] : [1, 0, 0];
        const up = [
          right[1] * fz - right[2] * fy,
          right[2] * fx - right[0] * fz,
          right[0] * fy - right[1] * fx,
        ];
        const panSpeed = distRef.current * 0.003;
        setTarget((t) => [
          t[0] - e.deltaX * panSpeed * right[0] + e.deltaY * panSpeed * up[0],
          t[1] - e.deltaX * panSpeed * right[1] + e.deltaY * panSpeed * up[1],
          t[2] - e.deltaX * panSpeed * right[2] + e.deltaY * panSpeed * up[2],
        ]);
      }
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // Drag: orbit (default) or pan (Alt/Option held)
  const panning = useRef(false);
  const lastPointer = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      dragging.current = true;
      panning.current = e.altKey;
      canvasRef.current?.setPointerCapture(e.pointerId);
      const rect = canvasRef.current.getBoundingClientRect();
      if (e.altKey) {
        lastPointer.current = [e.clientX, e.clientY];
      } else {
        lastSphere.current = screenToSphere(e.clientX, e.clientY, rect);
      }
    },
    []
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!dragging.current) return;

      if (panning.current) {
        const prev = lastPointer.current;
        if (!prev) return;
        const dx = e.clientX - prev[0];
        const dy = e.clientY - prev[1];
        lastPointer.current = [e.clientX, e.clientY];

        const q = quatRef.current;
        const inv = [q[0], -q[1], -q[2], -q[3]];
        const camDir = quatRotateVec(inv, [0, 0, 1]);
        const fx = -camDir[0], fy = -camDir[1], fz = -camDir[2];
        const rLen = Math.sqrt(fz * fz + fx * fx);
        const right = rLen > 1e-6 ? [-fz / rLen, 0, fx / rLen] : [1, 0, 0];
        const up = [
          right[1] * fz - right[2] * fy,
          right[2] * fx - right[0] * fz,
          right[0] * fy - right[1] * fx,
        ];
        const panSpeed = distRef.current * 0.004;
        setTarget((t) => [
          t[0] - dx * panSpeed * right[0] - dy * panSpeed * up[0],
          t[1] - dx * panSpeed * right[1] - dy * panSpeed * up[1],
          t[2] - dx * panSpeed * right[2] - dy * panSpeed * up[2],
        ]);
      } else {
        const rect = canvasRef.current.getBoundingClientRect();
        const cur = screenToSphere(e.clientX, e.clientY, rect);
        const prev = lastSphere.current;
        if (!prev) return;
        const delta = quatFromVectors(prev, cur);
        setQuat((q) => multiplyQuat(delta, q));
        lastSphere.current = cur;
      }
    },
    []
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    panning.current = false;
    lastSphere.current = null;
    lastPointer.current = null;
  }, []);

  const onDoubleClick = useCallback(() => {
    setQuat(initQuat);
    setDist(initialDist.current);
    setTarget([...initialTarget.current]);
  }, [initQuat]);

  if (!ctrl) return null;

  return (
    <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <NodeResizer minWidth={200} minHeight={200} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Camera
      </div>
      <div className="flex-1 p-2 nodrag nowheel">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          className="w-full h-full bg-zinc-800 rounded border border-zinc-600 cursor-grab active:cursor-grabbing touch-none"
          style={{ imageRendering: "auto" }}
        />
      </div>
    </div>
  );
}
