---
id: myphysicslab.gallery
version: 1
title: Pendulum paths and phase portraits
capability: myphysicslab graphics
tier: C
kind: python
packages: []
source:
  name: "myPhysicsLab"
  repo: https://github.com/myphysicslab/myphysicslab
  license: "Apache-2.0"
io:
  inputs:
  - name: main.ts
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

# Pendulum paths and phase portraits

Original myPhysicsLab integrates three undamped pendulums; phase portraits and energy checks show its native solver results.

myPhysicsLab 원본 적분기로 세 무감쇠 진자를 계산하고 위상 공간과 에너지 보존을 확인했어요.

## Setup

Requires Python 3.11 or newer, the pinned packages above, and Node.js 25.6.1 plus esbuild 0.27.7 on PATH. Install the compiler with npm install -g esbuild@0.27.7. Map the listed inputs into in/. For native tools, install the listed version through your system package manager. This recipe downloads its pinned original source files only when needed and verifies SHA-256 before caching under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Opening the gallery downloads only prepared outputs.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. 고정한 원본 TypeScript 소스는 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

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
    esbuild=shutil.which('esbuild')
    if not esbuild:
        raise RuntimeError('Install esbuild 0.27.7 on PATH: npm install -g esbuild@0.27.7')
    shutil.copyfile('in/main.ts',source/'main.ts')
    built=source/'main.mjs'
    subprocess.run([esbuild,str(source/'main.ts'),'--bundle','--platform=node','--format=esm','--define:MPL_BUILD_TIME="2026-09-29"','--define:MPL_LOCALE="en"','--outfile='+str(built)],check=True)
    subprocess.run([node,str(built),'out'],check=True)
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

This executes the original PendulumSim and SimpleAdvance Runge-Kutta solver for 10 seconds at 240 steps per second. Inputs differ only in initial angle. Teal curves show angle over time; orange curves show angle against angular velocity. Assertions check finite state and energy drift below 1e-5. Pinned upstream TypeScript files are downloaded, SHA-256 verified, cached and bundled with esbuild without algorithm changes.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
