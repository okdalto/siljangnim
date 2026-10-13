---
id: astra-toolbox.gallery
version: 1
title: Iterative reconstruction from projections
capability: astra-toolbox graphics
tier: C
kind: python
packages: []
source:
  name: "ASTRA Toolbox"
  repo: https://github.com/astra-toolbox/astra-toolbox
  license: "GPL-3.0"
io:
  inputs:
  - name: conda-osx-arm64.txt
    media: file
  - name: main.py
    media: file
  outputs:
  - name: phantom.npy
    media: file
  - name: reconstruction-0.npy
    media: file
  - name: reconstruction-1.npy
    media: file
  - name: reconstruction-2.npy
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
  - name: sinogram.npy
    media: file
verify:
  params: {}
  expect_outputs: ["phantom.npy", "reconstruction-0.npy", "reconstruction-1.npy", "reconstruction-2.npy", "render-0.png", "render-1.png", "render-2.png", "result.json", "sinogram.npy"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Iterative reconstruction from projections

ASTRA 2.5.0 computes projections and CPU SIRT reconstruction of an original phantom; 5, 25 and 100 iterations reduce error.

ASTRA 2.5.0 원본 CPU 알고리즘으로 직접 만든 팬텀을 투영·재구성하고 5·25·100회 반복에 따른 오차 감소를 확인했어요.

## Setup

This exact Conda lock targets Apple Silicon macOS. Install Conda and place conda on PATH. The recipe creates and caches an isolated, version-locked ASTRA 2.5.0 environment with CPU-only 2D support; no CUDA GPU is needed. The native environment is roughly 300 MB installed and is only created on recipe rerun.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl, hashlib, json, os, pathlib, platform, shutil, subprocess

if platform.system()!='Darwin' or platform.machine()!='arm64':
    raise RuntimeError('This verified environment lock targets Apple Silicon macOS. Use the upstream ASTRA installation instructions on other platforms.')
conda=shutil.which('conda')
if not conda:
    raise RuntimeError('Install Conda, place conda on PATH, then rerun this recipe. Tested with Conda 24.9.2.')
lock=pathlib.Path('in/conda-osx-arm64.txt').resolve()
key=hashlib.sha256(lock.read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'astra-toolbox'
cache.mkdir(parents=True,exist_ok=True)
prefix=cache/key
with (cache/(key+'.lock')).open('w') as f:
    fcntl.flock(f,fcntl.LOCK_EX)
    if not (prefix/'ready').is_file():
        subprocess.run([conda,'create','--yes','--prefix',str(prefix),'--file',str(lock)],check=True,env={**os.environ,'CONDA_PKGS_DIRS':os.environ.get('CONDA_PKGS_DIRS',str(cache/'packages'))})
        subprocess.run([str(prefix/'bin/python'),'-c','import astra; assert astra.__version__ == "2.5.0"'],check=True,env={**os.environ,'MPLCONFIGDIR':str(cache/'matplotlib')})
        (prefix/'ready').write_text(key)
    subprocess.run([str(prefix/'bin/python'),'in/main.py','out'],check=True,env={**os.environ,'MPLCONFIGDIR':str(cache/'matplotlib')})
result=json.loads(pathlib.Path('out/result.json').read_text())
assert len(result['frames'])==3 and all(f['engine']=='2.5.0' for f in result['frames'])
assert all(pathlib.Path(f'out/render-{i}.png').is_file() for i in range(3))
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

An original 96 by 96 three-region phantom is projected at 90 parallel-beam angles using the native linear projector. Original CPU SIRT runs cumulatively for 5, 25 and 100 iterations. Native projection and reconstruction arrays must be finite; RMSE must decrease and finish below 0.06 (observed about 0.03677). NPY arrays preserve the actual phantom, sinogram and reconstructions; PNGs visualize native reconstruction values. This is a numerical demonstration, not clinical analysis.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
