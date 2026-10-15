---
id: opencv.inpaint
version: 1
title: Repair masked scratches
capability: image inpaint
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
  - name: mask.png
    media: image
verify:
  params: {}
  expect_outputs: ["metrics.json", "result.png", "input.png", "mask.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-16'
    version: 1
status: verified
origin: local
updated: '2026-10-16'
---

# Repair masked scratches

## Run

The self-contained fixture creates original input imagery, executes inpaint / INPAINT_TELEA, and asserts numerical properties. No external images or models are needed. Edit the input construction to try a different case. This demonstration is not a general-purpose detector.

```python
import cv2, numpy as np, json, os
os.makedirs('out', exist_ok=True)
rng = np.random.default_rng(23)
h,w = 360,640
img = np.full((h,w,3), (36,29,22), np.uint8)
# Damage an original striped illustration and reconstruct only the supplied mask.
for x in range(w): img[:,x]=(70+int(x/8),110+int(x/7),175+int(x/10))
for x in range(25,w,70): cv2.line(img,(x,0),(x+150,h),(160,65,45),12,cv2.LINE_AA)
cv2.circle(img,(320,180),82,(50,190,240),-1,cv2.LINE_AA)
mask=np.zeros((h,w),np.uint8)
cv2.line(mask,(70,100),(575,240),255,7)
cv2.line(mask,(235,45),(380,310),255,5)
damaged=img.copy();damaged[mask>0]=(15,15,15)
result=cv2.inpaint(damaged,mask,5,cv2.INPAINT_TELEA)
mae=lambda a: float(np.abs(a.astype(float)-img.astype(float))[mask>0].mean())
assert mae(result)<mae(damaged)*0.5
assert np.array_equal(result[mask==0],damaged[mask==0])
cv2.imwrite('out/input.png',damaged);cv2.imwrite('out/result.png',result);cv2.imwrite('out/mask.png',mask)
json.dump({'opencv':cv2.__version__,'damaged_mae':mae(damaged),'restored_mae':mae(result),'outside_mask_unchanged':True},open('out/metrics.json','w'),indent=2)
```

## Verify

Assertions check the known transform, tracked translation, or masked reconstruction. Results and measurements are written to `out/`.
