---
id: draco.gallery
version: 1
title: Quantized mesh compression
capability: draco prepared geometry simulation
tier: C
kind: python
packages:
- DracoPy==2.1.0
- numpy==2.2.6
source:
  name: "Draco"
  repo: https://github.com/google/draco
  license: "Apache-2.0"
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

# Quantized mesh compression

Draco encodes and decodes a synthetic wavy grid at three quantization levels. Vertex reordering is checked with nearest-neighbor distances.

Draco로 물결 격자 메시를 세 양자화 수준에서 압축·복원했어요. 정점 재정렬을 고려해 최근접 거리로 오차를 확인했어요.

## Setup

Install the pinned packages above. No API key or model weights are required.

## Run

Writes the prepared data to out/result.json. The scene controls select or rotate stored results; they do not rerun this computation.

```python
import json,numpy as np
from pathlib import Path
Path('out').mkdir(exist_ok=True)
def save(frames):
 assert frames
 Path('out/result.json').write_text(json.dumps({'frames':frames},allow_nan=False,separators=(',',':')))
import DracoPy
from scipy.spatial import cKDTree
n=18;v=np.array([[x/(n-1)*1.6-.8,.25*np.sin(x*.6)*np.cos(z*.4),z/(n-1)*1.6-.8] for z in range(n) for x in range(n)],dtype=np.float64);f=np.array([[i,i+1,i+n] for i in range(n*n-n) if i%n<n-1]+[[i+1,i+n+1,i+n] for i in range(n*n-n) if i%n<n-1],dtype=np.uint32);frames=[]
for bits in [5,8,12]:
 encoded=DracoPy.encode(v,f,quantization_bits=bits,compression_level=7);decoded=DracoPy.decode(encoded);error=cKDTree(v).query(decoded.points)[0].max();assert error<1.6*2**(-bits)*2 and len(decoded.faces)==len(f)
 frames.append({'mesh':{'vertices':decoded.points.tolist(),'faces':decoded.faces.tolist()},'bytes':len(encoded),'max_error':float(error)})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
