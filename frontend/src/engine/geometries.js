/**
 * Geometry generators for WebGL2.
 * Each returns { positions, normals, uvs, indices? } as Float32Arrays / Uint16Array.
 */

/**
 * Fullscreen quad: 2 triangles covering [-1, 1] NDC range.
 * Only positions needed (no normals/uvs for shader art — v_uv computed in vertex shader).
 */
export function createQuadGeometry() {
  return {
    positions: new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]),
    vertexCount: 6,
    dimension: 2,
  };
}

/**
 * Unit box [-0.5, 0.5] with 36 vertices, positions + normals + UVs.
 */
export function createBoxGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];

  const faces = [
    { normal: [0, 0, 1],  up: [0, 1, 0], right: [1, 0, 0] },   // front
    { normal: [0, 0, -1], up: [0, 1, 0], right: [-1, 0, 0] },   // back
    { normal: [1, 0, 0],  up: [0, 1, 0], right: [0, 0, -1] },   // right
    { normal: [-1, 0, 0], up: [0, 1, 0], right: [0, 0, 1] },    // left
    { normal: [0, 1, 0],  up: [0, 0, -1], right: [1, 0, 0] },   // top
    { normal: [0, -1, 0], up: [0, 0, 1], right: [1, 0, 0] },    // bottom
  ];

  const uvCoords = [
    [0, 0], [1, 0], [1, 1],
    [0, 0], [1, 1], [0, 1],
  ];

  for (const face of faces) {
    const n = face.normal;
    const u = face.up;
    const r = face.right;
    const center = [n[0] * 0.5, n[1] * 0.5, n[2] * 0.5];

    const v0 = [center[0] - r[0]*0.5 - u[0]*0.5, center[1] - r[1]*0.5 - u[1]*0.5, center[2] - r[2]*0.5 - u[2]*0.5];
    const v1 = [center[0] + r[0]*0.5 - u[0]*0.5, center[1] + r[1]*0.5 - u[1]*0.5, center[2] + r[2]*0.5 - u[2]*0.5];
    const v2 = [center[0] + r[0]*0.5 + u[0]*0.5, center[1] + r[1]*0.5 + u[1]*0.5, center[2] + r[2]*0.5 + u[2]*0.5];
    const v3 = [center[0] - r[0]*0.5 + u[0]*0.5, center[1] - r[1]*0.5 + u[1]*0.5, center[2] - r[2]*0.5 + u[2]*0.5];

    const verts = [v0, v1, v2, v0, v2, v3];
    for (let i = 0; i < 6; i++) {
      positions.push(...verts[i]);
      normals.push(...n);
      uvs.push(...uvCoords[i]);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    vertexCount: 36,
    dimension: 3,
  };
}

/**
 * UV sphere with given segment counts.
 */
export function createSphereGeometry(segments = 32) {
  const rings = segments;
  const sectors = segments;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    const phi = (Math.PI * r) / rings;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let s = 0; s <= sectors; s++) {
      const theta = (2 * Math.PI * s) / sectors;
      const x = sinPhi * Math.cos(theta);
      const y = cosPhi;
      const z = sinPhi * Math.sin(theta);
      positions.push(x * 0.5, y * 0.5, z * 0.5);
      normals.push(x, y, z);
      uvs.push(s / sectors, r / rings);
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * (sectors + 1) + s;
      const b = a + sectors + 1;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
    vertexCount: indices.length,
    dimension: 3,
  };
}

/**
 * Subdivided plane in XZ, centered at origin, Y=0.
 */
export function createPlaneGeometry(width = 1, height = 1, wSegs = 1, hSegs = 1) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let iy = 0; iy <= hSegs; iy++) {
    const v = iy / hSegs;
    const z = (v - 0.5) * height;
    for (let ix = 0; ix <= wSegs; ix++) {
      const u = ix / wSegs;
      const x = (u - 0.5) * width;
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
  }

  for (let iy = 0; iy < hSegs; iy++) {
    for (let ix = 0; ix < wSegs; ix++) {
      const a = iy * (wSegs + 1) + ix;
      const b = a + wSegs + 1;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
    vertexCount: indices.length,
    dimension: 3,
  };
}
