---
id: depth-anything-v2.gallery
version: 1
title: Still-life relative depth (Depth Anything V2)
capability: image relative depth inference
tier: C
kind: python
packages:
- numpy==1.26.4
- Pillow==11.3.0
- torch==2.7.1
- torchvision==0.22.1
- transformers==4.53.2
source:
  name: Depth Anything V2
  repo: https://github.com/DepthAnything/Depth-Anything-V2
  license: Apache-2.0
io:
  inputs:
  - name: source.png
  outputs:
  - name: depth.png
    media: file
  - name: model.json
    media: file
verify:
  params: {}
  expect_outputs:
  - depth.png
  - model.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Still-life relative depth (Depth Anything V2)

## Setup

Install the pinned packages. The first run downloads public model weights into ~/.cache/siljangnim-models; no API key is required. CPU execution is supported.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json,os
from pathlib import Path
os.environ['HF_HOME']=str(Path.home()/'.cache/siljangnim-models/huggingface')
import numpy as np,torch
from PIL import Image
from transformers import AutoImageProcessor,AutoModelForDepthEstimation
torch.set_num_threads(4)
id='depth-anything/Depth-Anything-V2-Small-hf';revision='5426e4f0f36572d16453bbda7a8389317b1bef99'
processor=AutoImageProcessor.from_pretrained(id,revision=revision);model=AutoModelForDepthEstimation.from_pretrained(id,revision=revision).eval()
im=Image.open('in/source.png').convert('RGB')
with torch.inference_mode():pred=model(**processor(images=im,return_tensors='pt')).predicted_depth
p=torch.nn.functional.interpolate(pred[:,None],size=(im.height,im.width),mode='bicubic',align_corners=False)[0,0].numpy();p=(p-p.min())/(p.max()-p.min())
Image.fromarray(np.uint8(p*255)).save('out/depth.png');assert float(p.std())>.05
json.dump({'model':id,'revision':revision,'meaning':'relative inverse depth; brighter is closer, not metric distance'},open('out/model.json','w'))
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

The bundled result was produced by real model inference. It is a fixed example, not live inference in the browser. The recipe reruns inference on the bundled input. Model weights are not bundled.
