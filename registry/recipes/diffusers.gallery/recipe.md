---
id: diffusers.gallery
version: 1
title: From noise to tiny images (Diffusers)
capability: image diffusion denoise sampling
tier: C
kind: python
packages:
- accelerate==1.9.0
- diffusers==0.34.0
- numpy==1.26.4
- Pillow==11.3.0
- torch==2.7.1
- torchvision==0.22.1
- transformers==4.53.2
source:
  name: Diffusers (Stable Diffusion and others)
  repo: https://github.com/huggingface/diffusers
  license: Apache-2.0
io:
  inputs: []
  outputs:
  - name: denoising.png
    media: file
  - name: sampling.json
    media: file
verify:
  params: {}
  expect_outputs:
  - denoising.png
  - sampling.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# From noise to tiny images (Diffusers)

## Setup

Install the pinned packages. The first run downloads public model weights into ~/.cache/siljangnim-models; no API key is required. CPU execution is supported.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json,os
from pathlib import Path
os.environ['HF_HOME']=str(Path.home()/'.cache/siljangnim-models/huggingface')
import torch,numpy as np
from PIL import Image
from diffusers import UNet2DModel,DDIMScheduler
torch.set_num_threads(4);device='mps' if torch.backends.mps.is_available() else 'cpu'
id='google/ddpm-cifar10-32';revision='267b167dc01f0e4e61923ea244e8b988f84deb80'
model=UNet2DModel.from_pretrained(id,revision=revision).to(device).eval();scheduler=DDIMScheduler.from_pretrained(id,revision=revision);scheduler.set_timesteps(50)
x=torch.randn((4,3,32,32),generator=torch.Generator().manual_seed(23)).to(device);frames=[]
def frame(x):
 a=(x.detach().cpu().clamp(-1,1)/2+.5).permute(0,2,3,1).numpy();return np.uint8(np.concatenate([np.concatenate(a[:2],axis=1),np.concatenate(a[2:],axis=1)],axis=0)*255)
frames.append(frame(x))
with torch.inference_mode():
 for i,t in enumerate(scheduler.timesteps):
  x=scheduler.step(model(x,t).sample,t,x).prev_sample
  if (i+1)%5==0:frames.append(frame(x));print('step',i+1,flush=True)
# One sprite sheet: 11 real sampling states, from noise to generated 32px images.
Image.fromarray(np.concatenate(frames,axis=1)).save('out/denoising.png')
json.dump({'frames':len(frames),'tile':64,'steps':50,'seed':23,'model':id,'revision':revision,'scheduler':'DDIM'},open('out/sampling.json','w'))
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

The bundled result was produced by real model inference. It is a fixed example, not live inference in the browser. The recipe reruns inference on the bundled input. Model weights are not bundled.
