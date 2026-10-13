---
id: hatviz.gallery
version: 1
title: Aperiodic hat supertiles
capability: hatviz simulation native
tier: C
kind: python
packages: []
source:
  name: "hatviz"
  repo: https://github.com/isohedral/hatviz
  license: "BSD-3-Clause"
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

# Aperiodic hat supertiles

HatViz constructs three substitution levels of its original hat tiling. Paths come from the actual recursive affine transforms, normalized only for the viewer.

HatViz의 원본 모자 타일을 세 치환 단계로 확장했어요. 실제 재귀 아핀 변환에서 꺼낸 윤곽을 화면 크기에 맞춰 표시해요.

## Setup

Requires Python 3.11.15 or newer and Node.js on PATH (tested with 25.6.1). Map main.mjs, source.json into in/. Source files or archives are pinned, SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Native CMake builds are cached by source, driver and toolchain identity. The original computation runs on every invocation. Viewing only downloads prepared results.

원본 도구를 직접 실행해요. 필요한 실행 프로그램을 PATH에 두고 입력 파일을 연결하세요. 검증된 소스를 캐시하며 계산은 매번 실행해요. 예제를 열 때는 준비된 결과만 받아요.

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

Executed from a fresh source cache and again using cached files. Outputs matched byte for byte; driver checks cover finite results and problem-specific numerical invariants. Nonzero engine exits fail the recipe.

## Notes

The original substitution and getText traversal produce affine transforms. The driver converts transformed hat outlines into display paths; it does not run the p5 UI. The viewer selects prepared outputs and does not rerun the solver.
