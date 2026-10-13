---
id: geos.gallery
version: 1
title: Offsets around a polyline
capability: geos prepared geometry simulation
tier: C
kind: python
packages:
- shapely==2.1.2
- numpy==2.2.6
source:
  name: "GEOS"
  repo: https://github.com/libgeos/geos
  license: "LGPL-2.1"
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

# Offsets around a polyline

The native GEOS engine, called through Shapely, buffers an original polyline with round, mitre and bevel joins.

Shapely를 통해 GEOS 엔진을 직접 실행해 폴리라인의 원형·마이터·베벨 접합 오프셋을 계산했어요.

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
from shapely.geometry import LineString
line=LineString([[-.7,-.5],[-.3,.4],[.2,-.2],[.7,.5]]);frames=[]
for join in [1,2,3]:
 shape=line.buffer(.14,join_style=join);assert shape.is_valid and shape.area>0
 frames.append({'paths':[{'points':list(shape.exterior.coords),'color':'#57d8c6'},{'points':list(line.coords),'color':'#ffbc78'}]})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
