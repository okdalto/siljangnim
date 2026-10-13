---
id: fullik-fabrik.gallery
version: 1
title: Reaching with an articulated chain
capability: fullik-fabrik geometry native
tier: C
kind: python
packages: []
source:
  name: "fullik · FABRIK"
  repo: https://github.com/lo-th/fullik
  license: "MIT"
io:
  inputs:
  - name: main.mjs
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: [result.json]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Reaching with an articulated chain

Fullik solves a three-bone planar chain toward three targets using FABRIK. Bone lengths and endpoint error are checked after each solve.

Fullik의 FABRIK 알고리즘으로 세 뼈 체인을 세 목표점으로 풀었어요. 각 계산 뒤 뼈 길이와 끝점 오차를 검사했어요.

## Setup

Requires Python 3.11.15 or newer and Node.js on PATH (tested with 25.6.1). Map main.mjs and source.json into in/. The wrapper downloads the pinned upstream source archive, verifies its SHA-256 and caches it under (XDG_CACHE_HOME or ~/.cache)/siljangnim/sources. It runs the original JavaScript with the included driver. No npm packages or GPU are required. Viewing only downloads prepared files.

재실행에는 Python과 Node.js가 필요해요. 고정된 원본 소스의 체크섬을 검증해 캐시하고 원본 JavaScript를 실행해요. 예제를 열 때는 직접 계산한 결과만 받아요.

## Run

```python
import hashlib, json, os, pathlib, shutil, subprocess, tarfile, tempfile, urllib.request

config = json.loads(pathlib.Path('in/source.json').read_text())
cache = pathlib.Path(os.environ.get('XDG_CACHE_HOME', pathlib.Path.home()/'.cache'))/'siljangnim'/'sources'
cache.mkdir(parents=True, exist_ok=True)
archive = cache/(config['sha256']+'.tar.gz')
if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
    with urllib.request.urlopen(config['url'], timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest()!=config['sha256']:
        raise RuntimeError('Source archive checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temporary:
        temporary.write(data)
        pending = pathlib.Path(temporary.name)
    pending.replace(archive)
node = shutil.which('node')
if not node:
    raise RuntimeError('Install Node.js (tested with 25.6.1) and put node on PATH.')
with tempfile.TemporaryDirectory(prefix='siljangnim-js-') as temporary:
    work=pathlib.Path(temporary)
    with tarfile.open(archive) as source:
        source.extractall(work, filter='data')
    source=next(work.iterdir())
    subprocess.run([node,'in/main.mjs',str(source),'out'],check=True)
    data=json.loads(pathlib.Path('out/result.json').read_text())
    assert len(data['frames'])==config['frames']
    pathlib.Path('out/result.json').write_text(json.dumps(data,allow_nan=False))
```

## Verify

Executed on macOS arm64 from a fresh source cache and again with the cached archive. The driver asserts numerical invariants; nonzero engine exits fail the recipe.

## Notes

Original procedural input and driver. The viewer changes stored results or viewing transforms, not the underlying computation. Source URL, exact commit and checksum are in source.json.
