---
id: nanogpt.gallery
version: 1
title: Fitting a tiny character model
capability: nanogpt local learning computation
tier: C
kind: python
packages:
- torch==2.9.1
- numpy==2.2.6
source:
  name: "nanoGPT"
  repo: https://github.com/karpathy/nanoGPT
  license: "MIT"
io:
  inputs:
  - name: model.py
    media: file
  outputs:
  - name: nanogpt.json
    media: file
verify:
  params: {}
  expect_outputs: [nanogpt.json]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Fitting a tiny character model

The original nanoGPT model trains locally for 181 steps on three original sentences. The saved curve is training loss, not a generalization score; the text is a sample from the final checkpoint.

nanoGPT 원본 모델을 직접 쓴 세 문장으로 181단계 학습했어요. 저장된 곡선은 일반화 성능이 아닌 학습 손실이고, 문장은 마지막 체크포인트의 생성 결과예요.

## Setup

Use the pinned packages above. Map the example assets listed as inputs to their matching in/ filenames. CPU execution is verified; no API key is used.

## Run

```python
import json,os,sys,hashlib
from pathlib import Path
import torch,numpy as np
torch.set_num_threads(2);torch.manual_seed(17);out=Path('out');out.mkdir(exist_ok=True)
import importlib.util
spec=importlib.util.spec_from_file_location('model','in/model.py');module=importlib.util.module_from_spec(spec);sys.modules['model']=module;spec.loader.exec_module(module);GPT,GPTConfig=module.GPT,module.GPTConfig
corpus=('rings rise and rivers flow. small seeds grow into trees. stars turn above the sea. ')*120
alphabet=sorted(set(corpus));mapping={c:i for i,c in enumerate(alphabet)};tokens=torch.tensor([mapping[c] for c in corpus]);model=GPT(GPTConfig(block_size=32,vocab_size=len(alphabet),n_layer=2,n_head=2,n_embd=48,dropout=0,bias=True));optimizer=torch.optim.AdamW(model.parameters(),lr=.003);losses=[]
for step in range(181):
 starts=torch.randint(len(tokens)-33,(12,));x=torch.stack([tokens[i:i+32] for i in starts]);y=torch.stack([tokens[i+1:i+33] for i in starts]);_,loss=model(x,y);optimizer.zero_grad();loss.backward();optimizer.step()
 if step%3==0:losses.append([step,float(loss.detach())])
assert losses[-1][1]<losses[0][1]*.5
model.eval()
with torch.no_grad():generated=model.generate(torch.tensor([[mapping['r']]]),max_new_tokens=100,temperature=.6,top_k=5)[0].tolist()
(out/'nanogpt.json').write_text(json.dumps({'loss':losses,'generated':''.join(alphabet[i] for i in generated),'parameters':sum(p.numel() for p in model.parameters()),'corpus':corpus[:80],'steps':181,'seed':17,'source_revision':"3adf61e154c3fe3fca428ad6bc3818b27a3b8291"},indent=2));print('nanoGPT',losses[0],losses[-1],flush=True)

```

## Verify

The script checks the numerical result before saving it. The gallery reads saved data and does not retrain or rerun inference when changing controls.
