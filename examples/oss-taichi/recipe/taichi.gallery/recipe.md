---
id: taichi.gallery
version: 1
title: A diffusing grid
capability: taichi prepared geometry simulation
tier: C
kind: python
packages:
- taichi==1.7.4
- numpy==2.2.6
source:
  name: "Taichi"
  repo: https://github.com/taichi-dev/taichi
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

# A diffusing grid

Taichi CPU kernels evolve a discrete heat field. Stored snapshots show diffusion while retaining total heat.

Taichi CPU 커널로 이산 열장을 직접 계산했어요. 총 열량을 보존하며 퍼지는 모습을 준비된 프레임으로 살펴보세요.

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
import taichi as ti
ti.init(arch=ti.cpu,cpu_max_num_threads=2)
n=40;a=ti.field(ti.f32,shape=(n,n));b=ti.field(ti.f32,shape=(n,n))
@ti.kernel
def advance():
 for i,j in a:
  b[i,j]=a[i,j]+.2*(a[(i+1)%n,j]+a[(i-1+n)%n,j]+a[i,(j+1)%n]+a[i,(j-1+n)%n]-4*a[i,j])
 for i,j in a:a[i,j]=b[i,j]
x,y=np.mgrid[:n,:n];initial=np.exp(-((x-15)**2+(y-20)**2)/12)+.7*np.exp(-((x-28)**2+(y-12)**2)/10);a.from_numpy(initial.astype(np.float32));total=initial.sum();frames=[]
for step in range(161):
 if step%16==0:
  v=a.to_numpy();assert abs(float(v.sum())-total)<.001
  frames.append({'points':np.column_stack(((x.ravel()-19.5)/23,(y.ravel()-19.5)/23)).tolist(),'values':(v.ravel()*2-1).tolist(),'radius':.023})
 advance()
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
