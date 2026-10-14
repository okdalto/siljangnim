---
id: potree.gallery
version: 1
title: Native point cloud decoding and rendering
capability: potree graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "Potree"
  repo: https://github.com/potree/potree
  license: "BSD-2-Clause"
io:
  inputs:
  - name: capture.html
    media: file
  - name: cloud.js
    media: file
  - name: r.bin
    media: file
  - name: runner.cjs
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

# Native point cloud decoding and rendering

Potree 1.8.2 decodes a supplied 6,400-point binary cloud and renders RGB, elevation and enlarged-point views with its original renderer.

Potree 1.8.2 원본 로더로 직접 만든 점 6,400개의 바이너리 파일을 읽어 색상·고도·큰 점 보기로 렌더했어요.

## Setup

Requires Python 3.12+ and Electron on PATH or through ELECTRON; tested on macOS with Electron 44.4.4. The official Potree 1.8.2 release (about 57 MB) is downloaded, SHA-256 checked and cached. Only its original build and libraries are extracted.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Python 3.12 이상과 Electron이 필요합니다. Potree 1.8.2를 최초 실행 때 내려받고 캐시합니다. 직접 만든 가상 지형의 점 6,400개를 원본 바이너리 로더로 읽고 실제 표시된 점 수까지 확인했습니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tempfile,urllib.request,zipfile
from PIL import Image
binary=os.environ.get('ELECTRON') or shutil.which('electron')
if not binary:raise RuntimeError('Install Electron or set ELECTRON to its executable. Tested with Electron 44.4.4.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'potree';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.zip')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=180) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Potree release checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with zipfile.ZipFile(archive) as z:
   for item in z.infolist():
    if '/build/' in item.filename or '/libs/' in item.filename:z.extract(item,root)
  (root/'ready').write_text(config['sha256'])
 source=root/'Potree_1.8.2'
 with tempfile.TemporaryDirectory(prefix='siljangnim-potree-') as tmp:
  work=pathlib.Path(tmp)
  for name in ['build','libs']:(work/name).symlink_to(source/name,target_is_directory=True)
  shutil.copy(inputs/'capture.html',work/'capture.html');(work/'own-cloud').mkdir()
  for name in ['cloud.js','r.bin']:shutil.copy(inputs/name,work/'own-cloud'/name)
  env={**os.environ,'POTREE_PROFILE':str(work/'profile')};env.pop('ELECTRON_RUN_AS_NODE',None)
  subprocess.run([binary,str(inputs/'runner.cjs'),str(work),str(output)],env=env,check=True)
  frames=json.loads((output/'result.json').read_text())['frames'];assert all(f['points']==6400 and f['visiblePoints']==6400 for f in frames)
  images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
  assert all(im.size==(512,384) and len(im.getcolors(512*384))>100 for im in images)
  assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
  print('PASS native point decoder, full visible point counts and distinct Potree screenshots')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

An original 80 by 80 synthetic height field supplies positions and colors in Potree legacy binary format. The original BinaryDecoderWorker and renderer load all 6,400 points. Native visible-point counts, dimensions, colors and distinct 512 by 384 canvas images are checked. No upstream point-cloud dataset or gallery screenshot is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
