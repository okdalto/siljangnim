---
id: opencv.flow
version: 1
title: Track moving corners
capability: image flow
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

# Track moving corners

## Run

The self-contained fixture creates original input imagery, executes goodFeaturesToTrack / calcOpticalFlowPyrLK, and asserts numerical properties. No external images or models are needed. Edit the input construction to try a different case. This demonstration is not a general-purpose detector.

```python
import cv2, numpy as np, json, os
os.makedirs('out', exist_ok=True)
rng = np.random.default_rng(23)
h,w = 360,640
img = np.full((h,w,3), (36,29,22), np.uint8)
# Track textured objects under a known translation, then measure tracking error.
for i in range(70):
 x,y=rng.integers([45,45],[560,290]); color=tuple(int(v) for v in rng.integers(75,245,3))
 cv2.rectangle(img,(x,y),(x+14,y+14),color,-1)
shift=np.float32([[1,0,24],[0,1,12]])
next_img=cv2.warpAffine(img,shift,(w,h),borderValue=(36,29,22))
gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
p0=cv2.goodFeaturesToTrack(gray,100,0.05,12)
p1,status,err=cv2.calcOpticalFlowPyrLK(gray,cv2.cvtColor(next_img,cv2.COLOR_BGR2GRAY),p0,None,winSize=(21,21),maxLevel=3)
a=p0[status.ravel()==1].reshape(-1,2);b=p1[status.ravel()==1].reshape(-1,2)
e=np.linalg.norm((b-a)-[24,12],axis=1)
assert len(a)>40 and float(np.median(e))<0.2
result=next_img.copy()
for start,end in zip(a,b):
 cv2.arrowedLine(result,tuple(np.rint(start).astype(int)),tuple(np.rint(end).astype(int)),(90,245,250),2,cv2.LINE_AA,tipLength=0.25)
cv2.imwrite('out/input.png',img);cv2.imwrite('out/result.png',result)
json.dump({'opencv':cv2.__version__,'tracked_points':len(a),'expected_displacement':[24,12],'median_error_px':float(np.median(e)),'tracks':[{'from':x.tolist(),'to':y.tolist()} for x,y in zip(a,b)]},open('out/metrics.json','w'),indent=2)
```

## Verify

Assertions check the known transform, tracked translation, or masked reconstruction. Results and measurements are written to `out/`.
