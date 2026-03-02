import { quatRotateVec } from "./quaternion.js";

export function screenToSphere(clientX, clientY, rect) {
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const r2 = nx * nx + ny * ny;
  if (r2 <= 1) return [nx, ny, Math.sqrt(1 - r2)];
  const len = Math.sqrt(r2);
  return [nx / len, ny / len, 0];
}

export function renderCubePreview(ctx, w, h, quat, zoom = 1, panOffset = [0, 0]) {
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
