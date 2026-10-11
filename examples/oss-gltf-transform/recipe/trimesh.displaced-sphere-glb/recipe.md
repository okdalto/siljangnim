---
id: trimesh.displaced-sphere-glb
version: 3
title: Displaced, vertex-colored sphere as GLB (trimesh)
capability: mesh-generate sculpture sphere displacement vertex colors glb gltf
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
  - name: sculpture.glb
    media: model
verify:
  params:
    subdivisions: 2
  expect_outputs:
  - sculpture.glb
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-11'
    version: 3
status: verified
origin: local
updated: '2026-10-11'
---

# Displaced, vertex-colored sphere as GLB (trimesh)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os
import numpy as np, trimesh
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
rng = np.random.default_rng(int(P.get('seed', 4)))
m = trimesh.creation.icosphere(subdivisions=int(P.get('subdivisions', 6)))
v = m.vertices
f = rng.normal(size=(6, 3)) * 2.5
disp = sum(np.sin(v @ f[i] + i) * (0.12 / (i + 1)) for i in range(6))
m.vertices = v * (1 + disp)[:, None]
h = (disp - disp.min()) / (np.ptp(disp) or 1)
low, high = np.array([30, 40, 120]), np.array([255, 190, 90])
colors = (low[None] * (1 - h[:, None]) + high[None] * h[:, None]).astype(np.uint8)
m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=np.c_[colors, np.full(len(colors), 255, np.uint8)])
m.export('out/sculpture.glb', include_normals=True)
print(len(m.vertices), "vertices", len(m.faces), "faces")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: subdivisions (icosphere detail), seed. The GLB has POSITION, NORMAL and COLOR_0 (vertex colors by height).
