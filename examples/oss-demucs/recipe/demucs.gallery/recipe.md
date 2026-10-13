---
id: demucs.gallery
version: 1
title: Instrument stems (Demucs)
capability: audio separation stems music
tier: C
kind: python
packages:
- demucs==4.0.1
- numpy==1.26.4
- scipy==1.14.1
- torch==2.5.1
- torchaudio==2.5.1
source:
  name: Demucs
  repo: https://github.com/facebookresearch/demucs
  license: MIT
io:
  inputs:
  - name: mix.wav
  outputs:
  - name: drums.wav
    media: file
  - name: bass.wav
    media: file
  - name: other.wav
    media: file
  - name: vocals.wav
    media: file
  - name: stems.json
    media: file
verify:
  params: {}
  expect_outputs:
  - drums.wav
  - bass.wav
  - other.wav
  - vocals.wav
  - stems.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Instrument stems (Demucs)

## Setup

Install the pinned packages. The first run downloads public model weights into ~/.cache/siljangnim-models; no API key is required. CPU execution is supported.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json
from pathlib import Path
import torch,numpy as np
from scipy.io import wavfile
from demucs.pretrained import get_model
from demucs.apply import apply_model
torch.set_num_threads(4);torch.hub.set_dir(str(Path.home()/'.cache/siljangnim-models/torch'))
model=get_model('htdemucs').eval();sr,data=wavfile.read('in/mix.wav');assert sr==model.samplerate
wav=torch.tensor(data.astype(np.float32).T/32768);ref=wav.mean(0);mean=ref.mean();std=ref.std()
with torch.inference_mode():out=apply_model(model,((wav-mean)/std)[None],device='cpu',shifts=0,split=True,overlap=.25,progress=False)[0]*std+mean
stems=[]
for name,a in zip(model.sources,out):
 signal=a.numpy().T;wavfile.write('out/'+name+'.wav',sr,np.int16(np.clip(signal,-1,1)*32767))
 mono=np.mean(signal,axis=1);bins=np.array_split(mono,240);stems.append({'name':name,'rms':[round(float(np.sqrt(np.mean(x*x))),6) for x in bins]})
assert all(np.isfinite(a.numpy()).all() for a in out)
json.dump({'duration':len(data)/sr,'stems':stems,'model':'htdemucs','note':'Synthetic instrumental input; the vocals stem may be nearly silent.'},open('out/stems.json','w'))
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

The bundled result was produced by real model inference. It is a fixed example, not live inference in the browser. The recipe reruns inference on the bundled input. Model weights are not bundled.
