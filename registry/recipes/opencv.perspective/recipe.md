---
id: opencv.perspective
version: 1
title: Perspective correction
capability: image perspective
tier: C
kind: python
packages:
- numpy==2.2.4
- opencv-python-headless==4.11.0.86
source:
  name: OpenCV
  repo: https://github.com/opencv/opencv
  license: Apache-2.0
io:
  inputs: []
  outputs:
  - name: metrics.json
    media: json
  - name: result.png
    media: image
  - name: input.png
    media: image
verify:
  params: {}
  expect_outputs: ["metrics.json", "result.png", "input.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-16'
    version: 1
status: verified
origin: local
updated: '2026-10-16'
---

# Perspective correction

## Run

The self-contained fixture creates original input imagery, executes getPerspectiveTransform / warpPerspective, and asserts numerical properties. No external images or models are needed. Edit the input construction to try a different case. This demonstration is not a general-purpose detector.

```python
import cv2, numpy as np, json, os
os.makedirs('out', exist_ok=True)
rng = np.random.default_rng(23)
h,w = 360,640
img = np.full((h,w,3), (36,29,22), np.uint8)
# Make a printed card, photograph it obliquely, then rectify four known corners.
card = np.full((240,400,3), (225,240,245), np.uint8)
for y in range(20,240,40):
 for x in range(20,400,40):
  cv2.rectangle(card,(x,y),(x+20,y+20),(190,130,25),-1)
cv2.putText(card,'REMIX',(70,132),cv2.FONT_HERSHEY_DUPLEX,1.8,(30,40,60),4,cv2.LINE_AA)
src=np.float32([[0,0],[399,0],[399,239],[0,239]])
dst=np.float32([[140,75],[535,30],[480,310],[60,270]])
M=cv2.getPerspectiveTransform(src,dst)
photo=cv2.warpPerspective(card,M,(w,h),borderValue=(36,29,22))
rect=cv2.warpPerspective(photo,cv2.getPerspectiveTransform(dst,src),(400,240))
result=img.copy(); result[60:300,120:520]=rect
error=float(np.abs(rect.astype(float)-card.astype(float)).mean())
assert error < 12, error
cv2.imwrite('out/input.png',photo);cv2.imwrite('out/result.png',result)
json.dump({'opencv':cv2.__version__,'corners':dst.tolist(),'roundtrip_mae':error,'note':'Known corners supplied; not automatic document detection.'},open('out/metrics.json','w'),indent=2)
```

## Verify

Assertions check the known transform, tracked translation, or masked reconstruction. Results and measurements are written to `out/`.
