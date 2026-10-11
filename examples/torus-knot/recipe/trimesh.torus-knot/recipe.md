---
id: trimesh.torus-knot
version: 1
title: Torus knot tube mesh (trimesh)
capability: mesh-generate torus knot tube glb json
tier: C
kind: python
packages:
- numpy
- scipy==1.14.1
- trimesh==4.5.3
source:
  name: trimesh
  repo: https://github.com/mikedh/trimesh
  license: MIT
io:
  inputs: []
  outputs:
  - name: torus_knot.glb
    media: mesh
  - name: torus_knot.json
    media: json
verify:
  params:
    segments: 64
    sides: 8
  expect_outputs:
  - torus_knot.glb
  - torus_knot.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-11'
    version: 1
status: verified
origin: local
updated: '2026-10-11'
---

# Torus knot tube mesh (trimesh)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import numpy as np, trimesh, json, os
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
p, q = int(P.get('p', 2)), int(P.get('q', 3))
R, r, tube = float(P.get('R', 1.0)), float(P.get('r', 0.4)), float(P.get('tube', 0.13))
nu, nv = int(P.get('segments', 512)), int(P.get('sides', 32))
def knot(t):
    rr = R + r*np.cos(q*t)
    return np.stack([rr*np.cos(p*t), rr*np.sin(p*t), r*np.sin(q*t)], -1)
t = np.linspace(0, 2*np.pi, nu, endpoint=False)
c = knot(t)
T = knot(t+1e-4) - knot(t-1e-4); T /= np.linalg.norm(T, axis=1, keepdims=True)
N = knot(t+1e-4) + knot(t-1e-4) - 2*c
N -= (N*T).sum(1, keepdims=True)*T; N /= np.linalg.norm(N, axis=1, keepdims=True)
B = np.cross(T, N)
a = np.linspace(0, 2*np.pi, nv, endpoint=False)
V = (c[:, None] + tube*(np.cos(a)[None, :, None]*N[:, None] + np.sin(a)[None, :, None]*B[:, None])).reshape(-1, 3)
i, j = np.meshgrid(np.arange(nu), np.arange(nv), indexing='ij')
a0 = i*nv + j; a1 = ((i+1) % nu)*nv + j; a2 = ((i+1) % nu)*nv + (j+1) % nv; a3 = i*nv + (j+1) % nv
F = np.concatenate([np.stack([a0, a1, a2], -1).reshape(-1, 3), np.stack([a0, a2, a3], -1).reshape(-1, 3)])
m = trimesh.Trimesh(V, F, process=False)
m.fix_normals()
m.export('out/torus_knot.glb')
json.dump({"positions": m.vertices.astype(np.float32).round(5).ravel().tolist(),
           "normals": m.vertex_normals.astype(np.float32).round(4).ravel().tolist(),
           "indices": m.faces.ravel().tolist()}, open('out/torus_knot.json', 'w'))
print(len(m.vertices), "verts", len(m.faces), "faces", "watertight", m.is_watertight)
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: p, q (knot winding), R, r, tube, segments, sides. trimesh fix_normals needs scipy. JSON has flat positions/normals/indices arrays for direct WebGL upload (Uint32 indices).
