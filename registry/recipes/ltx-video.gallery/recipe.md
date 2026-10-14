---
id: ltx-video.gallery
version: 1
title: Reconstructing motion through a causal video VAE
capability: ltx-video graphics
tier: C
kind: python
packages: ["torch==2.7.1", "torchvision==0.22.1", "diffusers==0.33.1", "transformers==4.51.3", "huggingface-hub==0.30.2", "safetensors==0.5.3", "sentencepiece==0.2.1", "einops==0.8.1", "timm==1.0.19", "accelerate==1.10.1", "imageio==2.37.0", "imageio-ffmpeg==0.6.0", "av==15.1.0", "PyYAML==6.0.2", "Pillow==12.3.0", "numpy==1.26.4"]
source:
  name: "LTX-Video"
  repo: https://github.com/lightricks/ltx-video
  license: "Apache-2.0 code / weights separate"
io:
  inputs:
  - name: driver.py
    media: file
  - name: sources.json
    media: file
  - name: vae-header.json
    media: file
  outputs:
  - name: encoded.npy
    media: file
  - name: frames.png
    media: file
  - name: input.mkv
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-10.png
    media: file
  - name: render-11.png
    media: file
  - name: render-12.png
    media: file
  - name: render-13.png
    media: file
  - name: render-14.png
    media: file
  - name: render-15.png
    media: file
  - name: render-16.png
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
  - name: render-9.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["encoded.npy", "frames.png", "input.mkv", "render-0.png", "render-1.png", "render-10.png", "render-11.png", "render-12.png", "render-13.png", "render-14.png", "render-15.png", "render-16.png", "render-2.png", "render-3.png", "render-4.png", "render-5.png", "render-6.png", "render-7.png", "render-8.png", "render-9.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Reconstructing motion through a causal video VAE

Original LTX-Video VAE functions encode and reconstruct a locally made 17-frame animation on the CPU, with playback and frame comparison.

원본 LTX-Video VAE 함수가 직접 만든 17프레임 애니메이션을 CPU에서 압축하고 복원합니다. 재생하거나 프레임별로 입력과 비교해 보세요.

## Setup

Requires Python 3.12 and about 6 GB of free disk for first-time cache preparation. Original LTX-Video source is pinned and SHA-256 verified. Only the original VAE tensor ranges (about 2.49 GB) are fetched from the official public 0.9.6 distilled checkpoint, checked against recorded SHA-256 hashes and assembled into a standalone safetensors file with the original VAE configuration and unchanged tensor values. The final file is also SHA-256 verified and cached. The original CausalVideoAutoencoder, vae_encode, channel normalization and vae_decode execute in float32 on the CPU. No GPU, account or API key is required.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

직접 만든 128×128 크기의 17프레임 영상을 원본 VAE로 압축하고 복원합니다. 시드는 17, 디코딩 시점은 깨끗한 잠재값에 해당하는 0이며 CPU·float32로 실행합니다. 공식 체크포인트에서 필요한 가중치 약 2.49GB만 부분 다운로드하고 각 구간과 최종 파일의 해시를 확인해 캐시합니다. 전체 원본 체크포인트와 잠재값·복원 이미지가 일치했습니다. 첫 캐시 준비에는 여유 공간 약 6GB가 필요합니다. 문장으로 영상을 생성하는 확산 모델은 이 예제의 범위에 포함하지 않습니다.

For the first download or native build, call `recipe_run` with `timeout_s: 1800`. If a slow connection exceeds that limit, rerun to reuse completed cache files.

첫 다운로드·컴파일에는 최대 30분의 실행 시간을 지정하세요. 연결이 느려 제한 시간을 넘겼다면 다시 실행해 완료된 캐시 파일을 재사용할 수 있습니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,struct,subprocess,sys,tarfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/ltx-video';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original LTX-Video file checksum mismatch')
 pending.replace(path)
def vae_piece(item):
 start=item['start'];end=start+item['size'];p=root/'ranges'/f'{start}.bin';p.parent.mkdir(exist_ok=True)
 if verified(p,item):return p
 for attempt in range(8):
  offset=p.stat().st_size if p.exists() else 0
  if offset>=item['size']:p.unlink();offset=0
  try:
   req=urllib.request.Request(sources['model']['url']+f'?download=true&vae_segment={start}&offset={offset}',headers={'Range':f'bytes={start+offset}-{end-1}'})
   with urllib.request.urlopen(req,timeout=120) as r,p.open('ab') as f:
    if r.status!=206 or not r.headers.get('Content-Range','').startswith(f'bytes {start+offset}-{end-1}/'):raise RuntimeError('Unexpected VAE byte range response')
    while data:=r.read(256*1024):f.write(data)
   if not verified(p,item):raise RuntimeError('VAE segment checksum mismatch')
   return p
  except Exception:
   if attempt==7:raise
   time.sleep(1+attempt)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  archive=root/'engine.tar.gz';download(sources['engine'],archive);dest=root/'engine';dest.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:parts=list(pool.map(vae_piece,sources['model']['ranges']))
  header=(inputs/'vae-header.json').read_bytes();pending=root/'vae.partial'
  with pending.open('wb') as f:
   f.write(struct.pack('<Q',len(header)));f.write(header)
   for p in parts:
    with p.open('rb') as r:
     while data:=r.read(1024*1024):f.write(data)
  model=sources['model']
  if not verified(pending,{'size':model['vae_size'],'sha256':model['vae_sha256']}):raise RuntimeError('Extracted original VAE checksum mismatch')
  pending.replace(root/'vae.safetensors')
  for p in parts:p.unlink()
  (root/'.ready').touch()
 engine=next((root/'engine').iterdir());env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','OMP_NUM_THREADS':'2','VECLIB_MAXIMUM_THREADS':'2'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(engine),str(root/'vae.safetensors')],env=env,check=True,timeout=600)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==17 and result['reconstructionMSE']<.02
 print('PASS original LTX-Video CPU causal VAE with cached original tensor ranges')
```

## Verify

The original CPU VAE was executed repeatedly. The extracted VAE matched the complete official checkpoint exactly in latent tensor values and decoded images. First, middle and last HTTP byte ranges were independently downloaded and matched their recorded SHA-256 hashes. Two final cached runs matched byte for byte for all prepared outputs, including the NumPy latent tensor. The driver requires finite values and reconstruction MSE below 0.02 (observed about 0.000786).

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

One own 17-frame animation at 128 by 128 pixels is encoded and decoded with seed 17 and a clean-latent decoding timestep of zero. The gallery plays the actual input/reconstruction pairs and supports pausing and frame selection. This executes the original video VAE component. Text-to-video diffusion and prompt enhancement are outside this example. The extracted tensor values and reconstructed images matched those produced from the complete original checkpoint. No upstream demo video, supplied latent or example output is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
