---
id: appleseed.gallery
version: 1
title: Three light rigs in a native CPU renderer
capability: appleseed graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "appleseed"
  repo: https://github.com/appleseedhq/appleseed
  license: "MIT"
io:
  inputs:
  - name: main.py
    media: file
  - name: scene.appleseed
    media: file
  - name: scene.obj
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

# Three light rigs in a native CPU renderer

appleseed 2.1.0-beta renders its supplied hello-world geometry with warm, cool and overhead lights at 64 samples per pixel.

appleseed 2.1.0-beta의 원본 예제 기하를 따뜻한 빛·차가운 빛·머리 위 조명으로 바꾸어 픽셀당 64샘플로 직접 렌더했어요.

## Setup

Requires macOS and Python 3.12+. The official Intel macOS 2.1.0-beta release is SHA-256 verified and cached (142 MB download). Apple Silicon needs Rosetta 2 already installed; the recipe does not install Rosetta. The original CLI and bundled libraries run unchanged, using two CPU threads. Gallery results were directly rendered on an Apple Silicon Mac through Rosetta.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 Intel Mac 배포판을 받아 캐시합니다. Apple Silicon에서는 Rosetta 2가 미리 설치되어 있어야 하며 레시피가 이를 설치하지는 않습니다. 원본 hello-world 입력 장면의 조명만 바꾸어 CPU 두 스레드에서 직접 렌더했습니다. 기하 입력의 출처를 표시했으며 기존 렌더 결과를 복사하지 않았습니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,subprocess,sys,tempfile,urllib.request,zipfile
from PIL import Image,ImageStat
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);source=json.loads((inputs/'source.json').read_text())
cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/appleseed';cache.mkdir(parents=True,exist_ok=True);root=cache/source['sha256'];exe=root/'appleseed/bin/appleseed.cli'
with (cache/(source['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  with urllib.request.urlopen(source['url'],timeout=180) as r:data=r.read()
  if hashlib.sha256(data).hexdigest()!=source['sha256']:raise RuntimeError('appleseed release checksum mismatch')
  root.mkdir(exist_ok=True)
  with tempfile.TemporaryFile() as f:
   f.write(data);f.seek(0)
   with zipfile.ZipFile(f) as z:
    for name in z.namelist():
     if name.split('/')[1:2] in [['bin'],['lib'],['schemas'],['settings'],['shaders'],['kernels'],['ocio'],['share'],['seexpr']] or name.endswith(('LICENSE.txt','THIRDPARTIES.txt')):z.extract(name,root)
  exe.chmod(0o755);(root/'.ready').touch()
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'main.py'),str(exe)],check=True,timeout=900)
 frames=json.loads((out/'result.json').read_text())['frames'];assert len(frames)==3
 images=[Image.open(out/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(384,288) and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original appleseed CPU renderer and distinct native lighting results')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The input adapts the original MIT-licensed hello-world scene and its 48-triangle mesh. The original renderer migrates its historical scene format and traces 64 samples per pixel with seed 17. Only point-light position and color change between warm left, cool right and white overhead. All 384 by 288 PNGs were computed locally; no reference render is copied. The recipe checks native process success, dimensions, nonblank content and distinct results.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
