---
id: hilbertcurve.orders
version: 1
title: Hilbert curves of increasing order (hilbertcurve)
capability: geometry-generate space filling curve hilbert path plotter polyline json
tier: C
kind: python
packages:
- hilbertcurve==2.0.5
source:
  name: hilbertcurve
  repo: https://github.com/galtay/hilbertcurve
  license: MIT
io:
  inputs: []
  outputs:
  - name: hilbert.json
    media: json
verify:
  params:
    max_order: 3
  expect_outputs:
  - hilbert.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-12'
    version: 1
status: verified
origin: local
updated: '2026-10-12'
---

# Hilbert curves of increasing order (hilbertcurve)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os
from hilbertcurve.hilbertcurve import HilbertCurve
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
max_order = int(P.get('max_order', 7))
orders = []
for p in range(1, max_order + 1):
    side = 2 ** p
    pts = HilbertCurve(p, 2).points_from_distances(list(range(side * side)))
    flat = []
    for x, y in pts:
        flat += [round((x + 0.5) / side, 5), round((y + 0.5) / side, 5)]
    orders.append({"order": p, "points": flat})
p3 = int(P.get('order_3d', 4))
curve3d = None
if p3 > 0:
    side = 2 ** p3
    pts = HilbertCurve(p3, 3).points_from_distances(list(range(side ** 3)))
    curve3d = {"order": p3, "points": [round((c + 0.5) / side, 4) for pt in pts for c in pt]}
json.dump({"orders": orders, "curve3d": curve3d}, open('out/hilbert.json', 'w'))
print(len(orders), "2D orders, largest", 4 ** max_order, "points")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: max_order (2D orders 1..max_order; order p has 4^p points), order_3d (one 3D curve with 8^p points, 0 = none). hilbert.json: orders as {order, points: flat [x, y, …] cell centers in 0..1, in curve order}, curve3d {order, points: flat [x, y, z, …] in 0..1} or null.
