---
id: segment-anything.gallery
version: 1
title: Prompted object masks (SAM)
capability: image segmentation point mask
tier: C
kind: python
packages:
- numpy==1.26.4
- Pillow==11.3.0
- segment-anything==1.0
- torch==2.7.1
- torchvision==0.22.1
source:
  name: Segment Anything (SAM)
  repo: https://github.com/facebookresearch/segment-anything
  license: Apache-2.0
io:
  inputs:
  - name: source.png
  outputs:
  - name: mask-0.png
    media: file
  - name: mask-1.png
    media: file
  - name: mask-2.png
    media: file
  - name: prompts.json
    media: file
verify:
  params: {}
  expect_outputs:
  - mask-0.png
  - mask-1.png
  - mask-2.png
  - prompts.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Prompted object masks (SAM)

## Setup

Install the pinned packages. The first run downloads public model weights into ~/.cache/siljangnim-models; no API key is required. CPU execution is supported.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json,urllib.request
from pathlib import Path
import numpy as np,torch
from PIL import Image
from segment_anything import sam_model_registry,SamPredictor
torch.set_num_threads(4)
cache=Path.home()/'.cache/siljangnim-models';cache.mkdir(parents=True,exist_ok=True);checkpoint=cache/'sam_vit_b_01ec64.pth'
if not checkpoint.exists():urllib.request.urlretrieve('https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth',checkpoint)
model=sam_model_registry['vit_b'](checkpoint=str(checkpoint));predictor=SamPredictor(model);im=np.array(Image.open('in/source.png').convert('RGB'));predictor.set_image(im)
# Original scene prompt positions: sphere, cube, torus. Normalized so input can resize.
points=[[.34,.46],[.61,.66],[.67,.42]];scores=[]
for i,point in enumerate(points):
 xy=np.array([[point[0]*im.shape[1],point[1]*im.shape[0]]]);masks,confidence,_=predictor.predict(point_coords=xy,point_labels=np.array([1]),multimask_output=True)
 k=int(np.argmax(confidence));mask=masks[k];Image.fromarray(np.uint8(mask)*255).save(f'out/mask-{i}.png');scores.append(float(confidence[k]));assert mask.any() and not mask.all()
json.dump({'points':points,'scores':scores,'model':'SAM ViT-B'},open('out/prompts.json','w'))
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

The bundled result was produced by real model inference. It is a fixed example, not live inference in the browser. The recipe reruns inference on the bundled input. Model weights are not bundled.
