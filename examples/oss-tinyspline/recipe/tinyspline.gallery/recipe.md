---
id: tinyspline.gallery
version: 1
title: Clamped cubic B-splines
capability: tinyspline prepared geometry simulation
tier: C
kind: python
packages:
- tinyspline==0.6.0.post2
- numpy==2.2.6
source:
  name: "TinySpline"
  repo: https://github.com/msteinbeck/tinyspline
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

# Clamped cubic B-splines

TinySpline evaluates three cubic B-splines from six control points. Clamped endpoints remain fixed as the middle points move.

TinySpline으로 제어점 여섯 개의 3차 B-스플라인 세 개를 계산했어요. 중간점을 옮겨도 고정한 양 끝은 유지돼요.

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
import tinyspline
frames=[]
for height in [-.6,0,.6]:
 ctrl=[[-.8,-.4],[-.6,.7],[-.2,height],[.2,height],[.6,-.7],[.8,.4]];s=tinyspline.BSpline(6,2,3,tinyspline.BSpline.Clamped);s.control_points=np.array(ctrl).ravel().tolist();pts=np.array(s.sample(121)).reshape(-1,2);assert np.allclose(pts[[0,-1]],np.array(ctrl)[[0,-1]])
 frames.append({'paths':[{'points':pts.tolist(),'color':'#57d8c6'},{'points':ctrl,'color':'#ffbc7866'}],'points':ctrl})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
