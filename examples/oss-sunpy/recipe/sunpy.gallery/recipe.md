---
id: sunpy.gallery
version: 1
title: Solar latitude and longitude from space
capability: sunpy simulation science
tier: C
kind: python
packages:
- sunpy==8.0.0
- numpy==2.2.6
source:
  name: "SunPy"
  repo: https://github.com/sunpy/sunpy
  license: "BSD-3-Clause"
io:
  inputs: []
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Solar latitude and longitude from space

SunPy transforms a synthetic solar coordinate grid to three observer latitudes. Curves show actual heliographic-to-helioprojective transforms, not telescope images.

SunPy로 태양 좌표 격자를 세 관측 위도에서의 좌표로 변환했어요. 망원경 사진이 아닌 실제 태양 좌표 변환 결과예요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU, API key or observation download is required. 

## Run

```python
import pathlib,json,numpy as np
out=pathlib.Path('out');out.mkdir(exist_ok=True)

import astropy.units as u
from astropy.coordinates import SkyCoord
from sunpy.coordinates import frames
from sunpy.sun import constants
result={'frames':[]}
for latitude in [-30,0,30]:
 observer=SkyCoord(0*u.deg,latitude*u.deg,1*u.AU,frame=frames.HeliographicStonyhurst,obstime='2024-01-01');lines=[]
 grids=[(np.linspace(-180,180,241),np.full(241,lat))for lat in range(-60,61,20)]+[(np.full(161,lon),np.linspace(-89,89,161))for lon in range(-150,151,30)]
 for lon,lat in grids:
  coordinates=SkyCoord(lon*u.deg,lat*u.deg,constants.radius,frame=frames.HeliographicStonyhurst,obstime=observer.obstime);projected=coordinates.transform_to(frames.Helioprojective(observer=observer,obstime=observer.obstime))
  visible=np.cos(np.radians(lat))*np.cos(np.radians(lon))*np.cos(np.radians(latitude))+np.sin(np.radians(lat))*np.sin(np.radians(latitude))>constants.radius.to_value(u.AU)
  x=projected.Tx.to_value(u.arcsec)/1250;y=projected.Ty.to_value(u.arcsec)/1250;assert np.all(np.isfinite(x+y))
  run=[]
  for a,b,show in zip(x,y,visible):
   if show:run.append([float(a),float(b)])
   elif run:
    if len(run)>1:lines.append({'points':run})
    run=[]
  if len(run)>1:lines.append({'points':run})
 result['frames'].append({'paths':lines})

(out/'result.json').write_text(json.dumps(result,allow_nan=False))
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

Original synthetic input. Coordinates use the fixed date 2024-01-01 and synthetic observers at 1 AU.
