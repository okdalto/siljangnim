---
id: u2-net.gallery
version: 1
title: U2Netp foreground mask
capability: image foreground segmentation
tier: E
kind: python
packages:
- onnxruntime==1.23.2
- numpy==2.2.6
- Pillow==11.3.0
source:
  name: U2Net
  repo: https://github.com/xuebinqin/u-2-net
  license: Apache-2.0
io:
  inputs: []
  outputs:
  - name: input.png
    media: file
  - name: mask.png
    media: file
  - name: cutout.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: [input.png, mask.png, cutout.png, result.json]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# U²Netp foreground extraction

U²Netp runs through ONNX Runtime on the CPU and extracts a foreground mask from an original procedural flower. This saved prediction includes part of the shadow; compare it with the input.

U²Netp를 ONNX Runtime CPU로 직접 실행해 직접 만든 꽃 이미지의 전경 마스크를 구했어요. 그림자 일부도 포함된 예측을 원본과 비교하세요.

## Setup

The first run downloads a 4.6 MB ONNX model from the rembg release URL below, verifies its pinned SHA-256 checksum, and caches it under ~/.cache/siljangnim/models. Existing valid weights are reused. CPU execution needs no GPU or API key.

## Run

```python
import os,json,hashlib,urllib.request
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
import onnxruntime as ort
out=Path('out');out.mkdir(exist_ok=True)
cache=Path(os.environ.get('SILJANGNIM_MODEL_CACHE',str(Path.home()/'.cache/siljangnim/models')));cache.mkdir(parents=True,exist_ok=True)
model=cache/'u2netp.onnx';url='https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx';expected='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'
if not model.exists() or hashlib.sha256(model.read_bytes()).hexdigest()!=expected:
 data=urllib.request.urlopen(url,timeout=60).read();assert hashlib.sha256(data).hexdigest()==expected,'Model checksum mismatch';tmp=model.with_suffix('.tmp');tmp.write_bytes(data);tmp.replace(model)
size=400;y,x=np.mgrid[:size,:size];background=np.zeros((size,size,3),np.uint8);background[:]=np.clip(np.array([225,224,213])[None,None,:]+((x+y-size)/size*16)[...,None],0,255)
image=Image.fromarray(background);draw=ImageDraw.Draw(image)
draw.ellipse((105,336,303,371),fill=(195,193,180))
for width in range(130,0,-1):
 light=1-(width/130)**2;draw.ellipse((200-width/2,235,200+width/2,352),fill=(int(24+30*light),int(70+90*light),int(85+105*light)))
draw.line((200,258,200,141),fill=(57,107,69),width=9);draw.ellipse((200,191,250,216),fill=(49,113,71));draw.ellipse((160,168,202,189),fill=(66,133,79))
for k in range(8):
 a=k*np.pi/4;cx=200+43*np.cos(a);cy=120+43*np.sin(a);draw.ellipse((cx-25,cy-25,cx+25,cy+25),fill=(237,160+int(20*np.cos(a)),54))
draw.ellipse((169,89,231,151),fill=(102,62,42));draw.ellipse((180,95,215,123),fill=(132,80,48));image.save(out/'input.png')
small=np.asarray(image.resize((320,320),Image.Resampling.LANCZOS),dtype=np.float32);small/=max(float(small.max()),1e-6);tensor=((small-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)).transpose(2,0,1)[None]
options=ort.SessionOptions();options.intra_op_num_threads=2;session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider']);prediction=session.run(None,{session.get_inputs()[0].name:tensor})[0][0,0]
assert np.isfinite(prediction).all();span=float(prediction.max()-prediction.min());assert span>.1
prediction=(prediction-prediction.min())/span;mask=Image.fromarray((prediction*255).astype(np.uint8)).resize(image.size,Image.Resampling.LANCZOS);mask.save(out/'mask.png')
cutout=image.copy();cutout.putalpha(mask);cutout.save(out/'cutout.png');m=np.asarray(mask);assert .03<float((m>127).mean())<.85
(out/'result.json').write_text(json.dumps({'model':'u2netp','provider':'CPUExecutionProvider','source':url,'model_sha256':hashlib.sha256(model.read_bytes()).hexdigest(),'foreground_fraction':float((m>127).mean()),'input':'Original procedural flower and vase, generated in this recipe','onnxruntime':ort.__version__},indent=2))
print((out/'result.json').read_text())
```

## Verify

Checks model checksum, finite predictions, and nontrivial foreground area. Saved metadata records the SHA-256 digest. These checks do not claim semantic accuracy of every pixel.
