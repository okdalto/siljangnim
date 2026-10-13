---
id: oripa.gallery
version: 1
title: Flat folding from crease patterns
capability: oripa graphics
tier: C
kind: python
packages: []
source:
  name: "ORIPA"
  repo: https://github.com/oripa/oripa
  license: "GPL-3.0-or-later"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: folded-0.fold
    media: file
  - name: folded-0.svg
    media: file
  - name: folded-1.fold
    media: file
  - name: folded-1.svg
    media: file
  - name: folded-2.fold
    media: file
  - name: folded-2.svg
    media: file
  - name: pattern-0.cp
    media: file
  - name: pattern-1.cp
    media: file
  - name: pattern-2.cp
    media: file
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
  expect_outputs: ["folded-0.fold", "folded-0.svg", "folded-1.fold", "folded-1.svg", "folded-2.fold", "folded-2.svg", "pattern-0.cp", "pattern-1.cp", "pattern-2.cp", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Flat folding from crease patterns

ORIPA directly folds three crease patterns and exports folded SVG, PNG and FOLD data; face areas preserve the original paper area.

ORIPA 원본 CLI로 세 종이접기 도안을 접고 SVG·PNG·FOLD 데이터를 생성해 종이 면적 보존을 검사했어요.

## Setup

Requires Python 3.12+ and Java 21 or newer (tested with Temurin 21.0.8+9). Set JAVA to an executable path if it is not on PATH. Map main.py and source.json into in/. The official ORIPA 1.80 JAR is SHA-256 verified and cached.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,urllib.request
java=os.environ.get('JAVA') or shutil.which('java')
if not java:raise RuntimeError('Install Java 21 or set JAVA to its executable. Tested with Temurin 21.0.8+9.')
subprocess.run([java,'-version'],check=True)
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'oripa';cache.mkdir(parents=True,exist_ok=True);jar=cache/(config['sha256']+'.jar')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not jar.is_file() or hashlib.sha256(jar.read_bytes()).hexdigest()!=config['sha256']:
  with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
  if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('ORIPA JAR checksum mismatch')
  with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
  pending.replace(jar)
 subprocess.run([sys.executable,'in/main.py',java,str(jar)],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

The original official JAR folds diagonal, corner and accordion crease patterns with --any, then exports the first folded form as PNG, SVG and FOLD. Assertions verify two, two and four faces respectively and summed face area 160000, equal to the input square. Input segments are split at crease endpoints before loading. The native CLI can report an error with exit code zero, so the driver deletes stale outputs and requires new FOLD files and valid geometry.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
