---
id: vtracer.gallery
version: 1
title: Raster contours become vectors
capability: vtracer prepared geometry simulation
tier: C
kind: python
packages:
- vtracer==0.6.15
- fonttools==4.66.0
- numpy==2.2.6
source:
  name: "VTracer"
  repo: https://github.com/visioncortex/vtracer
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

# Raster contours become vectors

VTracer converts an original binary drawing to SVG. FontTools samples the returned Bézier paths for display; both conversion modes are prepared locally.

VTracer로 직접 만든 이진 그림을 SVG로 바꾸고 FontTools로 베지어 경로를 표본화했어요. 두 변환 모드를 직접 실행했어요.

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
import vtracer,xml.etree.ElementTree as ET,re
from PIL import Image,ImageDraw
from fontTools.svgLib.path import parse_path
from fontTools.pens.basePen import BasePen
class Pen(BasePen):
 def __init__(self):super().__init__(None);self.paths=[];self.current=[]
 def _moveTo(self,p):self.current=[p];self.paths.append(self.current)
 def _lineTo(self,p):self.current.append(p)
 def _curveToOne(self,a,b,c):
  start=self._getCurrentPoint()
  for t in np.linspace(0,1,13)[1:]:self.current.append(tuple((1-t)**3*start[i]+3*(1-t)**2*t*a[i]+3*(1-t)*t*t*b[i]+t**3*c[i] for i in range(2)))
 def _qCurveToOne(self,a,b):
  start=self._getCurrentPoint()
  for t in np.linspace(0,1,13)[1:]:self.current.append(tuple((1-t)**2*start[i]+2*(1-t)*t*a[i]+t*t*b[i] for i in range(2)))
 def _closePath(self):self.current.append(self.current[0])
image=Image.new('RGB',(200,200),'white');draw=ImageDraw.Draw(image);draw.ellipse((35,30,165,160),fill='black');draw.ellipse((72,60,127,115),fill='white');draw.rectangle((70,135,130,185),fill='black');image.save('out/input.png');frames=[]
for mode in ['polygon','spline']:
 svg=vtracer.convert_raw_image_to_svg(Path('out/input.png').read_bytes(),img_format='png',colormode='binary',mode=mode,filter_speckle=4)
 paths=[]
 for element in ET.fromstring(svg).iter():
  if not element.tag.endswith('path'):continue
  pen=Pen();parse_path(element.attrib['d'],pen);match=re.search(r'translate\(([^)]+)\)',element.attrib.get('transform',''));offset=[float(x) for x in re.split(r'[ ,]+',match[1])] if match else [0,0]
  for points in pen.paths:paths.append({'points':[[(x+offset[0]-100)/110,(100-y-offset[1])/110] for x,y in points],'color':'#57d8c6'})
 assert len(paths)>=2;frames.append({'paths':paths})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
