---
id: the-powder-toy.gallery
version: 1
title: Sand and water settling under gravity
capability: the-powder-toy graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "The Powder Toy"
  repo: https://github.com/thepowdertoy/the-powder-toy
  license: "GPL-3.0"
io:
  inputs:
  - name: autorun.lua
    media: file
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
  - name: stats-0.txt
    media: file
  - name: stats-1.txt
    media: file
  - name: stats-2.txt
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-1.png", "render-2.png", "result.json", "stats-0.txt", "stats-1.txt", "stats-2.txt"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Sand and water settling under gravity

The Powder Toy 100.1.400 runs original sand and water physics in a closed vessel and captures three native simulation frames.

The Powder Toy 100.1.400 원본에서 닫힌 용기 안의 가루와 물을 시뮬레이션하고 세 시점의 화면을 직접 저장했어요.

## Setup

This recipe targets Apple Silicon macOS with a graphical desktop and Python 3.12+. It verifies and caches the official Powder Toy 100.1.400 ARM64 disk image (about 3 MB), mounts it read-only, and runs in a temporary data directory with networking disabled.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,sys,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This package recipe is for macOS. On another platform install The Powder Toy 100.1.400 and pass powder to in/main.py.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'the-powder-toy';cache.mkdir(parents=True,exist_ok=True);archive=cache/(config['sha256']+'.dmg')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
  with urllib.request.urlopen(config['url'],timeout=180) as response:data=response.read()
  if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Powder Toy package checksum mismatch')
  with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
  pending.replace(archive)
 with tempfile.TemporaryDirectory(prefix='siljangnim-powder-') as mount:
  subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,str(archive)],check=True)
  try:
   binary=pathlib.Path(mount)/'The Powder Toy.app/Contents/MacOS/powder'
   if not binary.is_file():raise RuntimeError('powder is missing from the pinned package')
   subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
  finally:subprocess.run(['hdiutil','detach',mount],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied Lua input creates a closed diamond-walled vessel with 8211 dust particles and 8211 water particles. Original physics and rendering run unchanged with an explicit RNG state. The original screenshot API captures steps 30, 100 and 250. Native particle queries verify exact conservation of both particle types and increased mean height coordinates as they fall. Screenshots contain only the simulation, with no UI or externally supplied image.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
