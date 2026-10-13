---
id: mandelbulber.gallery
version: 1
title: Native CPU Mandelbulb powers
capability: mandelbulber graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "Mandelbulber"
  repo: https://github.com/buddhi1980/mandelbulber2
  license: "GPL-3.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: scene.fract
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

# Native CPU Mandelbulb powers

Mandelbulber 2.34 renders three Mandelbulb powers with its original CPU distance-estimation renderer and ambient occlusion.

Mandelbulber 2.34 원본 CPU 렌더러로 만델벌브 차수 6·8·10의 프랙탈 이미지를 직접 렌더했어요.

## Setup

This recipe targets Apple Silicon macOS with Python 3.12+. It verifies and caches the official Mandelbulber 2.34 M1 disk image (about 201 MB), mounts it read-only and invokes the original no-GUI CPU renderer. No OpenCL/CUDA device or external texture is required.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,sys,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This package recipe is for macOS. On another platform install Mandelbulber 2.34 and pass mandelbulber2 to in/main.py.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'mandelbulber';cache.mkdir(parents=True,exist_ok=True);archive=cache/(config['sha256']+'.dmg')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
  with urllib.request.urlopen(config['url'],timeout=180) as response:data=response.read()
  if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Mandelbulber package checksum mismatch')
  with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
  pending.replace(archive)
 with tempfile.TemporaryDirectory(prefix='siljangnim-mandelbulber-') as mount:
  subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,str(archive)],check=True)
  try:
   binary=pathlib.Path(mount)/'mandelbulber2.app/Contents/MacOS/mandelbulber2'
   if not binary.is_file():raise RuntimeError('mandelbulber2 is missing from the pinned package')
   subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
  finally:subprocess.run(['hdiutil','detach',mount],check=True)
```

## Verify

The original engine was rerun using its cached official package. Native ray marching adds random step jitter, so byte equality is not expected. Repeated renders passed dimensions, image-content and distinct-power checks, with mean absolute RGB differences of about 0.98, 0.55 and 0.49 on a 0–255 scale (threshold 5).

캐시를 재사용해 원본 엔진을 반복 실행했습니다. 원본 광선 진행의 난수 때문에 픽셀은 조금 달라지며, RGB 평균 절대 차이는 255점 척도에서 약 0.98·0.55·0.49로 검증 기준 5 이내였습니다.

## Scope

The supplied input comes from the upstream mandelbulb001 example. The driver overrides power to 6, 8 and 10, image size to 512 by 384, detail level to 1 and ambient occlusion quality to 3. The original distance-estimation renderer creates each PNG. Validation checks dimensions, nontrivial image content and distinct outputs. No fractal equation or ray marcher is reimplemented.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
