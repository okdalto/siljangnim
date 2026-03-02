/** Catmull-Rom (Hermite) spline interpolation — shared across GraphControl, KeyframeEditor, GLEngine */
export function sampleCurve(points, t) {
  if (!points || points.length === 0) return 0;
  if (points.length === 1) return points[0][1];
  const pts = points.slice().sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[n - 1][0]) return pts[n - 1][1];
  let idx = 0;
  for (let j = 0; j < n - 1; j++) {
    if (t >= pts[j][0] && t <= pts[j + 1][0]) { idx = j; break; }
  }
  const m = new Array(n);
  for (let k = 0; k < n; k++) {
    if (k === 0) m[k] = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]);
    else if (k === n - 1) m[k] = (pts[n - 1][1] - pts[n - 2][1]) / (pts[n - 1][0] - pts[n - 2][0]);
    else m[k] = (pts[k + 1][1] - pts[k - 1][1]) / (pts[k + 1][0] - pts[k - 1][0]);
  }
  const dx = pts[idx + 1][0] - pts[idx][0];
  const u = (t - pts[idx][0]) / dx;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * pts[idx][1] + h10 * m[idx] * dx + h01 * pts[idx + 1][1] + h11 * m[idx + 1] * dx;
}
