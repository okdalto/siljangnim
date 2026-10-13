---
id: pyvista.gallery
version: 1
title: Clipping a surface
capability: pyvista prepared geometry simulation
tier: C
kind: python
packages:
- pyvista==0.49.0
- numpy==2.2.6
source:
  name: "PyVista"
  repo: https://github.com/pyvista/pyvista
  license: "MIT"
io:
  inputs: []
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs:
  - result.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Clipping a surface

PyVista clips an original torus at three planes. Rotate the prepared meshes to inspect the open cut.

PyVista로 직접 만든 토러스를 세 평면에서 잘랐어요. 계산된 메시를 회전해 잘린 면을 살펴보세요.

## Setup

Install the pinned packages above. No API key or model weights are required.

## Run

Writes the prepared data to out/result.json. The scene controls select or rotate stored results; they do not rerun this computation.

```python
import json,numpy as np
from pathlib import Path
Path('out').mkdir(exist_ok=True)
def save(frames):
 assert len(frames)>0
 text=json.dumps({'frames':frames},allow_nan=False,separators=(',',':'))
 Path('out/result.json').write_text(text)
import pyvista as pv
mesh=pv.ParametricTorus(ringradius=.6,crosssectionradius=.22,u_res=36,v_res=18).triangulate();frames=[]
for x in [-.4,0,.4]:
 cut=mesh.clip(normal=(1,0,0),origin=(x,0,0),invert=False).triangulate();assert cut.n_cells>0 and float(cut.points[:,0].min())>=x-1e-5
 frames.append({'mesh':{'vertices':cut.points.tolist(),'faces':cut.faces.reshape(-1,4)[:,1:].tolist()}})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
