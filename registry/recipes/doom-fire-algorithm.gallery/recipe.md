---
id: doom-fire-algorithm.gallery
version: 1
title: Palette fire propagation
capability: doom-fire-algorithm render native
tier: C
kind: python
packages: []
source:
  name: "doom-fire-algorithm"
  repo: https://github.com/filipedeschamps/doom-fire-algorithm
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

# Palette fire propagation

The original Doom fire algorithm propagates heat upward. Three snapshots use a seeded random source; the original palette turns intensities into pixels.

원본 Doom 불꽃 알고리즘으로 열을 위쪽으로 전파했어요. 난수 시드를 고정해 세 시점을 계산하고 원본 팔레트로 픽셀을 만들었어요.

## Setup

Requires Python 3.11.15 or newer and Node.js on PATH (tested with 25.6.1). Map main.mjs, source.json into in/. The wrapper downloads only the listed upstream source files, verifies SHA-256 hashes and caches them under (XDG_CACHE_HOME or ~/.cache)/siljangnim/source-files. The original engine runs on every invocation.

원본 도구를 직접 실행하는 레시피예요. 필요한 실행 프로그램을 PATH에 두고 입력 파일을 연결하세요. 첫 실행에만 검증된 소스 또는 실행 환경을 내려받아 캐시하며, 계산은 매번 실행해요. 예제를 열 때는 준비된 결과만 받아요.

## Run

```python
import hashlib, json, os, pathlib, shutil, struct, subprocess, tempfile, urllib.request, zlib

config=json.loads(pathlib.Path('in/source.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'source-files'
cache.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='siljangnim-source-') as temporary:
    source=pathlib.Path(temporary)
    for entry in config['files']:
        cached=cache/entry['sha256']
        if not cached.is_file() or hashlib.sha256(cached.read_bytes()).hexdigest()!=entry['sha256']:
            with urllib.request.urlopen(entry['url'],timeout=120) as response:
                data=response.read()
            if hashlib.sha256(data).hexdigest()!=entry['sha256']:
                raise RuntimeError('Source checksum mismatch: '+entry['path'])
            with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:
                f.write(data)
                pending=pathlib.Path(f.name)
            pending.replace(cached)
        target=source/entry['path']
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(cached,target)
    node=shutil.which('node')
    if not node:
        raise RuntimeError('Install Node.js (tested with 25.6.1) and put node on PATH.')
    subprocess.run([node,'in/main.mjs',str(source),'out'],check=True)
# Convert the driver's original RGB pixels to PNG without another dependency.
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
for ppm in pathlib.Path('out').glob('render-*.ppm'):
    with ppm.open('rb') as f:
        assert f.readline()==b'P6\n'
        w,h=map(int,f.readline().split())
        assert f.readline()==b'255\n'
        rgb=f.read()
    assert len(rgb)==w*h*3
    scan=b''.join(b'\0'+rgb[y*w*3:(y+1)*w*3] for y in range(h))
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(scan))+chunk(b'IEND',b'')
    ppm.with_suffix('.png').write_bytes(png)
    ppm.unlink()
data=json.loads(pathlib.Path('out/result.json').read_text())
assert len(data['frames'])==config['frames']
pathlib.Path('out/result.json').write_text(json.dumps(data,allow_nan=False))
```

## Verify

Executed with a fresh cache and again using the cached dependencies. Output files matched byte for byte. Nonzero engine exits or failed numerical checks fail the recipe.

## Notes

The driver supplies deterministic inputs and reads the actual engine output. It does not replace the original computation. Browser DOM and interval adapters allow the original propagation functions to run at fixed iteration counts. The palette comes from the original source. Viewing controls select stored results; they do not rerun the computation.
