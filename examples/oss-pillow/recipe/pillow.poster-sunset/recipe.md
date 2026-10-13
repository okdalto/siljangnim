---
id: pillow.poster-sunset
version: 1
title: Original sunset and median-cut palettes (Pillow)
capability: image-generate image-quantize posterize palette median-cut png
tier: C
kind: python
packages:
- Pillow==11.3.0
source:
  name: pillow
  repo: https://github.com/python-pillow/Pillow
  license: HPND
io:
  inputs: []
  outputs:
  - name: sunset.png
    media: image
  - name: poster-4.png
    media: image
  - name: poster-8.png
    media: image
  - name: poster-16.png
    media: image
  - name: poster-32.png
    media: image
verify:
  params:
    size: 64
  expect_outputs:
  - sunset.png
  - poster-4.png
  - poster-8.png
  - poster-16.png
  - poster-32.png
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Original sunset and median-cut palettes (Pillow)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, math, os
from PIL import Image, ImageDraw, ImageFilter
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
size = max(64, min(1024, int(P.get('size', 512))))
im = Image.new('RGB', (size, size)); d = ImageDraw.Draw(im)
for y in range(size):
    t = y / (size - 1)
    d.line((0, y, size, y), fill=tuple(round(a*(1-t)+b*t) for a,b in zip((35,30,92),(255,164,114))))
d.ellipse((size*.29,size*.17,size*.71,size*.59), fill=(255,219,155))
im = im.filter(ImageFilter.GaussianBlur(size*.008)); d=ImageDraw.Draw(im)
for layer in range(5):
    pts=[(x, int(size*(.49+layer*.095+.055*math.sin(x/size*7+layer*1.7)+.025*math.cos(x/size*15+layer)))) for x in range(size)]
    d.polygon(pts+[(size,size),(0,size)],fill=[(153,78,127),(108,62,117),(63,58,98),(33,48,76),(18,35,54)][layer])
im.save('out/sunset.png')
for colors in (4,8,16,32):
    q=im.quantize(colors=colors,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    assert len(q.getcolors()) <= colors
    q.save(f'out/poster-{colors}.png')
print('Original sunset and four median-cut palettes:',size)
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Parameter: size (64..1024 pixels, default 512). Generates original artwork with no external input. Writes sunset.png and poster-{4,8,16,32}.png; the latter have at most the named number of colors. Outputs are bundled so opening the example does not require Python.
