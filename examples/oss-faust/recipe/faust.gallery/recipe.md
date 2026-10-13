---
id: faust.gallery
version: 1
title: Compiled low-pass synthesis
capability: faust graphics
tier: C
kind: python
packages: []
source:
  name: "Faust"
  repo: https://github.com/grame-cncm/faust
  license: "LGPL-2.1-or-later"
io:
  inputs:
  - name: main.mjs
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
  - name: audio-0.wav
    media: file
  - name: audio-1.wav
    media: file
  - name: audio-2.wav
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "audio-0.wav", "audio-1.wav", "audio-2.wav"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Compiled low-pass synthesis

The original Faust compiler renders three low-pass DSP programs to WAV using its official WebAssembly build.

Faust 공식 WebAssembly 컴파일러로 세 저역통과 DSP 프로그램을 컴파일해 WAV를 만들었어요.

## Setup

Requires Python 3.11 or newer, the pinned packages above, and Node.js 25.6.1, @grame/faustwasm 0.18.5 (Faust 2.89.2) on PATH. Map the listed inputs into in/. For native tools, install the listed version through your system package manager. The Faust recipe downloads its pinned official WASM files only when needed and verifies SHA-256 before caching under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Opening the gallery downloads only prepared outputs.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. Faust의 공식 WASM 파일은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

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

Executed twice with the original engine. All listed outputs matched byte for byte.

원본 엔진으로 두 번 실행해 모든 출력이 일치하는지 확인했습니다.

## Scope

Original Faust 2.89.2 compiles the provided DSP and renders one second at 44100 Hz per variant. Assertions verify finite audio and lower RMS with the lowest cutoff. The official package files are SHA-256 verified and cached; the compiler runs again on every invocation.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
