---
id: ultralytics-yolo.gallery
version: 1
title: A classifier’s guesses
capability: ultralytics-yolo local learning computation
tier: C
kind: python
packages:
- ultralytics==8.3.230
- torch==2.9.1
- torchvision==0.24.1
- numpy==2.2.6
source:
  name: "Ultralytics YOLO"
  repo: https://github.com/ultralytics/ultralytics
  license: "AGPL-3.0 / Enterprise"
io:
  inputs:
  - name: input.png
    media: file
  outputs:
  - name: yolo.json
    media: file
verify:
  params: {}
  expect_outputs: [yolo.json]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# A classifier’s guesses

YOLO11n-cls classifies an original synthetic flower on the CPU. Its top guess is wrong: inspect the real top-five probabilities rather than treating the labels as truth.

YOLO11n-cls를 CPU에서 실행해 직접 만든 꽃 그림을 분류했어요. 첫 번째 추측은 틀렸어요. 라벨을 정답으로 보지 말고 실제 상위 5개 확률을 비교하세요.

## Setup

Use the pinned packages above. Map the example assets listed as inputs to their matching in/ filenames. CPU execution is verified; no API key is used. The first run downloads and caches the 5.5 MB classifier under ~/.cache/siljangnim/models after checking its SHA-256 digest.

## Run

```python
import json,os,sys,hashlib
from pathlib import Path
import torch,numpy as np
torch.set_num_threads(2);torch.manual_seed(17);out=Path('out');out.mkdir(exist_ok=True)
from ultralytics import YOLO
cache=Path(os.environ.get('SILJANGNIM_MODEL_CACHE',str(Path.home()/'.cache/siljangnim/models')));cache.mkdir(parents=True,exist_ok=True);weights=cache/'yolo11n-cls.pt'
if not weights.exists():
 import urllib.request
 weights.write_bytes(urllib.request.urlopen('https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n-cls.pt',timeout=60).read())
assert hashlib.sha256(weights.read_bytes()).hexdigest()=="c62d41bf9625777760018bf914d2e6cd472420ccd01706d97a61cb6c82502bd7"
model=YOLO(str(weights));result=model.predict('in/input.png',device='cpu',verbose=False)[0];probs=result.probs.data.cpu().numpy();assert abs(float(probs.sum())-1)<1e-5 and np.isfinite(probs).all();top=result.probs.top5;data={'classes':[{'name':result.names[i],'probability':float(probs[i])} for i in top],'model':'yolo11n-cls','model_sha256':hashlib.sha256(weights.read_bytes()).hexdigest(),'input':'Original procedural flower and vase'};(out/'yolo.json').write_text(json.dumps(data,indent=2));print('YOLO',data['classes'],flush=True)

```

## Verify

The script checks the numerical result before saving it. The gallery reads saved data and does not retrain or rerun inference when changing controls.
