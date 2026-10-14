---
id: nerfstudio.gallery
version: 1
title: Learning three views with a small NeRF
capability: nerfstudio graphics
tier: C
kind: python
packages: ["torch==2.7.1", "torchvision==0.22.1", "torchmetrics==1.8.2", "numpy==1.26.4", "jaxtyping==0.3.3", "rich==14.1.0", "tyro==0.9.35", "nerfacc==0.5.2", "viser==1.0.0", "trimesh==4.9.0", "scikit-image==0.25.2", "scipy==1.16.3", "opencv-python-headless==4.10.0.84", "pytorch-msssim==1.0.0", "tensorboard==2.20.0", "tensorly==0.9.0", "Pillow==12.3.0", "matplotlib==3.10.6"]
source:
  name: "Nerfstudio"
  repo: https://github.com/nerfstudio-project/nerfstudio
  license: "Apache-2.0"
io:
  inputs:
  - name: driver.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: native-0-0.png
    media: file
  - name: native-0-1.png
    media: file
  - name: native-0-2.png
    media: file
  - name: native-2000-0.png
    media: file
  - name: native-2000-1.png
    media: file
  - name: native-2000-2.png
    media: file
  - name: native-500-0.png
    media: file
  - name: native-500-1.png
    media: file
  - name: native-500-2.png
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
  - name: target-0-0.png
    media: file
  - name: target-0-1.png
    media: file
  - name: target-0-2.png
    media: file
  - name: target-2000-0.png
    media: file
  - name: target-2000-1.png
    media: file
  - name: target-2000-2.png
    media: file
  - name: target-500-0.png
    media: file
  - name: target-500-1.png
    media: file
  - name: target-500-2.png
    media: file
verify:
  params: {}
  expect_outputs: ["native-0-0.png", "native-0-1.png", "native-0-2.png", "native-2000-0.png", "native-2000-1.png", "native-2000-2.png", "native-500-0.png", "native-500-1.png", "native-500-2.png", "render-0.png", "render-1.png", "render-2.png", "result.json", "target-0-0.png", "target-0-1.png", "target-0-2.png", "target-2000-0.png", "target-2000-1.png", "target-2000-2.png", "target-500-0.png", "target-500-1.png", "target-500-2.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Learning three views with a small NeRF

Original Nerfstudio trains a coarse/fine NeRF on three synthetic views, showing the model before training and after 500 and 2,000 updates.

원본 Nerfstudio가 직접 만든 세 시점을 학습합니다. 학습 전·500회·2,000회 후의 NeRF 렌더링을 입력과 비교해 보세요.

## Setup

Requires Python 3.12. Original Nerfstudio source and the AlexNet weights required by its unmodified LPIPS metric constructor (about 244 MB) are downloaded on demand, SHA-256 verified and cached. The original Vanilla NeRF coarse/fine fields, samplers, volumetric renderer and loss run on the CPU. No CUDA kernels, pretrained NeRF, account or API key are needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

합성한 색 구체를 -25·0·25도에서 본 24×24 입력 세 장으로 원본 NeRF를 2,000회 학습합니다. 학습 오차는 처음보다 90% 이상 줄어들지만 저해상도 결과에는 흐림과 잔상이 남습니다. 학습에 쓰지 않은 시점의 정확도나 실제 사진 재구성을 검증한 예제는 아닙니다. 원본 모델 생성자가 요구하는 AlexNet 가중치 약 244MB를 캐시하며, 화면의 결과는 NeRF가 직접 계산합니다.

For the first download or native build, call `recipe_run` with `timeout_s: 1800`. If a slow connection exceeds that limit, rerun to reuse completed cache files.

첫 다운로드·컴파일에는 최대 30분의 실행 시간을 지정하세요. 연결이 느려 제한 시간을 넘겼다면 다시 실행해 완료된 캐시 파일을 재사용할 수 있습니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,tarfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/nerfstudio';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original Nerfstudio file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  archive=root/'engine.tar.gz';download(sources['engine'],archive);dest=root/'engine';dest.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  download(sources['metric'],root/'torch/hub/checkpoints/alexnet-owt-7be5be79.pth')
  (root/'.ready').touch()
 engine=next((root/'engine').iterdir());env={**os.environ,'TORCH_HOME':str(root/'torch'),'OMP_NUM_THREADS':'2','VECLIB_MAXIMUM_THREADS':'2'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(engine),str(root/'torch')],env=env,check=True,timeout=600)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and result['frames'][-1]['loss']<result['frames'][0]['loss']*.1
 print('PASS original Nerfstudio CPU coarse/fine NeRF fitting with cached dependencies')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The driver supplies three analytical colored-sphere views at -25, 0 and 25 degrees, each 24 by 24 pixels, and fits the original model for 2,000 Adam updates. The training sampler mixes foreground and uniformly sampled rays. The gallery compares those training views before training and after 500 and 2,000 updates. These are low-resolution, imperfect training reconstructions; no held-out view accuracy, real photographs, camera estimation, GUI or Gaussian-splatting workflow is claimed. The AlexNet metric weights are loaded by the original constructor but do not supply or generate the displayed images.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
