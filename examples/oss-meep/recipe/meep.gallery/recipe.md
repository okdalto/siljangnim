---
id: meep.gallery
version: 1
title: Waves passing through a dielectric slit
capability: meep render native
tier: C
kind: python
packages: []
source:
  name: "Meep"
  repo: https://github.com/NanoComp/meep
  license: "GPL-2.0-or-later"
io:
  inputs:
  - name: main.py
    media: file
  - name: conda-osx-arm64.txt
    media: file
  outputs:
  - name: result.json
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Waves passing through a dielectric slit

Meep 1.34.0 directly computes a 2D electric field for three dielectric slit widths using finite-difference time-domain simulation on CPU.

Meep 1.34.0으로 세 유전체 슬릿 폭의 2차원 전기장을 CPU 유한차분 시간영역 시뮬레이션으로 직접 계산했어요.

## Setup

Requires Python 3.11.15 or newer and Conda on PATH (tested with 24.9.2) and Apple Silicon macOS. Map main.py, conda-osx-arm64.txt into in/. The exact Conda package URLs and SHA-256 hashes are in conda-osx-arm64.txt. The wrapper creates an isolated environment under (XDG_CACHE_HOME or ~/.cache)/siljangnim/meep only on first execution, then reruns the simulation in that cached environment. This lock is verified only on Apple Silicon macOS.

원본 도구를 직접 실행하는 레시피예요. 필요한 실행 프로그램을 PATH에 두고 입력 파일을 연결하세요. 첫 실행에만 검증된 소스 또는 실행 환경을 내려받아 캐시하며, 계산은 매번 실행해요. 예제를 열 때는 준비된 결과만 받아요.

## Run

```python
import fcntl, hashlib, json, os, pathlib, platform, shutil, subprocess

if platform.system()!='Darwin' or platform.machine()!='arm64':
    raise RuntimeError('This verified environment lock targets Apple Silicon macOS. Use the upstream Meep installation instructions on other platforms.')
conda=shutil.which('conda')
if not conda:
    raise RuntimeError('Install Conda, place conda on PATH, then rerun this recipe. Tested with Conda 24.9.2.')
lock=pathlib.Path('in/conda-osx-arm64.txt').resolve()
key=hashlib.sha256(lock.read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'meep'
cache.mkdir(parents=True,exist_ok=True)
prefix=cache/key
with (cache/(key+'.lock')).open('w') as f:
    fcntl.flock(f,fcntl.LOCK_EX)
    if not (prefix/'ready').is_file():
        subprocess.run([conda,'create','--yes','--prefix',str(prefix),'--file',str(lock)],check=True,env={**os.environ,'CONDA_PKGS_DIRS':str(cache/'packages')})
        subprocess.run([str(prefix/'bin/python'),'-c','import meep; assert meep.__version__ == "1.34.0"'],check=True,env={**os.environ,'MPLCONFIGDIR':str(cache/'matplotlib')})
        (prefix/'ready').write_text(key)
    subprocess.run([str(prefix/'bin/python'),'in/main.py','out'],check=True,env={**os.environ,'MPLCONFIGDIR':str(cache/'matplotlib')})
result=json.loads(pathlib.Path('out/result.json').read_text())
assert len(result['frames'])==3 and result['engine']=='1.34.0'
assert all(pathlib.Path(f'out/render-{i}.png').is_file() for i in range(3))
```

## Verify

Executed with a fresh cache and again using the cached dependencies. Output files matched byte for byte. Nonzero engine exits or failed numerical checks fail the recipe.

## Notes

Field colors are normalized separately for each result; gray marks dielectric material. This is a small illustrative 2D simulation, not a calibrated experiment. Viewing controls select stored results; they do not rerun the computation.
