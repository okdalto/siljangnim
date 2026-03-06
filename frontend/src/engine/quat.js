/**
 * quat — Quaternion operations.
 * Quaternions stored as [x, y, z, w].
 * Pure functions, no GL dependency.
 */

export function create() {
  return [0, 0, 0, 1];
}

export function fromAxisAngle(ax, ay, az, rad) {
  const half = rad * 0.5;
  const s = Math.sin(half);
  let len = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
  len = 1 / len;
  return [ax * len * s, ay * len * s, az * len * s, Math.cos(half)];
}

export function fromEuler(rx, ry, rz) {
  const toRad = Math.PI / 360; // half-angle in radians
  const cx = Math.cos(rx * toRad), sx = Math.sin(rx * toRad);
  const cy = Math.cos(ry * toRad), sy = Math.sin(ry * toRad);
  const cz = Math.cos(rz * toRad), sz = Math.sin(rz * toRad);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

export function multiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function normalize(q) {
  let len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (len === 0) return [0, 0, 0, 1];
  len = 1 / len;
  return [q[0] * len, q[1] * len, q[2] * len, q[3] * len];
}

export function conjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function rotateVec3(q, v) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const vx = v[0], vy = v[1], vz = v[2];

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

export function toMat4(q) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  return new Float32Array([
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1,
  ]);
}

export function fromMat4(m) {
  const trace = m[0] + m[5] + m[10];
  let x, y, z, w;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (m[6] - m[9]) * s;
    y = (m[8] - m[2]) * s;
    z = (m[1] - m[4]) * s;
  } else if (m[0] > m[5] && m[0] > m[10]) {
    const s = 2.0 * Math.sqrt(1.0 + m[0] - m[5] - m[10]);
    w = (m[6] - m[9]) / s;
    x = 0.25 * s;
    y = (m[1] + m[4]) / s;
    z = (m[8] + m[2]) / s;
  } else if (m[5] > m[10]) {
    const s = 2.0 * Math.sqrt(1.0 + m[5] - m[0] - m[10]);
    w = (m[8] - m[2]) / s;
    x = (m[1] + m[4]) / s;
    y = 0.25 * s;
    z = (m[6] + m[9]) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m[10] - m[0] - m[5]);
    w = (m[1] - m[4]) / s;
    x = (m[8] + m[2]) / s;
    y = (m[6] + m[9]) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}

export function slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bx = dot < 0 ? -b[0] : b[0];
  const by = dot < 0 ? -b[1] : b[1];
  const bz = dot < 0 ? -b[2] : b[2];
  const bw = dot < 0 ? -b[3] : b[3];
  dot = Math.abs(dot);

  if (dot > 0.9995) {
    return normalize([
      a[0] + t * (bx - a[0]),
      a[1] + t * (by - a[1]),
      a[2] + t * (bz - a[2]),
      a[3] + t * (bw - a[3]),
    ]);
  }

  const theta = Math.acos(Math.min(dot, 1));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;

  return [
    a[0] * wa + bx * wb,
    a[1] * wa + by * wb,
    a[2] * wa + bz * wb,
    a[3] * wa + bw * wb,
  ];
}

export function nlerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = dot < 0 ? -1 : 1;
  return normalize([
    a[0] + t * (b[0] * sign - a[0]),
    a[1] + t * (b[1] * sign - a[1]),
    a[2] + t * (b[2] * sign - a[2]),
    a[3] + t * (b[3] * sign - a[3]),
  ]);
}
