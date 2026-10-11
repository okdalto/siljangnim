---
id: shapely.offset-rings
version: 1
title: Offset rings around blob shapes (Shapely)
capability: geometry-generate offset contour rings topographic plotter lines json
tier: C
kind: python
packages:
- shapely==2.1.1
source:
  name: Shapely
  repo: https://github.com/shapely/shapely
  license: BSD-3-Clause
io:
  inputs: []
  outputs:
  - name: rings.json
    media: json
verify:
  params:
    blobs: 3
    step: 0.03
  expect_outputs:
  - rings.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-11'
    version: 1
status: verified
origin: local
updated: '2026-10-11'
---

# Offset rings around blob shapes (Shapely)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os, random
from shapely.geometry import Point
from shapely.ops import unary_union
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
rnd = random.Random(int(P.get('seed', 7)))
aspect = float(P.get('aspect', 1.6))
step = float(P.get('step', 0.008))
blobs = [Point(rnd.uniform(0.25, aspect - 0.25), rnd.uniform(0.25, 0.75)).buffer(rnd.uniform(0.06, 0.2), 64) for _ in range(int(P.get('blobs', 9)))]
land = unary_union(blobs)
rings = []
def add(shape, level):
    for poly in getattr(shape, 'geoms', [shape]):
        if poly.is_empty:
            continue
        for ring in [poly.exterior, *poly.interiors]:
            pts = []
            for x, y in ring.coords:
                pts += [round(x / aspect, 4), round(y, 4)]
            rings.append({"level": level, "points": pts})
level = 0
shape = land
while not shape.is_empty:
    add(shape, -level)
    level += 1
    shape = land.buffer(-step * level, 64)
for i in range(1, int(P.get('outward', 6)) + 1):
    add(land.buffer(step * i, 64), i)
json.dump({"aspect": aspect, "rings": rings}, open('out/rings.json', 'w'))
print(len(rings), "rings,", level, "levels inside")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: seed, blobs (random circles merged into islands), step (ring spacing), outward (rings outside the islands), aspect (width / height of the area). rings.json: aspect, rings as {level, points: flat [x, y, …] in 0..1 (x scaled by aspect)}; level < 0 inside, > 0 outside.
