---
id: nurbs-python-geomdl.gallery
version: 1
title: Rational curve weights
capability: nurbs-python-geomdl prepared geometry simulation
tier: C
kind: python
packages:
- geomdl==5.4.0
- numpy==2.2.6
source:
  name: "NURBS-Python (geomdl)"
  repo: https://github.com/orbingol/nurbs-python
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

# Rational curve weights

Geomdl evaluates a quadratic rational curve at three middle-point weights. These are locally computed samples.

Geomdl로 중간 제어점의 가중치가 다른 유리 곡선을 직접 계산했어요. 준비된 세 결과를 비교하세요.

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
from geomdl import NURBS
frames=[]
for weight in [.4,1,2.5]:
 c=NURBS.Curve();c.degree=2;c.ctrlpts=[[-.8,-.5],[0,.9],[.8,-.5]];c.weights=[1,weight,1];c.knotvector=[0,0,0,1,1,1];c.sample_size=121
 pts=c.evalpts;assert np.allclose(pts[0],[-.8,-.5]) and np.allclose(pts[-1],[.8,-.5])
 frames.append({'paths':[{'points':pts,'color':'#57d8c6'},{'points':c.ctrlpts,'color':'#ffbc7866'}],'points':c.ctrlpts})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
