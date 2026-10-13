---
id: torchcfm.gallery
version: 1
title: Conditional probability paths
capability: torchcfm local learning computation
tier: C
kind: python
packages:
- torchcfm==1.0.7
- torch==2.9.1
- numpy==2.2.6
source:
  name: "TorchCFM"
  repo: https://github.com/atong01/conditional-flow-matching
  license: "MIT"
io:
  inputs: []
  outputs:
  - name: torchcfm.json
    media: file
verify:
  params: {}
  expect_outputs: [torchcfm.json]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Conditional probability paths

TorchCFM samples a noisy conditional path between a Gaussian cloud and a ring. Arrows are target conditional velocities; no learned model or pretrained weights are involved.

TorchCFM으로 가우시안 점 구름과 고리 사이의 조건부 확률 경로를 계산했어요. 화살표는 목표 조건부 속도이며 학습한 모델이나 사전 가중치를 쓰지 않아요.

## Setup

Use the pinned packages above. Map the example assets listed as inputs to their matching in/ filenames. CPU execution is verified; no API key is used.

## Run

```python
import json,os,sys,hashlib
from pathlib import Path
import torch,numpy as np
torch.set_num_threads(2);torch.manual_seed(17);out=Path('out');out.mkdir(exist_ok=True)
from torchcfm.conditional_flow_matching import ConditionalFlowMatcher
torch.manual_seed(8);x0=torch.randn(80,2)*.16+torch.tensor([-.6,0]);angle=torch.linspace(0,2*np.pi,81)[:-1];x1=torch.stack((.55+.24*torch.cos(angle),.4*torch.sin(angle)),dim=1);fm=ConditionalFlowMatcher(sigma=.04);frames=[]
for t in torch.linspace(0,1,21):
 torch.manual_seed(4);times,xt,ut=fm.sample_location_and_conditional_flow(x0,x1,t=torch.full((80,),float(t)));assert torch.isfinite(xt).all() and torch.allclose(ut,x1-x0,atol=1e-6)
 frames.append({'points':xt.tolist(),'paths':[{'points':[p.tolist(),(p+v*.09).tolist()],'color':'#57d8c6'} for p,v in zip(xt,ut)]})
(out/'torchcfm.json').write_text(json.dumps({'frames':frames},separators=(',',':')));print('torchCFM',len(frames),flush=True)

```

## Verify

The script checks the numerical result before saving it. The gallery reads saved data and does not retrain or rerun inference when changing controls.
