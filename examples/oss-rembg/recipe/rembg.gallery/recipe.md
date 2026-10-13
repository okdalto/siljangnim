---
id: rembg.gallery
version: 1
title: Still-life cutout (rembg)
capability: image background removal alpha
tier: C
kind: python
packages:
- numpy==1.26.4
- Pillow==11.3.0
- rembg[cpu]==2.0.67
source:
  name: rembg
  repo: https://github.com/danielgatis/rembg
  license: MIT
io:
  inputs:
  - name: source.png
  outputs:
  - name: cutout.png
    media: file
verify:
  params: {}
  expect_outputs:
  - cutout.png
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Still-life cutout (rembg)

## Setup

Install the pinned packages. The first run downloads public model weights into ~/.cache/siljangnim-models; no API key is required. CPU execution is supported.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import os
from pathlib import Path
os.environ['U2NET_HOME']=str(Path.home()/'.cache/siljangnim-models/u2net')
from rembg import remove,new_session
from PIL import Image
import numpy as np
im=Image.open('in/source.png').convert('RGB');result=remove(im,session=new_session('u2netp',providers=['CPUExecutionProvider']))
result.save('out/cutout.png');a=np.array(result)[:,:,3];assert a.min()<30 and a.max()>225
print('u2netp foreground fraction',float((a>128).mean()))
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

The bundled result was produced by real model inference. It is a fixed example, not live inference in the browser. The recipe reruns inference on the bundled input. Model weights are not bundled.
