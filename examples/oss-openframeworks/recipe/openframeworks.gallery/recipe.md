---
id: openframeworks.gallery
version: 1
title: A native noise terrain in three phases
capability: openframeworks graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "openFrameworks"
  repo: https://github.com/openframeworks/openframeworks
  license: "MIT"
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

# A native noise terrain in three phases

Original openFrameworks 0.12.1 generates a 2,401-vertex terrain and renders 4,608 triangles with its native OpenGL renderer.

원본 openFrameworks 0.12.1이 노이즈 지형을 만들고 2,401개 꼭짓점·4,608개 삼각형을 실제 OpenGL로 그립니다.

## Setup

Requires macOS with a graphical login session and Xcode command-line build tools. The official openFrameworks 0.12.1 macOS release (about 512 MB compressed) is downloaded on demand, SHA-256 verified and compiled with its original Makefiles. Compilation uses a temporary path without spaces; only the finished app and release archive remain cached. Allow about 2 GB of temporary disk space for the first build.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

macOS의 그래픽 로그인 세션과 Xcode 명령줄 빌드 도구가 필요합니다. 공식 배포본 약 512MB를 처음 실행할 때 받아 검증하고 원본 빌드 방식으로 컴파일합니다. 첫 빌드에는 약 2GB의 임시 저장 공간을 확보하세요. 숨겨진 원본 OpenGL 창에서 그린 640×480 이미지를 저장하며, C++ 입력을 바꾸면 새 지형을 계산할 수 있습니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,shutil,subprocess,sys,tarfile,tempfile,urllib.request
from PIL import Image,ImageStat
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);source=json.loads((inputs/'source.json').read_text());key=hashlib.sha256((inputs/'source.json').read_bytes()+(inputs/'main.cpp').read_bytes()+b'of-native-v1').hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/openframeworks';cache.mkdir(parents=True,exist_ok=True);root=cache/key;app=root/'siljangnimGallery.app';exe=app/'Contents/MacOS/siljangnimGallery'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  if sys.platform!='darwin':raise RuntimeError('This native renderer recipe requires macOS and Xcode command-line build tools.')
  archive=cache/(source['sha256']+'.tar.gz')
  def valid():
   if not archive.exists() or archive.stat().st_size!=source['size']:return False
   with archive.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()==source['sha256']
  if not valid():
   pending=archive.with_suffix('.download')
   with urllib.request.urlopen(source['url'],timeout=180) as r,pending.open('wb') as f:
    while chunk:=r.read(1024*1024):f.write(chunk)
   with pending.open('rb') as f:
    if hashlib.file_digest(f,'sha256').hexdigest()!=source['sha256']:pending.unlink();raise RuntimeError('openFrameworks release checksum mismatch')
   pending.replace(archive)
  # The original Makefiles require a build path without spaces.
  with tempfile.TemporaryDirectory(prefix='siljangnim-of-build-') as build:
   with tarfile.open(archive) as tar:tar.extractall(build,filter='data')
   framework=next(Path(build).iterdir());project=framework/'apps/myApps/siljangnimGallery';(project/'src').mkdir(parents=True);(project/'bin/data').mkdir(parents=True)
   shutil.copy(inputs/'main.cpp',project/'src/main.cpp');shutil.copy(framework/'scripts/templates/osx/Makefile',project/'Makefile');(project/'config.make').write_text('OF_ROOT = ../../..\n')
   subprocess.run(['make','Release','-j2'],cwd=project,check=True,timeout=1200)
   root.mkdir(exist_ok=True)
   if app.exists():shutil.rmtree(app)
   shutil.copytree(project/'bin/siljangnimGallery.app',app,symlinks=True)
  (root/'.ready').touch()
 subprocess.run([str(exe),str(out)],check=True,timeout=120)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3
 for i,f in enumerate(result['frames']):
  assert f['vertices']==2401 and f['triangles']==4608 and len(f['heights'])==2401 and all(0<=v<=95 for v in f['heights'])
  im=Image.open(out/f'render-{i}.png').convert('RGB');assert im.size==(640,480) and max(ImageStat.Stat(im).stddev)>15
 print('PASS original openFrameworks native OpenGL terrain renders')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

A supplied C++ app calls original ofNoise, ofMesh, ofFbo and image output APIs without changing the engine. Three noise phases generate 2,401 finite heights each and 4,608 triangles. A hidden native OpenGL window renders each 640×480 image. This is a small creative coding example, not every openFrameworks add-on. Two final recipe runs matched the original run byte for byte. The gallery selects prepared images; edit the supplied C++ app and rerun to change the terrain.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
