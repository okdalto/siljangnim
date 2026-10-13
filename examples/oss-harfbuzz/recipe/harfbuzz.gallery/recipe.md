---
id: harfbuzz.gallery
version: 1
title: Shaping a ligature
capability: harfbuzz prepared geometry simulation
tier: C
kind: python
packages:
- uharfbuzz==0.56.2
- fonttools==4.66.0
- numpy==2.2.6
source:
  name: "HarfBuzz"
  repo: https://github.com/harfbuzz/harfbuzz
  license: "MIT-old"
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

# Shaping a ligature

HarfBuzz shapes “fifi” using an original font with an fi ligature. Compare four glyphs with two substituted ligatures.

HarfBuzz로 직접 만든 fi 합자 폰트의 “fifi”를 조형했어요. 네 글리프와 합자로 치환된 두 글리프를 비교하세요.

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

import uharfbuzz as hb
face=hb.Face(Path('out/original.ttf').read_bytes());font=hb.Font(face);font.scale=(1000,1000);frames=[]
for liga in [False,True]:
 buf=hb.Buffer();buf.add_str('fifi');buf.guess_segment_properties();hb.shape(font,buf,{'liga':liga});assert len(buf.glyph_infos)==(2 if liga else 4);paths=[];x=0
 for info,pos in zip(buf.glyph_infos,buf.glyph_positions):
  name=order[info.codepoint]
  for contour in shapes[name]:
   pts=[[(x+px+pos.x_offset)/1000-.8,(py+pos.y_offset-400)/600] for px,py in contour];paths.append({'points':pts+[pts[0]],'color':'#57d8c6'})
  x+=pos.x_advance
 frames.append({'paths':paths,'glyph_count':len(buf.glyph_infos)})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
