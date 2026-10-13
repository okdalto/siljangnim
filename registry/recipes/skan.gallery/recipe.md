---
id: skan.gallery
version: 1
title: Skeleton branch graph
capability: skan prepared geometry simulation
tier: C
kind: python
packages:
- skan==0.13.1
- numpy==2.2.6
source:
  name: "Skan"
  repo: https://github.com/jni/skan
  license: "BSD-3-Clause"
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

# Skeleton branch graph

Skan extracts paths and branch lengths from an original one-pixel-wide skeleton. Highlight a branch to inspect its topology.

Skan으로 직접 만든 1픽셀 골격에서 경로와 가지 길이를 구했어요. 가지별 결과를 살펴보세요.

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
from skan import Skeleton,summarize
image=np.zeros((101,101),bool);image[50,10:91]=True;image[10:91,50]=True
for i in range(25):image[50+i,50+i]=True
s=Skeleton(image);table=summarize(s,separator='_');assert s.n_paths>=4 and (table['branch_distance']>0).all();frames=[]
for selected in range(s.n_paths):
 paths=[]
 for j in range(s.n_paths):
  p=s.path_coordinates(j);paths.append({'points':np.column_stack(((p[:,1]-50)/50,(50-p[:,0])/50)).tolist(),'color':'#ffbc78' if j==selected else '#355469'})
 frames.append({'paths':paths})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
