---
id: libigl-arap.gallery
version: 1
title: As-rigid-as-possible bending
capability: libigl-arap prepared geometry simulation
tier: C
kind: python
packages:
- libigl==2.6.3
- numpy==2.2.6
source:
  name: "libigl · ARAP"
  repo: https://github.com/libigl/libigl
  license: "MPL-2.0 (the ARAP code in question)"
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

# As-rigid-as-possible bending

libigl solves a 2D ARAP deformation of a triangulated strip with pinned ends. Three right-edge rotations are computed locally.

libigl로 양 끝을 고정한 삼각형 띠의 2D ARAP 변형을 풀었어요. 오른쪽 끝의 회전 세 가지를 직접 계산했어요.

## Setup

Install the pinned packages above. No API key or model weights are required.

## Run

Writes the prepared data to out/result.json. The scene controls select or rotate stored results; they do not rerun this computation.

```python
import json,numpy as np
from pathlib import Path
Path('out').mkdir(exist_ok=True)
def save(frames):
 assert frames
 Path('out/result.json').write_text(json.dumps({'frames':frames},allow_nan=False,separators=(',',':')))
import igl
nx,ny=18,5;v=np.array([[-.85+x*1.7/(nx-1),-.3+y*.6/(ny-1)] for y in range(ny) for x in range(nx)]);f=[]
for y in range(ny-1):
 for x in range(nx-1):
  i=y*nx+x;f.extend([[i,i+1,i+nx],[i+1,i+nx+1,i+nx]])
f=np.array(f,dtype=np.int64);b=np.array([i for i in range(len(v)) if i%nx in [0,nx-1]],dtype=np.int32);frames=[]
for angle in [-.6,0,.6]:
 bc=v[b].copy()
 for j,i in enumerate(b):
  if i%nx==nx-1:bc[j]=[.65-np.sin(angle)*v[i,1],np.cos(angle)*v[i,1]+angle*.5]
 data=igl.ARAPData();data.max_iter=40;igl.arap_precomputation(v,f,2,b,data);u=igl.arap_solve(bc,data,v.copy());assert np.isfinite(u).all() and np.max(np.abs(u[b]-bc))<1e-7
 frames.append({'mesh':{'vertices':np.column_stack((u,np.zeros(len(u)))).tolist(),'faces':f.tolist()},'points':bc.tolist()})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
