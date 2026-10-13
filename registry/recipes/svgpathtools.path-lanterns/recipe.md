---
id: svgpathtools.path-lanterns
version: 1
title: Equal arc-length SVG path samples (svgpathtools)
capability: geometry-sample svg bezier arc-length tangent path animation json
tier: C
kind: python
packages:
- svgpathtools==1.7.1
source:
  name: svgpathtools
  repo: https://github.com/mathandy/svgpathtools
  license: MIT
io:
  inputs: []
  outputs:
  - name: path.json
    media: json
  - name: source.svg
    media: image
verify:
  params:
    samples: 64
  expect_outputs:
  - path.json
  - source.svg
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Equal arc-length SVG path samples (svgpathtools)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os
from svgpathtools import parse_path
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
count = max(64, min(1200, int(P.get('samples', 600))))
# Original closed cubic path; no third-party artwork.
d = 'M 0 -0.44 C 0.55 -0.44 0.5 0.0 0 0 C -0.5 0 -0.55 0.44 0 0.44 C 0.55 0.44 0.5 0 0 0 C -0.5 0 -0.55 -0.44 0 -0.44 Z'
path=parse_path(d); length=path.length(); points=[]
for i in range(count):
    t=path.ilength(length*i/count); p=path.point(t); tangent=path.unit_tangent(t)
    points.append([round(p.real,7),round(p.imag,7),round(tangent.real,7),round(tangent.imag,7)])
assert len(points)==count
json.dump({'points':points,'length':length,'path':d},open('out/path.json','w'))
open('out/source.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 1 1"><path d="{d}" fill="none" stroke="#46dce0" stroke-width="0.004"/></svg>')
print(count,'equal arc-length samples; length',length)
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Parameter: samples (64..1200, default 600). Original closed cubic path; no external input. path.json contains length, SVG path text and points [x, y, tangent_x, tangent_y], with equal arc-length spacing and no duplicate endpoint. source.svg is the original editable path. Outputs are bundled so opening the example does not require Python.
