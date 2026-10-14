---
id: cinder.gallery
version: 1
title: Flow lines from native derivative noise
capability: cinder graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "Cinder"
  repo: https://github.com/cinder/cinder
  license: "BSD-2-Clause"
io:
  inputs:
  - name: main.cpp
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
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Flow lines from native derivative noise

Cinder 0.9.3 computes derivative noise and renders 784 flow paths at three phases with its original OpenGL drawing and image export APIs.

Cinder 0.9.3 원본 잡음 미분 함수로 흐름선 784개를 계산하고 세 위상을 원본 OpenGL과 이미지 저장 API로 렌더했어요.

## Setup

Requires Apple Silicon macOS, Xcode command-line tools, Python 3.12+ and a graphical desktop. The official Cinder 0.9.3 ARM64 release is SHA-256 verified and cached. Its original precompiled library links the supplied C++ scene; the native executable is cached by source and input hashes. No Cinder source modification is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Apple Silicon macOS, Xcode 명령줄 도구와 그래픽 데스크톱이 필요합니다. 공식 Cinder 라이브러리를 받아 직접 작성한 C++ 장면을 컴파일하고 실행 파일을 캐시합니다. 원본 엔진은 수정하지 않았으며 프레임마다 좌표 50,176개와 OpenGL 오류 여부를 확인합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,tempfile,urllib.request,zipfile
from PIL import Image
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This official prebuilt Cinder recipe targets Apple Silicon macOS.')
if not shutil.which('clang++'):raise RuntimeError('Install Xcode command-line tools to compile the supplied Cinder scene.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True);config=json.loads((inputs/'source.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'cinder';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256((inputs/'source.json').read_bytes()+(inputs/'main.cpp').read_bytes()).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.zip')
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 binary=root/'native-flow'
 if not binary.is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=180) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Cinder official release checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with zipfile.ZipFile(archive) as z:
   for item in z.infolist():
    if '/include/' in item.filename or item.filename.endswith('/lib/macosx/Release/libcinder.a'):z.extract(item,root)
  source=root/'cinder_0.9.3_mac';pending=root/'native-flow.pending'
  cmd=['clang++','-std=c++17','-O2','-DNDEBUG','-I'+str(source/'include'),str(inputs/'main.cpp'),str(source/'lib/macosx/Release/libcinder.a'),'-o',str(pending)]
  for framework in ['Cocoa','OpenGL','AVFoundation','AudioToolbox','AudioUnit','CoreAudio','CoreMedia','CoreVideo','Accelerate','IOSurface','IOKit']:cmd+=['-framework',framework]
  subprocess.run(cmd,check=True);pending.replace(binary)
 subprocess.run([str(binary)],env={**os.environ,'OUTPUT_DIR':str(output)},check=True,timeout=90)
 frames=json.loads((output/'result.json').read_text())['frames'];assert len(frames)==3 and all(f['paths']==784 and f['vertices']==50176 for f in frames)
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(512,512) and len(im.getcolors(512*512))>100 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original Cinder derivative noise, native OpenGL and three finite flow fields')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied scene samples original Perlin.dfBm derivatives with four octaves and seed 17. A perpendicular normalized gradient advances each of 784 paths through 64 finite vertices at phases 0, 0.65 and 1.3. Original Cinder OpenGL line drawing, a multisampled framebuffer and writeImage export the 512 by 512 PNGs. Native OpenGL errors, all 50,176 vertices per frame and distinct images are checked. Line width is one pixel, supported by the native macOS OpenGL context.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
