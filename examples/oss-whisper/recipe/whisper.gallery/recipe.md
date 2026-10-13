---
id: whisper.gallery
version: 1
title: Word timing (Whisper)
capability: audio speech transcription word timestamps
tier: C
kind: python
packages:
- numpy==1.26.4
- openai-whisper==20250625
- scipy==1.14.1
- torch==2.7.1
source:
  name: Whisper
  repo: https://github.com/openai/whisper
  license: MIT
io:
  inputs:
  - name: voice.wav
  outputs:
  - name: transcript.json
    media: file
verify:
  params: {}
  expect_outputs:
  - transcript.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Word timing (Whisper)

## Setup

Install the pinned packages. The first run downloads public model weights into ~/.cache/siljangnim-models; no API key is required. CPU execution is supported.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json
from pathlib import Path
import numpy as np,torch,whisper
from scipy.io import wavfile
torch.set_num_threads(4)
sr,wav=wavfile.read('in/voice.wav');assert sr==16000
model=whisper.load_model('tiny.en',device='cpu',download_root=str(Path.home()/'.cache/siljangnim-models/whisper'))
result=model.transcribe(wav.astype(np.float32)/32768,language='en',fp16=False,word_timestamps=True,temperature=0)
words=[{'word':w['word'].strip(),'start':w['start'],'end':w['end']} for s in result['segments'] for w in s.get('words',[])]
assert words
json.dump({'text':result['text'],'words':words,'duration':len(wav)/sr,'model':'tiny.en'},open('out/transcript.json','w'))
print(result['text'])
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

The bundled result was produced by real model inference. It is a fixed example, not live inference in the browser. The recipe reruns inference on the bundled input. Model weights are not bundled.
