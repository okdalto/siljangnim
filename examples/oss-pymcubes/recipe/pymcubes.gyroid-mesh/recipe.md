---
id: pymcubes.gyroid-mesh
version: 1
title: Mesh an implicit field with marching cubes (PyMCubes)
capability: geometry-generate implicit field sdf marching cubes isosurface mesh gyroid
  json
tier: C
kind: python
packages:
- numpy
- PyMCubes==0.1.6
- scipy
source:
  name: PyMCubes
  repo: https://github.com/pmneila/PyMCubes
  license: BSD-3-Clause
io:
  inputs: []
  outputs:
  - name: mesh.json
    media: json
verify:
  params:
    resolution: 40
  expect_outputs:
  - mesh.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-12'
    version: 1
status: verified
origin: local
updated: '2026-10-12'
---

# Mesh an implicit field with marching cubes (PyMCubes)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import base64, json, os
import numpy as np, mcubes
from scipy.ndimage import map_coordinates
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
n = int(P.get('resolution', 96))
k = float(P.get('cells', 2.6)) * np.pi
t = float(P.get('thickness', 0.32))
R = float(P.get('radius', 0.92))
ax = np.linspace(-1.0, 1.0, n)
X, Y, Z = np.meshgrid(ax, ax, ax, indexing='ij')
def field(x, y, z):
    g = np.sin(k * x) * np.cos(k * y) + np.sin(k * y) * np.cos(k * z) + np.sin(k * z) * np.cos(k * x)
    sheet = np.abs(g) / k * 2.0 - t / k * 2.0
    sphere = np.sqrt(x * x + y * y + z * z) - R
    return np.maximum(sheet, sphere)  # inside < 0
f = field(X, Y, Z)
verts, tris = mcubes.marching_cubes(-f, 0.0)
grad = np.gradient(f)
coords = verts.T
nrm = np.stack([map_coordinates(g, coords, order=1) for g in grad], axis=1)
nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
pos = verts / (n - 1) * 2.0 - 1.0
shell = np.clip((R - np.linalg.norm(pos, axis=1)) / R * 3.0, 0, 1)
b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
out = {"vertexCount": int(len(pos)), "triangleCount": int(len(tris)),
       "positions": b64(np.round((pos + 1) / 2 * 65535).astype('<u2')), "normals": b64(np.round(nrm * 127).astype('i1')),
       "indices": b64(tris.astype('<u4')), "shell": b64(np.round(shell * 255).astype('u1'))}
json.dump(out, open('out/mesh.json', 'w'))
print(len(pos), "vertices,", len(tris), "triangles from a", n, "cubed grid")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: resolution (grid cells per side), cells (gyroid periods across the sphere), thickness (shell thickness of the gyroid sheet), radius (sphere it is carved into, 0..1). The field is a thickened gyroid intersected with a sphere and a smooth core; change field() for other shapes. mesh.json: vertexCount, triangleCount, positions (base64 little-endian Uint16 xyz, 0..65535 maps to -1..1), normals (base64 Int8 xyz / 127, from the field gradient), indices (base64 little-endian Uint32), shell (base64 Uint8 per vertex / 255: 0 at the sphere surface, 1 deep inside).
