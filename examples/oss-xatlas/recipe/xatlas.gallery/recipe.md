---
id: xatlas.gallery
version: 1
title: Unwrapping a cube
capability: xatlas prepared geometry simulation
tier: C
kind: python
packages:
- xatlas==0.0.11
- numpy==2.2.6
source:
  name: "xatlas"
  repo: https://github.com/jpcy/xatlas
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

# Unwrapping a cube

xatlas parameterizes and packs a cube mesh into a texture atlas. The prepared chart shows the actual seam splits and UV triangles.

xatlas로 큐브 메시를 파라미터화하고 텍스처 아틀라스에 배치했어요. 실제 이음새 분할과 UV 삼각형을 살펴보세요.

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
import xatlas
v=np.array([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],np.float32);f=np.array([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],np.uint32)
vmapping,indices,uv=xatlas.parametrize(v,f);assert uv.min()>=0 and uv.max()<=1 and len(indices)==12 and len(vmapping)>8
pts=np.column_stack((uv*1.7-.85,np.zeros(len(uv))));save([{'mesh':{'vertices':pts.tolist(),'faces':indices.tolist()},'points':pts.tolist()}])
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
