---
id: triposr.gallery
version: 1
title: A chair reconstructed from one drawing
capability: triposr graphics
tier: C
kind: python
packages: ["torch==2.7.1", "torchvision==0.22.1", "numpy==1.26.4", "omegaconf==2.3.0", "Pillow==10.1.0", "einops==0.7.0", "transformers==4.35.0", "trimesh==4.0.5", "rembg==2.0.57", "huggingface-hub==0.17.3", "imageio==2.37.0", "imageio-ffmpeg==0.6.0", "onnxruntime==1.23.2", "opencv-python-headless==4.10.0.84", "scipy==1.16.3", "scikit-image==0.24.0", "pybind11==2.13.6", "cmake==4.0.3", "ninja==1.11.1.4", "setuptools==80.9.0"]
source:
  name: "TripoSR"
  repo: https://github.com/vast-ai-research/triposr
  license: "MIT"
io:
  inputs:
  - name: chair.png
    media: file
  - name: driver.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: mesh.ply
    media: file
  - name: native-0.png
    media: file
  - name: native-1.png
    media: file
  - name: native-2.png
    media: file
  - name: preprocessed.png
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
  expect_outputs: ["mesh.ply", "native-0.png", "native-1.png", "native-2.png", "preprocessed.png", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# A chair reconstructed from one drawing

Original TripoSR reconstructs a colored 3D chair from a supplied drawing, with CPU radiance rendering and native mesh extraction.

직접 만든 의자 그림 한 장을 원본 TripoSR에 넣어 CPU에서 입체를 복원하고 여러 방향의 영상과 메시를 얻었어요.

## Setup

Requires Python 3.12, Apple command-line C++ build tools and memory for float32 CPU inference (verified on a 16 GB Apple Silicon Mac). Original TripoSR code, its official MIT checkpoint (about 1.68 GB), pinned DINO configuration and original torchmcubes source are SHA-256 verified and cached on first recipe execution. The CPU extension is compiled against the recipe’s exact Python/PyTorch environment. No CUDA, API key or background-removal model is needed for the supplied transparent input.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 가중치 약 1.68GB와 원본 소스를 최초 실행 때 받아 검증하고 캐시합니다. 16GB Apple Silicon Mac의 CPU에서 확인했으며 C++ 빌드 도구가 필요합니다. 투명 입력에 원본 전처리를 적용해 5,812개 꼭짓점·11,528개 삼각형을 얻었습니다. 원본 카메라 함수의 축 선택 문제를 피하려고 네 시점을 계산하고 앞의 세 시점을 보여줍니다. 원본 코드는 수정하지 않았으며, 실제 광선 방향과 영상의 공간 변화도 검증합니다. 한 장에서 추론한 형상이므로 뒷면이나 치수를 정확한 스캔으로 해석하지 마세요.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,shutil,subprocess,sys,tarfile,tempfile,time,urllib.request
import torch,pybind11
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/triposr';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
def verified(path,item):
 if not path.exists() or path.stat().st_size!=item['size']:return False
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()==item['sha256']
def download(item,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 if verified(path,item):return
 if item['size']<64*1024*1024:
  with urllib.request.urlopen(item['url'],timeout=180) as r:data=r.read()
  pending=path.with_name(path.name+'.tmp');pending.write_bytes(data)
 else:
  def piece(start):
   end=min(start+8*1024*1024,item['size']);p=path.with_name(path.name+f'.{start}.part')
   for attempt in range(6):
    offset=p.stat().st_size if p.exists() else 0
    if offset==end-start:return p
    if offset>end-start:p.unlink();offset=0
    try:
     req=urllib.request.Request(item['url']+f'?download=true&segment={start}',headers={'Range':f'bytes={start+offset}-{end-1}'})
     with urllib.request.urlopen(req,timeout=120) as r,p.open('ab') as f:
      if r.status!=206 or not r.headers.get('Content-Range','').startswith(f'bytes {start+offset}-{end-1}/'):raise RuntimeError('Unexpected model range response')
      while data:=r.read(256*1024):f.write(data)
     if p.stat().st_size!=end-start:raise RuntimeError('Incomplete model segment')
     return p
    except Exception:
     if attempt==5:raise
     time.sleep(1+attempt)
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:parts=list(pool.map(piece,range(0,item['size'],8*1024*1024)))
  pending=path.with_name(path.name+'.tmp')
  with pending.open('wb') as f:
   for p in parts:
    with p.open('rb') as r:
     while data:=r.read(1024*1024):f.write(data)
    p.unlink()
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original TripoSR file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  for name in ['engine','mcubes']:
   archive=root/(name+'.tar.gz');download(sources[name],archive);dest=root/name;dest.mkdir(exist_ok=True)
   with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  for item in sources['model']['files']:download(item,root/'model'/item['path'])
  dino=sources['dino'];hf=root/'hf/models--facebook--dino-vitb16';(hf/'refs').mkdir(parents=True,exist_ok=True);(hf/'refs/main').write_text(dino['revision']);download(dino,hf/'snapshots'/dino['revision']/'config.json')
  (root/'.ready').touch()
 engine=next((root/'engine').iterdir());mcubes=next((root/'mcubes').iterdir())
 # Extension libraries link against this exact Python environment's PyTorch.
 buildkey=hashlib.sha256((sys.prefix+sys.version+torch.__version__).encode()).hexdigest()[:20];build=root/('build-'+buildkey);cmake=Path(sys.executable).absolute().parent/'cmake'
 if not (build/'.ready').exists():
  subprocess.run([str(cmake),'-S',str(mcubes),'-B',str(build),'-DCMAKE_BUILD_TYPE=Release','-DSKBUILD_PROJECT_NAME=torchmcubes','-DSKBUILD_PROJECT_VERSION=0.1.0','-DCMAKE_PREFIX_PATH='+torch.utils.cmake_prefix_path+';'+pybind11.get_cmake_dir(),'-DPython_EXECUTABLE='+str(Path(sys.executable).absolute())],check=True,timeout=300)
  subprocess.run([str(cmake),'--build',str(build),'--parallel','2'],check=True,timeout=600);(build/'.ready').touch()
 env={**os.environ,'PYTHONPATH':os.pathsep.join(map(str,[engine,mcubes,build/'cxx'])),'HF_HUB_CACHE':str(root/'hf'),'HUGGINGFACE_HUB_CACHE':str(root/'hf'),'HF_HUB_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','OMP_NUM_THREADS':'2'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(root/'model')],env=env,check=True,timeout=1200)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and all(f['vertices']>100 and f['triangles']>100 for f in result['frames'])
 print('PASS original TripoSR CPU reconstruction, native radiance renders and extracted mesh')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied chair is an original procedural drawing with transparency. Original foreground resizing and gray-background preprocessing feed the unchanged reconstruction network. The result contains 5,812 native vertices and 11,528 triangles on a 64-cubed extraction grid, plus native 160×160 radiance renders. The original camera helper calls torch.cross without an explicit axis; exactly three cameras select the wrong axis in PyTorch. A four-camera orbit avoids that ambiguity without editing upstream code; the gallery shows its first three views (0, 90 and 180 degrees). Camera direction variance is checked, as are finite model features, mesh geometry and spatial image variation. This is inferred geometry from one image, not a dimensionally accurate scan or a complete unseen back view. mesh.ply is included.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
