---
id: real-esrgan.gallery
version: 1
title: Four-times detail (Real-ESRGAN)
capability: image upscale super resolution
tier: C
kind: python
packages:
- basicsr==1.4.2
- numpy==1.26.4
- opencv-python==4.11.0.86
- Pillow==11.3.0
- realesrgan==0.3.0
- torch==2.7.1
- torchvision==0.22.1
source:
  name: Real-ESRGAN
  repo: https://github.com/xinntao/Real-ESRGAN
  license: BSD-3-Clause
io:
  inputs:
  - name: source.png
  outputs:
  - name: low.png
    media: file
  - name: upscaled.png
    media: file
verify:
  params: {}
  expect_outputs:
  - low.png
  - upscaled.png
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Four-times detail (Real-ESRGAN)

## Setup

Install the pinned packages. The first run downloads public model weights into ~/.cache/siljangnim-models; no API key is required. CPU execution is supported.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import sys,types,urllib.request
from pathlib import Path
# BasicSR 1.4.2 imports the old module name; torchvision moved this function.
from torchvision.transforms.functional import rgb_to_grayscale
compat=types.ModuleType('torchvision.transforms.functional_tensor');compat.rgb_to_grayscale=rgb_to_grayscale;sys.modules[compat.__name__]=compat
import cv2,torch
from realesrgan import RealESRGANer
from realesrgan.archs.srvgg_arch import SRVGGNetCompact
torch.set_num_threads(4)
cache=Path.home()/'.cache/siljangnim-models';cache.mkdir(parents=True,exist_ok=True);checkpoint=cache/'realesr-general-x4v3.pth'
if not checkpoint.exists():urllib.request.urlretrieve('https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth',checkpoint)
model=SRVGGNetCompact(num_in_ch=3,num_out_ch=3,num_feat=64,num_conv=32,upscale=4,act_type='prelu')
up=RealESRGANer(scale=4,model_path=str(checkpoint),model=model,tile=64,tile_pad=10,pre_pad=0,half=False,device=torch.device('cpu'))
im=cv2.imread('in/source.png');low=cv2.resize(im,(128,128),interpolation=cv2.INTER_AREA);cv2.imwrite('out/low.png',low)
result,_=up.enhance(low,outscale=4);cv2.imwrite('out/upscaled.png',result);assert result.shape[:2]==(512,512)
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

The bundled result was produced by real model inference. It is a fixed example, not live inference in the browser. The recipe reruns inference on the bundled input. Model weights are not bundled.
