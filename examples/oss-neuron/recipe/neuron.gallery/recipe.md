---
id: neuron.gallery
version: 1
title: A neuron responds to current
capability: neuron prepared geometry simulation
tier: C
kind: python
packages:
- neuron==9.0.2
- numpy==2.2.6
source:
  name: "NEURON"
  repo: https://github.com/neuronsimulator/nrn
  license: "BSD-3-Clause compatible"
io:
  inputs: []
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs:
  - result.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# A neuron responds to current

NEURON simulates a Hodgkin–Huxley membrane under three current pulses. The voltage traces are locally generated model outputs.

NEURON의 Hodgkin–Huxley 막 모델에 세 전류 펄스를 가해 전압을 직접 계산했어요.

## Setup

Install the pinned packages above. No API key or model weights are required.

## Run

Writes the prepared data to out/result.json. The scene controls select or rotate stored results; they do not rerun this computation.

```python
import json,numpy as np
from pathlib import Path
Path('out').mkdir(exist_ok=True)
def save(frames):
 assert len(frames)>0
 text=json.dumps({'frames':frames},allow_nan=False,separators=(',',':'))
 Path('out/result.json').write_text(text)
from neuron import h
h.load_file('stdrun.hoc');soma=h.Section(name='soma');soma.L=soma.diam=20;soma.insert('hh');stim=h.IClamp(soma(.5));stim.delay=5;stim.dur=10;frames=[];peaks=[]
for current in [.05,.15,.4]:
 stim.amp=current;t=h.Vector().record(h._ref_t);v=h.Vector().record(soma(.5)._ref_v);h.finitialize(-65);h.continuerun(30);ts=np.asarray(t);vs=np.asarray(v);peaks.append(float(vs.max()));assert len(vs)>100 and np.isfinite(vs).all()
 frames.append({'paths':[{'points':np.column_stack((ts/15-1,(vs+30)/80)).tolist(),'color':'#57d8c6'},{'points':[[-2/3,-.8],[-2/3,-.65],[0,-.65],[0,-.8]],'color':'#ffbc78'}]})
assert peaks[-1]>0;save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
