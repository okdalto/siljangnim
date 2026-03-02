/** Quaternion / 3-D helpers for arcball camera */

export function normalizeQuat(q) {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return len < 1e-12 ? [1, 0, 0, 0] : [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function multiplyQuat(a, b) {
  return normalizeQuat([
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ]);
}

export function quatRotateVec(q, v) {
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

export function quatFromVectors(from, to) {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (dot > 0.999999) return [1, 0, 0, 0];
  if (dot < -0.999999) {
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
