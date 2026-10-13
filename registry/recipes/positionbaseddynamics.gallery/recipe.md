---
id: positionbaseddynamics.gallery
version: 1
title: Cloth distance constraints
capability: positionbaseddynamics graphics
tier: C
kind: python
packages: []
source:
  name: "PositionBasedDynamics"
  repo: https://github.com/interactivecomputergraphics/positionbaseddynamics
  license: "MIT"
io:
  inputs:
  - name: main.cpp
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

# Cloth distance constraints

Original PositionBasedDynamics C++ constraints solve a small suspended cloth at three stiffness settings.

PositionBasedDynamics 원본 C++ 거리 제약으로 매달린 작은 천을 세 강성 값에서 계산했어요.

## Setup

Requires Python 3.11 or newer and a C++17 compiler on PATH (tested with Apple clang 17). Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

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
    entry=config['eigen'];cached=cache/entry['sha256']
    if not cached.is_file() or hashlib.sha256(cached.read_bytes()).hexdigest()!=entry['sha256']:
        raw=urllib.request.urlopen(entry['url'],timeout=120).read();assert hashlib.sha256(raw).hexdigest()==entry['sha256']
        with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(raw);pending=pathlib.Path(f.name)
        pending.replace(cached)
    import tarfile
    with tarfile.open(cached) as t:t.extractall(source/'eigen',filter='data')
    eigen=next((source/'eigen').iterdir());compiler=shutil.which('c++')
    if not compiler:raise RuntimeError('Install a C++17 compiler on PATH (tested with Apple clang 17).')
    binary=source/'run';subprocess.run([compiler,'-std=c++17','-O2','-UNDEBUG','-I'+str(source),'-I'+str(eigen),'in/main.cpp',str(source/'PositionBasedDynamics/PositionBasedDynamics.cpp'),str(source/'PositionBasedDynamics/MathFunctions.cpp'),'-o',str(binary)],check=True)
    pathlib.Path('out').mkdir(exist_ok=True);subprocess.run([str(binary),'out'],check=True)
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

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check finite geometry, triangulated area, reconstruction error, spectral pitch, spherical area, collision symmetry or cloth strain, as applicable.

## Scope

The original unmodified C++ distance-constraint solver runs inside an original small cloth driver with 117 particles, fixed corner anchors and three stiffness values. This does not run the upstream GUI or add bending constraints. The viewer selects prepared outputs; rerun the recipe to change computation.

