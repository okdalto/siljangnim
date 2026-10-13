---
id: processing-geometry-suite.gallery
version: 1
title: Maximum circles inside a concave shape
capability: processing-geometry-suite graphics
tier: C
kind: python
packages: ["JPype1==1.6.0", "packaging==25.0"]
source:
  name: "Processing Geometry Suite"
  repo: https://github.com/micycle1/pgs
  license: "GPL-3.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
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

# Maximum circles inside a concave shape

PGS 2.2 directly computes 20, 60 and 120 maximum inscribed circles, checked for overlap and containment.

PGS 2.2 원본으로 최대 내접원 20·60·120개를 계산하고 겹침과 경계 이탈을 검증했어요.

## Setup

Requires Python 3.12+ and Java 21 (tested with Temurin 21.0.8+9). Set JAVA_HOME to your Java installation. PGS 2.2 and Processing core 4.3.1 JARs are downloaded on recipe execution only, verified by SHA-256, and cached. JPype calls the original Java APIs directly.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,subprocess,sys,tempfile,urllib.request
# JPype discovers an installed Java runtime through JAVA_HOME or the platform registry.
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'processing-geometry-suite';cache.mkdir(parents=True,exist_ok=True);jars=[]
with (cache/'download.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for item in config:
  target=cache/(item['sha256']+'.jar')
  if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
   with urllib.request.urlopen(item['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError(item['name']+' checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(target)
  jars.append(str(target))
 subprocess.run([sys.executable,'in/main.py',*jars],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original PGS maximumInscribedPack API runs on an original concave polygon with tolerance 0.15. JTS verifies every circle center lies inside the polygon, the boundary distance covers its radius, and every pair of circles is nonoverlapping within floating-point tolerance. The viewer only draws the resulting centers and radii. No packing algorithm is reimplemented.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
