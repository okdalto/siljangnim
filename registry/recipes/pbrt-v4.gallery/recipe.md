---
id: pbrt-v4.gallery
version: 1
title: Lens apertures in a native spectral renderer
capability: pbrt-v4 graphics
tier: C
kind: python
packages: ["cmake==4.4.3", "Pillow==12.3.0"]
source:
  name: "pbrt-v4"
  repo: https://github.com/mmp/pbrt-v4
  license: "Apache-2.0"
io:
  inputs:
  - name: scene.pbrt
    media: file
  - name: sources.json
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

# Lens apertures in a native spectral renderer

PBRT v4 renders a supplied scene at three lens apertures with its original spectral CPU path tracer and 128 samples per pixel.

PBRT v4 원본 분광 CPU 경로 추적기로 직접 만든 장면을 세 렌즈 조리개에서 픽셀당 128샘플로 렌더했어요.

## Setup

Requires Apple Silicon macOS, Xcode command-line tools and Python 3.12+. The recipe verifies and caches PBRT revision b4ce9687e6c695f5582997c61b0c66cf064bdb4a, its exact submodule archives and Imath 3.1.12. CMake 4.4.3 builds the original CPU renderer with three compilation jobs and caches the binary. Archive SHA-256 checks replace Git submodule inspection; the original renderer is unchanged. CUDA and an NVIDIA GPU are not needed. The first compilation takes several minutes and needs build disk space.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Apple Silicon macOS와 Xcode 명령줄 도구가 필요합니다. 고정한 원본 소스·하위 모듈을 체크섬으로 확인한 뒤 CPU 버전을 빌드해 캐시합니다. CUDA는 필요하지 않습니다. 처음에는 수 분의 컴파일 시간과 빌드 저장 공간이 필요합니다. 직접 만든 장면에서 조리개만 바꾸어 원본 분광 경로 추적으로 렌더했습니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
from PIL import Image,ImageStat
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This verified CPU build targets Apple Silicon macOS.')
if not shutil.which('clang++'):raise RuntimeError('Install Xcode command-line tools for the original pbrt CPU build.')
cmake=pathlib.Path(sys.executable).absolute().parent/'cmake'
if not cmake.is_file():raise RuntimeError('Install the pinned cmake Python package in this recipe environment.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'pbrt-v4';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256(b'pbrt-cpu-macos-v1'+(inputs/'sources.json').read_bytes()).hexdigest();root=cache/key;source=root/'source';build=root/'build';binary=build/'pbrt'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  source.mkdir(parents=True,exist_ok=True)
  for item in sources:
   archive=cache/(item['sha256']+'.tar.gz')
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=180) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('pbrt source checksum mismatch: '+item['repo'])
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   destination=source/item['path'];destination.mkdir(parents=True,exist_ok=True)
   with tarfile.open(archive) as tar:
    for member in tar.getmembers():
     part=member.name.partition('/')[2]
     if not part:continue
     if item['repo'].endswith('/openvdb') and not part.startswith('nanovdb/'):continue
     member.name=part;tar.extract(member,destination,filter='data')
  subprocess.run([str(cmake),'-S',str(source),'-B',str(build),'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_DISABLE_FIND_PACKAGE_Git=TRUE','-DCMAKE_POLICY_VERSION_MINIMUM=3.5','-DFETCHCONTENT_SOURCE_DIR_IMATH='+str(source/'src/ext/imath')],check=True)
  subprocess.run([str(cmake),'--build',str(build),'--target','pbrt_exe','-j','3'],check=True)
  (root/'ready').write_text(key)
 frames=[]
 with tempfile.TemporaryDirectory(prefix='siljangnim-pbrt-') as tmp:
  for i,radius in enumerate([0,.25,.6]):
   text=(inputs/'scene.pbrt').read_text().replace('LENS_RADIUS',str(radius)).replace('OUTPUT_IMAGE',str(output/f'render-{i}.png'))
   scene=pathlib.Path(tmp)/'scene.pbrt';scene.write_text(text)
   subprocess.run([str(binary),'--nthreads','2','--seed','17',str(scene)],check=True,timeout=180)
   frames.append(dict(lensRadius=radius,samples=128,focalDistance=9.5))
 (output/'result.json').write_text(json.dumps(dict(frames=frames)))
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(384,384) and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original pbrt spectral CPU path tracing and three lens apertures')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied scene defines three coated diffuse spheres, a ground plane, distant and environment light, and a perspective camera. The original spectral path integrator uses 128 Sobol samples per pixel, seed 17 and maximum depth six. Only lens radius changes between 0, 0.25 and 0.6, at focal distance 9.5. Original PBRT exports the 384 by 384 PNGs; native process success, dimensions, nonblank content and distinct aperture results are checked. No external scene or rendered sample is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
