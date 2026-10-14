---
id: tidal-cycles.gallery
version: 1
title: Rhythm patterns at different speeds and directions
capability: tidal-cycles graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "Tidal Cycles"
  repo: https://github.com/tidalcycles/tidal
  license: "GPL-3.0"
io:
  inputs:
  - name: Main.hs
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

# Rhythm patterns at different speeds and directions

Original TidalCycles parses a rhythm and computes native event times for its base, double-speed and reversed patterns.

원본 TidalCycles가 리듬 문법을 해석하고 기본·두 배 속도·역순 패턴의 실제 사건 시간을 계산합니다.

## Setup

Requires GHC (verified with 9.6.7) and Python with Pillow. Original tidal-core 1.10.0 and colour 2.3.6 sources are SHA-256 verified, downloaded on demand and compiled unchanged. Source archives and the compiled driver are cached. The compiler runs without a user package environment, using its standard libraries; no global Haskell packages are changed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

GHC 9.6.7에서 확인했습니다. 원본 tidal-core와 colour 소스를 검증해 컴파일한 뒤 캐시합니다. 두 주기에서 기본·두 배 속도·역순 패턴은 각각 12·24·12개 사건을 만들며, 역순 연산을 두 번 적용하면 원본과 같아지는지도 검사합니다. 원본 패턴 엔진의 시간 계산 예제이며, SuperDirt 음원 엔진이나 실시간 공연 스케줄러를 실행하는 예제는 아닙니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,shutil,subprocess,sys,tarfile,tempfile,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());ghc=shutil.which('ghc')
if not ghc:raise RuntimeError('Install GHC before running this original Haskell pattern engine; verified with GHC 9.6.7.')
env={**os.environ,'GHC_ENVIRONMENT':'-'};version=subprocess.check_output([ghc,'--numeric-version'],env=env,text=True).strip();key=hashlib.sha256((inputs/'sources.json').read_bytes()+(inputs/'Main.hs').read_bytes()+version.encode()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/tidal-cycles';cache.mkdir(parents=True,exist_ok=True);root=cache/key;exe=root/'tidal-driver'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  root.mkdir(exist_ok=True);roots={}
  for item in sources:
   archive=cache/(item['sha256']+'.tar.gz')
   if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=180) as r:data=r.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Original Tidal source checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=Path(f.name)
    pending.replace(archive)
   dest=root/item['name'];dest.mkdir(exist_ok=True)
   with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
   roots[item['name']]=next(dest.iterdir())
  (root/'build').mkdir(exist_ok=True)
  subprocess.run([ghc,'-O1','-i'+str(roots['tidal-core']/'src'),'-i'+str(roots['colour']),'-outputdir',str(root/'build'),'-o',str(exe),str(inputs/'Main.hs')],env=env,check=True,timeout=600)
  (root/'.ready').touch()
 subprocess.run([str(exe),str(out/'result.json')],env=env,check=True,timeout=120)
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'render.py')],check=True)
 print('PASS original TidalCycles parsed patterns, speed change and reversible time transformation')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original mini-notation parser reads bd [hh hh] sn [hh cp]. Its original queryArc, fast and rev operators yield 12, 24 and 12 events over two cycles. Reversing twice is checked to restore every original event. The supplied renderer plots native start/end times in instrument lanes. This demonstrates the original pattern engine; it does not start a SuperDirt audio engine or a live performance scheduler. The gallery compares prepared timing diagrams, not synthesized audio.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
