---
id: ray-optics-simulation.gallery
version: 1
title: Ideal lens ray tracing
capability: ray-optics-simulation graphics
tier: C
kind: python
packages: []
source:
  name: "Ray Optics Simulation"
  repo: https://github.com/ricktu288/ray-optics
  license: "Apache-2.0"
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

# Ideal lens ray tracing

Original Ray Optics IdealLens intersection and refraction methods trace nine rays through three lenses.

Ray Optics 원본 IdealLens 교차·굴절 메서드로 세 렌즈를 지나는 아홉 광선을 계산했어요.

## Setup

Requires Python 3.11 or newer and Node.js on PATH (tested with 25.6.1). Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

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

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check packing non-overlap, focal intersections, decoded Bayer pixels or exact recognized text, as applicable.

## Scope

Small original synthetic inputs demonstrate the original engine. The viewer selects prepared outputs; rerun this recipe to change computation. SVGNest uses its placement worker, not the full genetic search. Ray Optics uses its original IdealLens methods, not its browser UI. The RAW example is synthetic, not a calibrated camera photograph.
