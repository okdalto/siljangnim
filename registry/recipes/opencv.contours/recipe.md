---
id: opencv.contours
version: 1
title: Edge contours as polylines (OpenCV)
capability: image-to-lines edges contours polylines json line drawing
tier: C
kind: python
packages:
- numpy
- opencv-python-headless==4.11.0.86
source:
  name: OpenCV
  repo: https://github.com/opencv/opencv
  license: Apache-2.0
io:
  inputs:
  - name: an image
    media: image
  outputs:
  - name: contours.json
    media: json
  - name: edges.png
    media: image
verify:
  params:
    max_contours: 50
  expect_outputs:
  - contours.json
  - edges.png
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-11'
    version: 1
status: verified
origin: local
updated: '2026-10-11'
---

# Edge contours as polylines (OpenCV)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import glob, json, os
import cv2, numpy as np
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
files = [f for f in sorted(glob.glob('in/*')) if not f.endswith('params.json')]
src = os.path.join('in', P['input']) if P.get('input') else files[0]
img = cv2.imread(src, cv2.IMREAD_GRAYSCALE)
h, w = img.shape
k = int(P.get('blur', 3))
if k > 0:
    img = cv2.GaussianBlur(img, (k | 1, k | 1), 0)
edges = cv2.Canny(img, int(P.get('low', 60)), int(P.get('high', 160)))
cv2.imwrite('out/edges.png', edges)
found, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
lines = []
for c in found:
    length = cv2.arcLength(c, False)
    if length < float(P.get('min_length', 40)):
        continue
    poly = cv2.approxPolyDP(c, float(P.get('epsilon', 0.8)), False).reshape(-1, 2)
    flat = np.empty(poly.size, dtype=np.float32)
    flat[0::2] = poly[:, 0] / w
    flat[1::2] = 1 - poly[:, 1] / h
    lines.append((length, [round(float(v), 4) for v in flat]))
lines.sort(key=lambda l: -l[0])
lines = [l[1] for l in lines[: int(P.get('max_contours', 1500))]]
json.dump({"width": w, "height": h, "contours": lines}, open('out/contours.json', 'w'))
print(len(found), "contours found,", len(lines), "kept,", sum(len(l) // 2 for l in lines), "points")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: input, blur (odd kernel, 0 = none), low/high (Canny thresholds), min_length (pixels), epsilon (approxPolyDP, pixels), max_contours. contours.json: width, height, contours (longest first) as flat [x0, y0, x1, y1, …] in 0..1 with y up.
