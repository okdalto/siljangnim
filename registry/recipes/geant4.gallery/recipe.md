---
id: geant4.gallery
version: 1
title: Electron paths through three water thicknesses
capability: geant4 graphics
tier: C
kind: python
packages: ["geant4-pybind==0.1.3", "Pillow==12.3.0"]
source:
  name: "Geant4"
  repo: https://github.com/Geant4/geant4
  license: "Geant4 Software License 1.0"
io:
  inputs:
  - name: main.py
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

# Electron paths through three water thicknesses

Original Geant4 11.4.1 transports 144 electrons through three water slabs and records their native paths and deposited energy.

원본 Geant4 11.4.1에서 세 두께의 물에 전자 144개를 통과시켜 실제 이동 경로와 전달 에너지를 계산했어요.

## Setup

Requires Python 3.12+ on Apple Silicon macOS. The pinned geant4-pybind 0.1.3 wheel contains the original Geant4 11.4.1 engine. Official G4EMLOW 8.8, PhotonEvaporation 6.1.2 and G4ENSDFSTATE 3.0 datasets (about 362 MB compressed) are SHA-256 verified, downloaded on demand and cached. No GPU or API key is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 데이터 약 362MB를 처음 실행할 때 받아 체크섬을 확인하고 재사용합니다. 각 조건에서 10MeV 전자 48개의 원본 경로와 물에 전달된 에너지를 계산합니다. 이 Mac에서는 Python 연결부의 종료 정리 과정에 충돌이 있어, 각 조건을 별도 프로세스에서 계산하고 모든 사건의 검증·결과 파일 저장을 마친 뒤 바로 종료합니다. 운영체제가 해당 메모리를 회수하며, 계산 도중의 오류를 성공으로 처리하지 않습니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,subprocess,sys,tarfile,tempfile,urllib.request,shutil
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True)
sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest()
cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/geant4';cache.mkdir(parents=True,exist_ok=True);root=cache/key
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  root.mkdir(exist_ok=True)
  for source in sources:
   archive=cache/(source['sha256']+'.tar.gz')
   def valid():
    if not archive.is_file():return False
    with archive.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()==source['sha256']
   if not valid():
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:
     pending=Path(f.name)
     with urllib.request.urlopen(source['url'],timeout=180) as response:shutil.copyfileobj(response,f)
    with pending.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    if digest!=source['sha256']:pending.unlink();raise RuntimeError('Geant4 dataset checksum mismatch: '+source['name'])
    pending.replace(archive)
   with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  (root/'.ready').touch()
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'main.py'),str(root)],check=True,timeout=900)
 result=json.loads((out/'result.json').read_text());frames=result['frames']
 assert len(frames)==3 and all(len(f['tracks'])==48 for f in frames)
 assert frames[-1]['meanEnergyDeposit']>frames[0]['meanEnergyDeposit']
 print('PASS original Geant4 transport, 144 primary electrons and thickness-dependent energy deposition')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

A supplied vacuum world contains a water slab of thickness 1, 3 or 5 cm. Each case transports 48 primary 10 MeV electrons using original standard electromagnetic physics, a 0.1 mm production cut and a 0.5 mm maximum step inside water. The driver preserves native primary track coordinates and all-particle energy deposits in water, then plots their x-z projections. Mean deposited energies were 1.935, 6.648 and 9.482 MeV. This is a small illustrative Monte Carlo experiment, not a full detector study. The pinned Python binding crashed while destroying Python callbacks during interpreter shutdown on this Mac. Each case therefore runs in an isolated worker: after all events, validation and a closed result file, the worker exits directly and the operating system reclaims its native allocations. Physics code and datasets are unchanged; computation errors still fail the recipe.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
