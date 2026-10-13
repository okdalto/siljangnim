---
id: proj.gallery
version: 1
title: Projection graticules
capability: proj prepared geometry simulation
tier: C
kind: python
packages:
- pyproj==3.7.2
- numpy==2.2.6
source:
  name: "PROJ"
  repo: https://github.com/OSGeo/PROJ
  license: "MIT-style"
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

# Projection graticules

PROJ, through pyproj, transforms a synthetic geographic grid into Mollweide and Mercator coordinates. No map tiles are downloaded.

pyproj를 통해 PROJ로 경위선을 몰바이데·메르카토르 좌표로 변환했어요. 지도 타일을 받지 않아요.

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
from pyproj import Transformer
frames=[]
for target,scale in [('+proj=moll +datum=WGS84',18040095),('EPSG:3857',20037509)]:
 t=Transformer.from_crs('EPSG:4326',target,always_xy=True);inverse=Transformer.from_crs(target,'EPSG:4326',always_xy=True);xx,yy=t.transform(37,42);lon,lat=inverse.transform(xx,yy);assert abs(lon-37)<1e-6 and abs(lat-42)<1e-6
 paths=[]
 for lon in range(-180,181,30):
  lats=np.linspace(-80,80,81);a,b=t.transform(np.full(81,lon),lats);paths.append({'points':np.column_stack((a/scale,b/scale)).tolist(),'color':'#57d8c6'})
 for lat in range(-60,61,30):
  lons=np.linspace(-180,180,181);a,b=t.transform(lons,np.full(181,lat));paths.append({'points':np.column_stack((a/scale,b/scale)).tolist(),'color':'#ffbc78'})
 frames.append({'paths':paths})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
