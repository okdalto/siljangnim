---
id: specfem2d.gallery
version: 1
title: Elastic waves in a half-space
capability: specfem2d graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "SPECFEM2D"
  repo: https://github.com/SPECFEM/specfem2d
  license: "GPL-3.0"
io:
  inputs:
  - name: Par_file
    media: file
  - name: SOURCE
    media: file
  - name: interfaces_elastic_analytic.dat
    media: file
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: AA.S0001.BXX.semd
    media: file
  - name: AA.S0001.BXZ.semd
    media: file
  - name: energy.dat
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
  - name: wavefield-0.jpg
    media: file
  - name: wavefield-1.jpg
    media: file
  - name: wavefield-2.jpg
    media: file
verify:
  params: {}
  expect_outputs: ["AA.S0001.BXX.semd", "AA.S0001.BXZ.semd", "energy.dat", "render-0.png", "render-1.png", "render-2.png", "result.json", "wavefield-0.jpg", "wavefield-1.jpg", "wavefield-2.jpg"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Elastic waves in a half-space

SPECFEM2D runs a native spectral-element simulation and exports three wavefields, receiver traces and energy data.

SPECFEM2D 원본 스펙트럴 요소 솔버로 탄성파를 계산하고 세 시점의 파동장·수신 신호·에너지 데이터를 만들었어요.

## Setup

Requires Python 3.12+, gfortran, a C compiler and make (tested with gfortran 16.2.0). The pinned source download is about 200 MB. The recipe verifies its SHA-256, builds the original serial CPU mesher and solver, and caches the build. No MPI or CUDA runtime is needed. Allow several hundred MB for the source and build cache.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
fc=shutil.which('gfortran');cc=shutil.which('cc');make=shutil.which('make')
if not fc or not cc or not make:raise RuntimeError('Install gfortran, a C compiler and make. Tested with gfortran 16.2.0 on Apple Silicon.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'specfem2d';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(config['sha256'].encode()+platform.platform().encode()+subprocess.check_output([fc,'--version'])).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz')
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=180) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('SPECFEM2D source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  source=next(p for p in root.iterdir() if p.is_dir() and (p/'configure').is_file())
  env={**os.environ,'FC':fc,'CC':cc,'FCFLAGS':'-O2 -fallow-argument-mismatch'}
  subprocess.run(['./configure','--without-mpi'],cwd=source,env=env,check=True)
  subprocess.run([make,'-j4','default'],cwd=source,env=env,check=True)
  assert (source/'bin/xmeshfem2D').is_file() and (source/'bin/xspecfem2D').is_file()
  (root/'ready').write_text(config['sha256'])
 source=next(p for p in root.iterdir() if p.is_dir() and (p/'configure').is_file())
 subprocess.run([sys.executable,'in/main.py',str(source/'bin')],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The upstream semi-infinite homogeneous elastic example supplies the physical model. Supplied inputs set 1200 time steps at dt 0.0008, save wavefields every 400 steps and enable energy output. Original xmeshfem2D and xspecfem2D execute in a temporary job directory. Native JPEG wavefields are preserved and losslessly decoded into display PNGs; finite nonzero energy and receiver traces are checked and included. No wave equation or solver is reimplemented.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
