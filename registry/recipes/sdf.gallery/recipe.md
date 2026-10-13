---
id: sdf.gallery
version: 1
title: Rounded joins between distance fields
capability: sdf simulation science
tier: C
kind: python
packages:
- numpy==2.2.6
- scipy==1.18.1
- scikit-image==0.25.2
- meshio==5.3.5
- matplotlib==3.11.2
- Pillow==11.3.0
source:
  name: "sdf"
  repo: https://github.com/fogleman/sdf
  license: "MIT"
io:
  inputs:
  - name: SOURCE.json
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

# Rounded joins between distance fields

Fogleman’s sdf library meshes an original sphere-and-torus union at three smoothing strengths. Rotate the locally extracted surfaces.

Fogleman의 sdf로 구와 토러스 합집합을 세 매끄러움 강도에서 메시로 만들었어요. 직접 추출한 표면을 회전해 보세요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU or API key is required. The sdf recipe downloads and SHA-256 verifies its pinned source archive only when rerun, then reuses the source cache. The PythonRobotics example includes the original MIT-licensed A* planner in a_star.py. 

## Run

```python
import hashlib,json,os,pathlib,sys,tarfile,tempfile,urllib.request
import numpy as np
config=json.loads(pathlib.Path('in/SOURCE.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'sources';cache.mkdir(parents=True,exist_ok=True)
archive=cache/(config['sha256']+'.tar.gz')
if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
 with urllib.request.urlopen(config['url'],timeout=120)as response:data=response.read()
 if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Source checksum mismatch')
 with tempfile.NamedTemporaryFile(dir=cache,delete=False)as file:file.write(data);pending=pathlib.Path(file.name)
 pending.replace(archive)
out=pathlib.Path('out');out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='siljangnim-sdf-')as temporary:
 with tarfile.open(archive)as file:file.extractall(temporary,filter='data')
 sys.path.insert(0,str(next(pathlib.Path(temporary).iterdir())))
 from sdf import sphere,torus
 frames=[]
 a=sphere(.55).translate([-.35,0,0]);b=torus(.55,.16).rotate(np.pi/2,[1,0,0]).translate([.25,0,0])
 for amount in [0,.15,.35]:
  shape=a.union(b,k=amount);triangles=np.asarray(shape.generate(step=.10,bounds=((-1,-1,-1),(1,1,1)),workers=2,verbose=False));assert triangles.shape[1]==3 and len(triangles)>100 and np.all(np.isfinite(triangles))
  vertices,indices=np.unique(np.round(triangles,6),axis=0,return_inverse=True);frames.append({'mesh':{'vertices':(vertices*.8).tolist(),'faces':indices.reshape(-1,3).tolist()}})
 result={'frames':frames}
 
 (out/'result.json').write_text(json.dumps(result,allow_nan=False))
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

Original synthetic input. 
