---
id: opensplat.gallery
version: 1
title: Learning an image with Gaussian primitives
capability: opensplat graphics
tier: C
kind: python
packages: ["torch==2.7.1", "numpy==2.2.6", "Pillow==12.3.0", "cmake==4.4.3"]
source:
  name: "OpenSplat"
  repo: https://github.com/webodm/opensplat
  license: "AGPL-3.0"
io:
  inputs:
  - name: driver.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: native-0.png
    media: file
  - name: native-1.png
    media: file
  - name: native-2.png
    media: file
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
  expect_outputs: ["native-0.png", "native-1.png", "native-2.png", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Learning an image with Gaussian primitives

Original OpenSplat trains 96 Gaussian primitives on the CPU and compares their renders after 1, 100 and 400 optimization steps.

원본 OpenSplat이 CPU에서 가우시안 96개를 학습하며, 1·100·400회 학습한 렌더링 결과를 비교합니다.

## Setup

Requires Python 3.12 and Xcode C++ build tools on macOS. Original OpenSplat and OpenCV 4.10.0 sources are SHA-256 verified and compiled on demand. Source archives, OpenCV libraries and the native executable are cached; first setup can take several minutes. The CPU-only build uses the original CMake targets with no GPU toolkit. A compiler diagnostic switch permits the libtorch header specialization under current Apple Clang; the engine code is unchanged.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

원본 simple_trainer가 제공하는 빨강·흰색·파랑 목표 그림을 가우시안 96개로 학습합니다. 64×64 해상도에서 원본 CPU 투영·래스터화·기울기를 사용하며, 400회 뒤 오차가 초기보다 90% 이상 감소하는지 검사합니다. 처음 실행할 때 OpenCV와 원본 엔진을 컴파일하므로 Xcode C++ 도구가 필요합니다. 단일 이미지 학습 예제이며 여러 사진에서 3D 장면을 복원하는 전체 파이프라인은 아닙니다.

For the first download or native build, call `recipe_run` with `timeout_s: 1800`. If a slow connection exceeds that limit, rerun to reuse completed cache files.

첫 다운로드·컴파일에는 최대 30분의 실행 시간을 지정하세요. 연결이 느려 제한 시간을 넘겼다면 다시 실행해 완료된 캐시 파일을 재사용할 수 있습니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,subprocess,sys,tarfile,urllib.request
import torch
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/opensplat';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
def download(item,path):
 if path.exists() and path.stat().st_size==item['size']:
  with path.open('rb') as f:
   if hashlib.file_digest(f,'sha256').hexdigest()==item['sha256']:return
 pending=path.with_name(path.name+'.tmp')
 with urllib.request.urlopen(item['url'],timeout=180) as r,pending.open('wb') as f:
  while data:=r.read(1024*1024):f.write(data)
 with pending.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==item['sha256'],'Original archive checksum mismatch'
 assert pending.stat().st_size==item['size'];pending.replace(path)
def run(args):subprocess.run([str(a) for a in args],check=True,timeout=1800)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.sources-ready').exists():
  for name in ['engine','opencv']:
   archive=root/(name+'.tar.gz');download(sources[name],archive);dest=root/(name+'-source');dest.mkdir(exist_ok=True)
   with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  (root/'.sources-ready').touch()
 engine=next((root/'engine-source').iterdir());opencv=next((root/'opencv-source').iterdir());cmake=Path(sys.executable).absolute().parent/'cmake'
 prefix=root/'opencv';cvbuild=root/'opencv-build'
 if not (root/'.opencv-ready').exists():
  run([cmake,'-S',opencv,'-B',cvbuild,'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_INSTALL_PREFIX='+str(prefix),'-DBUILD_LIST=core,imgproc,imgcodecs,highgui','-DBUILD_TESTS=OFF','-DBUILD_PERF_TESTS=OFF','-DBUILD_EXAMPLES=OFF','-DBUILD_opencv_apps=OFF','-DBUILD_opencv_python2=OFF','-DBUILD_opencv_python3=OFF','-DWITH_FFMPEG=OFF','-DWITH_OPENEXR=OFF','-DWITH_OPENJPEG=OFF','-DWITH_WEBP=OFF','-DWITH_TIFF=OFF','-DWITH_IPP=OFF','-DWITH_PROTOBUF=OFF','-DWITH_ITT=OFF','-DWITH_AVFOUNDATION=OFF','-DWITH_VTK=OFF'])
  run([cmake,'--build',cvbuild,'--parallel','2']);run([cmake,'--install',cvbuild]);(root/'.opencv-ready').touch()
 # Each Python environment has its own libtorch location. Never reuse a
 # binary linked against a different environment, even with equal versions.
 buildkey=hashlib.sha256((sys.prefix+sys.version+torch.__version__).encode()).hexdigest()[:20];build=root/('build-'+buildkey)
 if not (build/'.ready').exists():
  run([cmake,'-S',engine,'-B',build,'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_PREFIX_PATH='+torch.utils.cmake_prefix_path,'-DOPENCV_DIR='+str(prefix/'lib/cmake/opencv4'),'-DGPU_RUNTIME=CPU','-DOPENSPLAT_BUILD_SIMPLE_TRAINER=ON','-DOPENSPLAT_USE_PCH=OFF','-DCMAKE_CXX_FLAGS=-Wno-invalid-specialization'])
  run([cmake,'--build',build,'--target','simple_trainer','--parallel','2']);(build/'.ready').touch()
 env={**os.environ,'OMP_NUM_THREADS':'1','VECLIB_MAXIMUM_THREADS':'1'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(build/'simple_trainer')],check=True,env=env,timeout=300)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and result['lossRatio']<.1
 print('PASS original OpenSplat CPU projection, rasterization and gradient-based training')
```

## Verify

The original trainer was run repeatedly with cached dependencies. CPU optimization has small numeric variation: both runs must reduce loss by at least 90%, final loss must agree within 5%, the full loss trajectory within 0.001 and native image mean absolute RGB difference within 1 on a 0–255 scale. Observed final losses were 0.0127797 and 0.0127956; maximum trajectory difference was 0.0002542 and maximum image mean difference was 0.342. Initial and intermediate image pixels matched exactly.

원본 학습기를 캐시로 반복 실행했습니다. 두 실행 모두 초기 오차가 90% 이상 감소했고, 최종 오차 차이 5% 이내·전체 오차 곡선 차이 0.001 이내·이미지 평균 RGB 차이 1 이내 기준을 통과했습니다. 실제 최대 오차 곡선 차이는 0.0002542, 이미지 평균 차이는 0.342였으며 초기·중간 픽셀은 정확히 일치했습니다.

## Scope

The original simple_trainer executable fits its own red/white/blue quadrant target, using 96 Gaussian primitives, a fixed seed, 64×64 pixels and Adam optimization. Original CPU projection, differentiable rasterization and gradients run for 400 steps. The measured image MSE falls from about 0.455 to 0.013; the driver requires a reduction of at least 90%. The gallery compares the original target with native renders at steps 1, 100 and 400. This is single-view Gaussian fitting, not multi-view scene reconstruction or a COLMAP camera pipeline.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
