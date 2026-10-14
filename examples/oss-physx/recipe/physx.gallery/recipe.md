---
id: physx.gallery
version: 1
title: A falling stack of 36 rigid boxes
capability: physx graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "PhysX"
  repo: https://github.com/nvidia-omniverse/physx
  license: "BSD-3-Clause"
io:
  inputs:
  - name: capture.html
    media: file
  - name: driver.mjs
    media: file
  - name: render.py
    media: file
  - name: runner.cjs
    media: file
  - name: source.json
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

# A falling stack of 36 rigid boxes

Original PhysX 5.11.0 CPU physics simulates 36 falling boxes, with native poses captured at 0, 1 and 4 seconds.

원본 PhysX 5.11.0으로 상자 36개의 낙하와 충돌을 계산하고 0·1·4초의 실제 위치를 비교해요.

## Setup

Requires Python with Pillow and an Electron executable (verified with 44.4.4). Set ELECTRON to its executable path. Original physx-js-webidl 2.8.0 is downloaded on demand (2 MB), SHA-256 verified and cached. Its unchanged PhysX 5.11.0 CPU WASM runs in an isolated browser window. No NVIDIA GPU is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Electron 실행 파일 경로를 ELECTRON으로 지정하세요. 약 2MB의 원본 WASM 패키지를 최초 실행 때만 받고 캐시합니다. NVIDIA GPU 없이 CPU 강체 물리를 실행하며, 갤러리는 480단계의 실제 계산에서 가져온 세 시점을 보여줍니다. 물리 조건 변경은 레시피 재실행이 필요합니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,subprocess,sys,tarfile,tempfile,urllib.request,shutil
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);source=json.loads((inputs/'source.json').read_text());cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/physx';cache.mkdir(parents=True,exist_ok=True);root=cache/source['sha256']
with (cache/(source['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  with urllib.request.urlopen(source['url'],timeout=180) as r:data=r.read()
  if hashlib.sha256(data).hexdigest()!=source['sha256']:raise RuntimeError('Original PhysX WASM package checksum mismatch')
  root.mkdir(exist_ok=True)
  with tempfile.TemporaryFile() as f:
   f.write(data);f.seek(0)
   with tarfile.open(fileobj=f) as tar:tar.extractall(root,filter='data')
  (root/'.ready').touch()
 electron=os.environ.get('ELECTRON') or shutil.which('electron')
 if not electron:raise RuntimeError('Set ELECTRON to an Electron executable; verified with Electron 44.4.4.')
 with tempfile.TemporaryDirectory(prefix='physx-profile-') as profile:
  subprocess.run([electron,str(inputs/'runner.cjs'),str(root/'package'),str(inputs),str(out)],env={**os.environ,'PHYSX_PROFILE':profile},check=True,timeout=180)
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'render.py')],check=True)
 result=json.loads((out/'result.json').read_text());frames=result['frames'];assert result['engine']=='NVIDIA PhysX 5.11.0' and len(frames)==3 and all(len(f['bodies'])==36 for f in frames)
 assert frames[-1]['meanHeight']<frames[0]['meanHeight']
 print('PASS original PhysX CPU rigid-body simulation and cached WASM engine')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied scene uses native gravity, friction, restitution, mass and inertia for 36 boxes over 480 fixed 1/120-second steps. The original engine supplies positions, orientations and velocities; the supplied Pillow renderer projects these results. This demonstrates CPU rigid-body physics, not CUDA or the complete PhysX SDK. The gallery selects three previously calculated states; changing physics requires rerunning the recipe.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
