---
id: eclipse-sumo.gallery
version: 1
title: A stopping car and its followers
capability: eclipse-sumo simulation science
tier: C
kind: python
packages:
- eclipse-sumo==1.27.1
- sumo-data==1.27.1
- numpy==2.2.6
source:
  name: "Eclipse SUMO"
  repo: https://github.com/eclipse-sumo/sumo
  license: "EPL-2.0 / GPL-2.0-or-later"
io:
  inputs: []
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

# A stopping car and its followers

Eclipse SUMO simulates eight cars on an original straight road with a scheduled stop. Space–time traces show the computed car-following response.

Eclipse SUMO로 직접 만든 직선 도로의 차량 8대와 선두 차량의 정차를 시뮬레이션했어요. 시공간 궤적으로 추종 반응을 살펴보세요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU, API key or observation download is required. The eclipse-sumo package supplies the native netconvert and sumo programs; this recipe executes them in a temporary directory.

## Run

```python
import pathlib,json,numpy as np
out=pathlib.Path('out');out.mkdir(exist_ok=True)

import subprocess, tempfile, xml.etree.ElementTree as ET
from sumo import SUMO_HOME
with tempfile.TemporaryDirectory(prefix='siljangnim-sumo-') as temp:
 work=pathlib.Path(temp);bins=pathlib.Path(SUMO_HOME)/'bin'
 (work/'nodes.xml').write_text('<nodes><node id="a" x="0" y="0"/><node id="b" x="400" y="0"/></nodes>')
 (work/'edges.xml').write_text('<edges><edge id="road" from="a" to="b" numLanes="1" speed="15"/></edges>')
 subprocess.run([str(bins/'netconvert'),'--node-files',str(work/'nodes.xml'),'--edge-files',str(work/'edges.xml'),'--output-file',str(work/'net.xml')],check=True,capture_output=True,text=True)
 vehicles=''.join(f'<vehicle id="car{i}" type="car" route="route" depart="{i*1.5}">{"<stop lane=\"road_0\" endPos=\"220\" duration=\"5\"/>" if i==0 else ""}</vehicle>'for i in range(8))
 (work/'routes.xml').write_text('<routes><vType id="car" accel="1.5" decel="4.5" sigma="0" length="5" minGap="2.5" maxSpeed="15"/><route id="route" edges="road"/>'+vehicles+'</routes>')
 subprocess.run([str(bins/'sumo'),'-n',str(work/'net.xml'),'-r',str(work/'routes.xml'),'--step-length','.5','--end','60','--seed','9','--no-step-log','true','--fcd-output',str(work/'fcd.xml')],check=True,capture_output=True,text=True)
 traces={f'car{i}':[]for i in range(8)}
 for step in ET.parse(work/'fcd.xml').getroot():
  time=float(step.attrib['time']);positions=[]
  for car in step:
   x=float(car.attrib['x']);speed=float(car.attrib['speed']);assert speed>=0;traces[car.attrib['id']].append([time,x,speed]);positions.append(x)
  positions.sort();assert all(b-a>=7.4 for a,b in zip(positions,positions[1:]))
 assert all(len(v)>20 for v in traces.values());assert any(t>10 and v<.01 for t,x,v in traces['car0'])
 colors=['#57d8c6','#ffbc78','#ad9bff','#fa7f9c'];frames=[]
 for limit in [15,30,60]:frames.append({'paths':[{'points':[[t/60*1.7-.85,x/400*1.6-.8]for t,x,v in line if t<=limit],'color':colors[i%4]}for i,line in enumerate(traces.values())]})
 result={'frames':frames,'traces_seconds_meters_mps':traces}

(out/'result.json').write_text(json.dumps(result,allow_nan=False))
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

Original synthetic input. 
