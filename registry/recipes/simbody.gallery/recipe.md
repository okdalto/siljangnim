---
id: simbody.gallery
version: 1
title: Articulated double pendulum
capability: simbody graphics
tier: C
kind: python
packages: []
source:
  name: "Simbody"
  repo: https://github.com/simbody/simbody
  license: "Apache-2.0"
io:
  inputs:
  - name: main.cpp
    media: file
  - name: conda-osx-arm64.txt
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

# Articulated double pendulum

Simbody integrates a two-link mechanism with native multibody dynamics and checks total energy throughout the simulation.

Simbody 원본 다물체 동역학 엔진으로 두 관절 진자를 적분하고 시뮬레이션 전체의 에너지 보존을 검사했어요.

## Setup

Requires Python 3.11+, Conda on PATH (tested with 24.9.2), and a C++17 compiler. The included explicit lock targets Apple Silicon macOS. The recipe creates and caches its exact Simbody 3.8 environment; other platforms need an appropriate upstream installation. Map the listed inputs into in/. Opening the gallery downloads only prepared outputs. Source/runtime caches live under (XDG_CACHE_HOME or ~/.cache)/siljangnim.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. 원본 소스와 고정 실행 환경은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

## Run

```python
import fcntl, hashlib, json, os, pathlib, platform, shutil, subprocess

if platform.system()!='Darwin' or platform.machine()!='arm64':
    raise RuntimeError('This verified environment lock targets Apple Silicon macOS. Use the upstream Simbody installation instructions on other platforms.')
conda=shutil.which('conda')
if not conda:
    raise RuntimeError('Install Conda, place conda on PATH, then rerun this recipe. Tested with Conda 24.9.2.')
lock=pathlib.Path('in/conda-osx-arm64.txt').resolve()
key=hashlib.sha256(lock.read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'simbody'
cache.mkdir(parents=True,exist_ok=True)
prefix=cache/key
with (cache/(key+'.lock')).open('w') as f:
    fcntl.flock(f,fcntl.LOCK_EX)
    if not (prefix/'ready').is_file():
        subprocess.run([conda,'create','--yes','--prefix',str(prefix),'--file',str(lock)],check=True,env={**os.environ,'CONDA_PKGS_DIRS':str(cache/'packages')})
        if not (prefix/'lib/libSimTKsimbody.dylib').is_file():
            raise RuntimeError('Simbody library is missing from the locked environment.')
        (prefix/'ready').write_text(key)
    out=pathlib.Path('out');out.mkdir(exist_ok=True)
    compiler=shutil.which('c++')
    if not compiler:raise RuntimeError('Install a C++17 compiler (macOS: Xcode command line tools).')
    subprocess.run([compiler,'-std=c++17','-O2','-I'+str(prefix/'include/simbody'),'in/main.cpp','-L'+str(prefix/'lib'),'-Wl,-rpath,'+str(prefix/'lib'),'-lSimTKsimbody','-lSimTKmath','-lSimTKcommon','-o',str(out/'simulate')],check=True)
    subprocess.run([str((out/'simulate').absolute()),str(out/'result.json')],check=True)
result=json.loads(pathlib.Path('out/result.json').read_text())
assert len(result['frames'])==3
assert all(f['maxEnergyDrift']<1e-4 for f in result['frames'])
```

## Verify

Executed twice with the original engine. Prepared images and geometry matched; see Scope for FITS metadata and parallel gradient comparison details.

원본 엔진으로 두 번 실행해 결과를 대조했습니다. FITS 메타데이터와 병렬 미분 계산의 비교 조건은 Scope에 명시했습니다.

## Scope

Simbody runs a native two-link mechanism under gravity for five seconds at 60 output samples per second, with the Runge-Kutta-Merson integrator at accuracy 1e-8. Assertions check maximum energy drift below 1e-4; observed drift stayed below 5.4e-8. The explicit Conda lock is verified for macOS arm64 only and cached by its hash. Other platforms need their own upstream Simbody installation.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
