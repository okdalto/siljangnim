---
id: repulsive-curves.gallery
version: 1
title: Relaxing a repulsive trefoil curve
capability: repulsive-curves graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "Repulsive Curves"
  repo: https://github.com/ythea/repulsive-curves
  license: "MIT"
io:
  inputs:
  - name: driver.cpp
    media: file
  - name: render.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Relaxing a repulsive trefoil curve

Original Repulsive Curves energy and analytic gradients relax a 64-vertex trefoil while preserving its length.

원본 Repulsive Curves의 에너지와 해석적 기울기로 64개 꼭짓점의 매듭을 길이 변화 없이 다듬어요.

## Setup

Requires Apple Command Line Tools (clang++) and Python with Pillow. Pinned original C++ source and geometry-central, libgmultigrid and Eigen dependencies (about 7 MB compressed) are SHA-256 verified on demand. The compiled engine is cached by source manifest and driver content.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Apple Command Line Tools가 필요합니다. 원본 C++ 소스와 의존성 약 7MB를 받아 체크섬을 확인하고 컴파일 결과를 캐시합니다. 원본 에너지·기울기 계산에 자체 반복 최적화 입력을 연결한 예제로, 원본 GUI나 전체 Sobolev 해법을 실행한 것은 아닙니다. 에너지는 99.7699에서 78.3135로 감소했으며 길이는 유지됩니다. 기울기 아홉 성분도 유한차분으로 확인했습니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,subprocess,sys,tarfile,tempfile,urllib.request,shutil
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256(b'curves-core-v1'+(inputs/'sources.json').read_bytes()+(inputs/'driver.cpp').read_bytes()).hexdigest()
cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/repulsive-curves';cache.mkdir(parents=True,exist_ok=True);root=cache/key;exe=root/'curves-driver'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  root.mkdir(exist_ok=True);roots={}
  for item in sources:
   archive=cache/(item['sha256']+'.tar.gz')
   if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=180) as r:data=r.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Curve engine source checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=Path(f.name)
    pending.replace(archive)
   dest=root/item['name'];dest.mkdir(exist_ok=True)
   with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
   roots[item['name']]=next(dest.iterdir())
  src=roots['curves'];compiler=shutil.which('clang++')
  if not compiler:raise RuntimeError('Install Apple Command Line Tools to compile the original C++ curve engine.')
  args=[compiler,'-std=c++17','-O2','-Wno-deprecated-declarations','-ffunction-sections','-fdata-sections','-Wl,-dead_strip','-I'+str(src/'include'),'-I'+str(roots['geometry']/'include'),'-I'+str(roots['multigrid']/'include'),'-I'+str(roots['eigen']),str(inputs/'driver.cpp')]+[str(src/'src'/f) for f in ['tpe_energy_sc.cpp','poly_curve_network.cpp','vert_jacobian.cpp','utils.cpp','implicit_surface.cpp']]+['-o',str(exe)]
  subprocess.run(args,check=True,timeout=600);(root/'.ready').touch()
 subprocess.run([str(exe),str(out/'result.json')],check=True,timeout=180)
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'render.py')],check=True)
 result=json.loads((out/'result.json').read_text());frames=result['frames'];assert len(frames)==3 and frames[-1]['energy']<frames[0]['energy']*.9 and result['gradientCheckMaxRelativeError']<1e-5
 assert max(abs(f['length']-frames[0]['length']) for f in frames)<1e-8
 print('PASS original curve energy, analytic gradient, finite differences and fixed-length relaxation')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

Original TPESC energy and analytic gradient code runs unchanged. A supplied backtracking gradient-descent driver centers and normalizes a 64-vertex trefoil to fixed length after each step. Energy falls from 99.7699 to 78.3135 over 100 iterations, with length 29.18018 preserved. Nine gradient coordinates were checked against central finite differences: maximum relative error 2.58e-8. This is the original energy/gradient core with our optimization driver, not the full upstream GUI or Sobolev solver. Pillow projects the native curve coordinates.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
