---
id: datashader.gallery
version: 1
title: Aggregating a point cloud
capability: datashader prepared geometry simulation
tier: C
kind: python
packages:
- datashader==0.19.1
- numpy==2.2.6
source:
  name: "Datashader"
  repo: https://github.com/holoviz/datashader
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

# Aggregating a point cloud

Datashader bins 100,000 deterministic points at three raster resolutions. Every aggregation accounts for all input points.

Datashader로 재현 가능한 점 10만 개를 세 해상도로 집계했어요. 집계마다 모든 입력 점을 포함하는지 확인했어요.

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
import datashader as ds,pandas as pd
rng=np.random.default_rng(12);t=rng.uniform(0,6.28,100000);r=.42+.18*np.sin(t*5)+rng.normal(0,.055,len(t));df=pd.DataFrame({'x':r*np.cos(t),'y':r*np.sin(t)});frames=[]
for n in [24,40,64]:
 agg=ds.Canvas(plot_width=n,plot_height=n,x_range=(-1,1),y_range=(-1,1)).points(df,'x','y');v=np.asarray(agg);assert int(v.sum())==len(df);y,x=np.nonzero(v);values=np.log1p(v[y,x])/np.log1p(v.max())
 frames.append({'points':np.column_stack(((x+.5)/n*2-1,(y+.5)/n*2-1)).tolist(),'values':(values*2-1).tolist(),'radius':.85/n})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
