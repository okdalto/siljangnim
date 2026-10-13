---
id: mujoco.gallery
version: 1
title: Double pendulum dynamics
capability: mujoco prepared geometry simulation
tier: C
kind: python
packages:
- mujoco==3.14.0
- numpy==2.2.6
source:
  name: "MuJoCo"
  repo: https://github.com/google-deepmind/mujoco
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

# Double pendulum dynamics

MuJoCo integrates a two-link pendulum with damping. Time selects a locally simulated frame, not a new browser simulation.

MuJoCo로 감쇠가 있는 이중 진자를 직접 적분했어요. Time으로 미리 계산한 프레임을 살펴보세요.

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
import mujoco
xml='<mujoco><option timestep="0.002" gravity="0 0 -9.81"/><worldbody><body pos="0 0 0"><joint name="a" type="hinge" axis="0 1 0" damping="0.04"/><geom type="capsule" fromto="0 0 0 0 0 -0.7" size="0.035"/><body pos="0 0 -0.7"><joint name="b" type="hinge" axis="0 1 0" damping="0.04"/><geom type="capsule" fromto="0 0 0 0 0 -0.7" size="0.035"/><site name="tip" pos="0 0 -0.7"/></body></body></worldbody></mujoco>'
m=mujoco.MjModel.from_xml_string(xml);d=mujoco.MjData(m);d.qpos[:]=[1.8,-.6];mujoco.mj_forward(m,d);frames=[];trail=[]
for step in range(2401):
 if step%20==0:
  a=[0,.7];b=[float(d.xpos[2,0]),float(d.xpos[2,2])+.7];c=[float(d.site_xpos[0,0]),float(d.site_xpos[0,2])+.7]
  assert abs(np.linalg.norm(np.array(b)-a)-.7)<1e-6 and abs(np.linalg.norm(np.array(c)-b)-.7)<1e-6
  trail.append(c);frames.append({'paths':[{'points':trail.copy(),'color':'#ad9bff66'},{'points':[a,b,c],'color':'#57d8c6'}],'points':[a,b,c]})
 mujoco.mj_step(m,d)
assert np.isfinite(d.qpos).all();save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
