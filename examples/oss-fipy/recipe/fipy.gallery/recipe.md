---
id: fipy.gallery
version: 1
title: Diffusion of a pulse
capability: fipy prepared geometry simulation
tier: C
kind: python
packages:
- FiPy==4.0.3
- numpy==2.2.6
source:
  name: "FiPy"
  repo: https://github.com/usnistgov/fipy
  license: "NIST Terms of Use"
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

# Diffusion of a pulse

FiPy solves one-dimensional diffusion with zero-flux boundaries. The prepared profiles conserve the initial mass.

FiPy로 무유량 경계를 가진 1차원 확산을 계산했어요. 준비된 곡선들은 초기 질량을 보존해요.

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
from fipy import Grid1D,CellVariable,TransientTerm,DiffusionTerm
mesh=Grid1D(nx=100,dx=.02);x=np.asarray(mesh.cellCenters[0]);v=CellVariable(mesh=mesh,value=np.exp(-((x-1)/.13)**2));eq=TransientTerm()==DiffusionTerm(coeff=.12);initial=float(v.value.sum());frames=[]
for step in range(81):
 if step%4==0:frames.append({'paths':[{'points':np.column_stack((x-1,v.value*1.5-.6)).tolist(),'color':'#57d8c6'}]})
 eq.solve(var=v,dt=.01);assert abs(float(v.value.sum())-initial)<1e-7
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
