---
id: pythonrobotics.gallery
version: 1
title: Planning around obstacles
capability: pythonrobotics simulation science
tier: C
kind: python
packages:
- numpy==2.2.6
- matplotlib==3.11.2
source:
  name: "PythonRobotics"
  repo: https://github.com/AtsushiSakai/PythonRobotics
  license: "MIT"
io:
  inputs:
  - name: a_star.py
    media: file
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Planning around obstacles

PythonRobotics runs its original A* planner for three robot radii. Prepared routes are checked against the obstacle clearance used by the planner.

PythonRobotics의 원본 A* 계획기를 세 로봇 반지름으로 실행했어요. 계산한 경로가 계획기의 장애물 여유 거리를 지키는지 확인했어요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU or API key is required. The sdf recipe downloads and SHA-256 verifies its pinned source archive only when rerun, then reuses the source cache. The PythonRobotics example includes the original MIT-licensed A* planner in a_star.py. 

## Run

```python
import json,pathlib,numpy as np
out=pathlib.Path('out');out.mkdir(exist_ok=True)

import importlib.util
spec=importlib.util.spec_from_file_location('original_astar','in/a_star.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.show_animation=False
obstacles=[]
for t in np.arange(0,20.01,.5):obstacles.extend([[t,0],[t,20],[0,t],[20,t]])
for t in np.arange(0,14.01,.5):obstacles.append([t,10])
for t in np.arange(13,20.01,.5):obstacles.append([10,t])
obstacles=np.array(obstacles);frames=[]
for radius in [.4,.8,1.2]:
 planner=module.AStarPlanner(obstacles[:,0].tolist(),obstacles[:,1].tolist(),.5,radius);x,y=planner.planning(2,2,18,18);path=np.column_stack([x,y]);assert len(path)>10 and np.allclose(path[0],[18,18]) and np.allclose(path[-1],[2,2])
 clearance=np.linalg.norm(path[:,None,:]-obstacles[None,:,:],axis=-1).min();assert clearance>=radius-1e-8
 frames.append({'paths':[{'points':(path/20*1.7-.85).tolist(),'color':'#57d8c6'}],'points':(obstacles/20*1.7-.85).tolist(),'radius':.008})
result={'frames':frames}

(out/'result.json').write_text(json.dumps(result,allow_nan=False))
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

Original synthetic input. 
