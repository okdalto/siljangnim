---
id: librosa.beat-track
version: 1
title: Beats, tempo and onset envelope (librosa)
capability: audio-analyze beat tempo onset envelope json
tier: C
kind: python
packages:
- librosa==0.11.0
source:
  name: librosa
  repo: https://github.com/librosa/librosa
  license: ISC
io:
  inputs:
  - name: any audio file
    media: audio
  outputs:
  - name: beats.json
    media: json
verify:
  params:
    envelope_fps: 30
  expect_outputs:
  - beats.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-11'
    version: 1
status: verified
origin: local
updated: '2026-10-11'
---

# Beats, tempo and onset envelope (librosa)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import glob, json, os
import numpy as np, librosa
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
files = [f for f in sorted(glob.glob('in/*')) if not f.endswith('params.json')]
src = os.path.join('in', P['input']) if P.get('input') else files[0]
y, sr = librosa.load(src, sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
onset = librosa.onset.onset_strength(y=y, sr=sr)
times = librosa.times_like(onset, sr=sr)
fps = int(P.get('envelope_fps', 60))
grid = np.arange(0, len(y) / sr, 1 / fps)
env = np.interp(grid, times, onset)
env = env / (env.max() or 1)
out = {"tempo": float(np.atleast_1d(tempo)[0]), "beats": [round(float(b), 4) for b in beats], "duration": round(len(y) / sr, 4),
       "envelope_fps": fps, "envelope": [round(float(v), 4) for v in env]}
json.dump(out, open('out/beats.json', 'w'))
print(f"tempo {out['tempo']:.1f} BPM, {len(out['beats'])} beats, {len(env)} envelope samples")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: input (file name in in/, default the first audio file), envelope_fps. beats.json: tempo (BPM), beats (seconds), duration, envelope (onset strength 0..1 sampled at envelope_fps). A scene syncs to it with the audio element's currentTime.
