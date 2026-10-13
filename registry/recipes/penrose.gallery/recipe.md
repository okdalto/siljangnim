---
id: penrose.gallery
version: 1
title: Diagrams from distance constraints
capability: penrose graphics
tier: C
kind: python
packages: []
source:
  name: "Penrose"
  repo: https://github.com/penrose/penrose
  license: "MIT"
io:
  inputs:
  - name: main.mjs
    media: file
  - name: package.json
    media: file
  - name: package-lock.json
    media: file
  outputs:
  - name: diagram-0.svg
    media: file
  - name: diagram-1.svg
    media: file
  - name: diagram-2.svg
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["diagram-0.svg", "diagram-1.svg", "diagram-2.svg", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Diagrams from distance constraints

Penrose compiles declarative relationships, optimizes three distance constraints and exports the original SVG diagrams.

Penrose 원본 컴파일러와 최적화기로 거리 제약을 풀고 SVG 다이어그램을 생성했어요.

## Setup

Requires Python 3.11+, Node.js and npm (tested with Node 25.6.1). Map all inputs into in/. The recipe uses npm ci with the supplied exact lock and integrity hashes, caching dependencies only when the recipe is run.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,os,pathlib,shutil,subprocess
node=shutil.which('node');npm=shutil.which('npm')
if not node or not npm:raise RuntimeError('Install Node.js and npm (tested with Node 25.6.1).')
lock=pathlib.Path('in/package-lock.json').read_bytes();package=pathlib.Path('in/package.json').read_bytes();key=hashlib.sha256(lock+package).hexdigest();cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'node-packages';cache.mkdir(parents=True,exist_ok=True);prefix=cache/key
with (cache/(key+'.lock')).open('w') as f:
 fcntl.flock(f,fcntl.LOCK_EX);prefix.mkdir(exist_ok=True)
 if not (prefix/'ready').is_file():
  (prefix/'package.json').write_bytes(package);(prefix/'package-lock.json').write_bytes(lock)
  subprocess.run([npm,'ci','--ignore-scripts','--no-audit','--no-fund','--cache',str(cache/'npm')],cwd=prefix,check=True)
  (prefix/'ready').write_text(key)
 shutil.copyfile('in/main.mjs',prefix/'main.mjs');out=pathlib.Path('out').absolute();out.mkdir(exist_ok=True)
 subprocess.run([node,str(prefix/'main.mjs'),str(out)],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Original @penrose/core compile, optimize and toSVG APIs solve an original Domain/Substance/Style definition. Three circle centers must satisfy all requested pair distances within 0.01 pixel. The viewer draws paths sampled from the actual optimized SVG; all original SVG outputs are also retained. No diagram optimizer is reimplemented.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
