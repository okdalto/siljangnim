---
id: turing-patterns.gallery
version: 1
title: Reaction-diffusion patterns from the notebook
capability: turing-patterns simulation native
tier: C
kind: python
packages: ["numpy==2.2.6", "matplotlib==3.11.2", "Pillow==11.3.0"]
source:
  name: "Turing Patterns"
  repo: https://github.com/ijmbarr/turing-patterns
  license: "MIT"
io:
  inputs:
  - name: main.py
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

# Reaction-diffusion patterns from the notebook

The original Turing Patterns notebook solver evolves three Gray-Scott systems for 6,000 steps. Images use the directly computed concentration field.

Turing Patterns 노트북의 원본 솔버로 세 Gray-Scott 계를 6,000단계 계산했어요. 실제 농도장을 이미지로 표시해요.

## Setup

Requires Python 3.11.15 or newer and the listed Python packages. Map main.py, source.json into in/. Source files or archives are pinned, SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Native CMake builds are cached by source, driver and toolchain identity. The original computation runs on every invocation. Viewing only downloads prepared results.

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
    import sys
    subprocess.run([sys.executable,'in/main.py',str(source),'out'],check=True,env={**os.environ,'MPLBACKEND':'Agg'})
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

The driver extracts unchanged solver definitions from the pinned notebook with Python AST, omitting demonstration plotting commands. It uses the original initializer and a fixed random seed. The viewer selects prepared outputs and does not rerun the solver.
