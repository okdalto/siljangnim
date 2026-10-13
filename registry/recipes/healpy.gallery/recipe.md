---
id: healpy.gallery
version: 1
title: Equal-area spherical samples
capability: healpy prepared geometry simulation
tier: C
kind: python
packages:
- healpy==1.20.0
- numpy==2.2.6
source:
  name: "healpy"
  repo: https://github.com/healpy/healpy
  license: "GPL-2.0"
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

# Equal-area spherical samples

Healpy evaluates HEALPix pixel centers at three resolutions. Colors mark a synthetic spherical wave.

Healpy로 세 해상도의 HEALPix 픽셀 중심을 계산했어요. 색은 직접 만든 구면파 값을 나타내요.

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
import healpy as hp
frames=[]
for nside in [4,8,16]:
 n=hp.nside2npix(nside);assert n==12*nside*nside and abs(hp.nside2pixarea(nside)*n-4*np.pi)<1e-10
 theta,phi=hp.pix2ang(nside,np.arange(n));x,y,z=hp.pix2vec(nside,np.arange(n));values=np.sin(theta*3)*np.cos(phi*4);pts=np.column_stack((x,y,z))*.85
 frames.append({'points':pts.tolist(),'values':values.tolist(),'radius':.65/np.sqrt(n)})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
