---
id: cogvideox.gallery
version: 1
title: Encoding and reconstructing a short animation
capability: cogvideox graphics
tier: C
kind: python
packages: ["torch==2.7.1", "torchvision==0.22.1", "diffusers==0.33.1", "transformers==4.51.3", "huggingface-hub==0.30.2", "safetensors==0.5.3", "accelerate==1.10.1", "imageio==2.37.0", "imageio-ffmpeg==0.6.0", "Pillow==12.3.0", "numpy==1.26.4"]
source:
  name: "CogVideoX"
  repo: https://github.com/zai-org/cogvideo
  license: "Code \u00b7 2B Apache-2.0 / 5B separate"
io:
  inputs:
  - name: driver.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: decoded-0.png
    media: file
  - name: decoded-1.png
    media: file
  - name: decoded-2.png
    media: file
  - name: decoded-3.png
    media: file
  - name: decoded-4.png
    media: file
  - name: decoded-5.png
    media: file
  - name: decoded-6.png
    media: file
  - name: decoded-7.png
    media: file
  - name: decoded-8.png
    media: file
  - name: encoded.pt
    media: file
  - name: frames.png
    media: file
  - name: input-0.png
    media: file
  - name: input-1.png
    media: file
  - name: input-2.png
    media: file
  - name: input-3.png
    media: file
  - name: input-4.png
    media: file
  - name: input-5.png
    media: file
  - name: input-6.png
    media: file
  - name: input-7.png
    media: file
  - name: input-8.png
    media: file
  - name: input.mkv
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: render-3.png
    media: file
  - name: render-4.png
    media: file
  - name: render-5.png
    media: file
  - name: render-6.png
    media: file
  - name: render-7.png
    media: file
  - name: render-8.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["decoded-0.png", "decoded-1.png", "decoded-2.png", "decoded-3.png", "decoded-4.png", "decoded-5.png", "decoded-6.png", "decoded-7.png", "decoded-8.png", "encoded.pt", "frames.png", "input-0.png", "input-1.png", "input-2.png", "input-3.png", "input-4.png", "input-5.png", "input-6.png", "input-7.png", "input-8.png", "input.mkv", "render-0.png", "render-1.png", "render-2.png", "render-3.png", "render-4.png", "render-5.png", "render-6.png", "render-7.png", "render-8.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Encoding and reconstructing a short animation

The official CogVideoX VAE demo encodes and decodes a locally made animation on the CPU. Compare all nine input and reconstructed frames.

공식 CogVideoX VAE 예제가 직접 만든 애니메이션을 CPU에서 압축하고 복원합니다. 입력과 복원 결과의 아홉 프레임을 비교해 보세요.

## Setup

Requires Python 3.12. Original CogVideo source and the official public CogVideoX-2B VAE checkpoint (about 862 MB) are downloaded on demand, SHA-256 verified and cached. The unmodified official cli_vae_demo.py encode_video and decode_video functions run with float32 on the CPU, using the pretrained Diffusers AutoencoderKLCogVideoX implementation. No GPU, account or API key is required.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

직접 만든 96×96 크기의 아홉 프레임 애니메이션을 공식 영상 VAE로 인코딩하고 디코딩했습니다. 공식 예제 함수를 수정하지 않고 CPU·float32로 호출하며 시드는 17입니다. 약 862MB의 공개 모델을 필요할 때 받아 캐시합니다. 영상 생성기의 압축·복원 부분을 실행한 예제이며, 문장으로 새 영상을 만드는 확산 모델은 실행하지 않습니다.

For the first download or native build, call `recipe_run` with `timeout_s: 1800`. If a slow connection exceeds that limit, rerun to reuse completed cache files.

첫 다운로드·컴파일에는 최대 30분의 실행 시간을 지정하세요. 연결이 느려 제한 시간을 넘겼다면 다시 실행해 완료된 캐시 파일을 재사용할 수 있습니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,tarfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/cogvideox';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
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
     req=urllib.request.Request(item['url']+f'?download=true&segment={start}&offset={offset}',headers={'Range':f'bytes={start+offset}-{end-1}'})
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original CogVideoX file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  archive=root/'engine.tar.gz';download(sources['engine'],archive);dest=root/'engine';dest.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  for item in sources['model']['files']:download(item,root/'model'/item['path'])
  (root/'.ready').touch()
 engine=next((root/'engine').iterdir());env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','OMP_NUM_THREADS':'2','VECLIB_MAXIMUM_THREADS':'2'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(engine),str(root/'model')],env=env,check=True,timeout=600)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==9 and result['inputFrames']==9 and result['latentShape'][1]==16
 print('PASS original CogVideoX CPU video encoding and decoding with cached dependencies')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

One own nine-frame, 96 by 96 pixel animation passes through the official pretrained causal video VAE. The original demo loads a lossless video, samples its latent distribution with seed 17, and decodes it. The gallery plays the actual input/reconstruction pairs and supports pausing and frame selection. This exercises the original video encoding/decoding demo; it does not run the text-conditioned diffusion transformer or claim text-to-video generation. No upstream demo video, pretrained latent or example output is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
