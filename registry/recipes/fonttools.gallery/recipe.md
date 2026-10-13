---
id: fonttools.gallery
version: 1
title: Building original glyph outlines
capability: fonttools prepared geometry simulation
tier: C
kind: python
packages:
- fonttools==4.66.0
- numpy==2.2.6
source:
  name: "FontTools"
  repo: https://github.com/fonttools/fonttools
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

# Building original glyph outlines

FontTools builds and reloads an original TrueType font. Inspect the f, i and custom fi glyph contours and control points.

FontTools로 직접 만든 TrueType 폰트를 저장하고 다시 읽었어요. f·i·fi 글리프 윤곽과 제어점을 살펴보세요.

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
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
shapes={'.notdef':[[(40,0),(400,0),(400,700),(40,700)]],'f':[[(100,0),(220,0),(220,450),(440,450),(440,570),(220,570),(220,680),(440,680),(440,800),(100,800)]],'i':[[(80,0),(200,0),(200,570),(80,570)],[(80,680),(200,680),(200,800),(80,800)]],'fi':[[(100,0),(220,0),(220,450),(490,450),(490,0),(610,0),(610,570),(220,570),(220,680),(610,680),(610,800),(100,800)]]}
fb=FontBuilder(1000,isTTF=True);order=list(shapes);fb.setupGlyphOrder(order);fb.setupCharacterMap({102:'f',105:'i'});glyphs={}
for name,contours in shapes.items():
 pen=TTGlyphPen(None)
 for points in contours:
  pen.moveTo(points[0])
  for point in points[1:]:pen.lineTo(point)
  pen.closePath()
 glyphs[name]=pen.glyph()
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics({'.notdef':(500,40),'f':(500,100),'i':(280,80),'fi':(720,100)});fb.setupHorizontalHeader(ascent=850,descent=-150);fb.setupNameTable({'familyName':'Siljangnim Original Ligature','styleName':'Regular','uniqueFontIdentifier':'SiljangnimOriginal1','fullName':'Siljangnim Original Ligature','psName':'SiljangnimOriginalLigature'});fb.setupOS2(sTypoAscender=850,sTypoDescender=-150,usWinAscent=850,usWinDescent=150);fb.setupPost();fb.setupMaxp();addOpenTypeFeaturesFromString(fb.font,'feature liga { sub f i by fi; } liga;');fb.save('out/original.ttf')

from fontTools.ttLib import TTFont
font=TTFont('out/original.ttf');frames=[]
for name in ['f','i','fi']:
 glyph=font['glyf'][name];coords,ends,flags=glyph.getCoordinates(font['glyf']);paths=[];start=0
 for end in ends:
  p=[[(x-350)/500,(y-400)/500] for x,y in coords[start:end+1]];paths.append({'points':p+[p[0]],'color':'#57d8c6'});start=end+1
 assert paths;frames.append({'paths':paths,'points':[[(x-350)/500,(y-400)/500] for x,y in coords]})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
