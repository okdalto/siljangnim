---
id: stable-audio-tools.gallery
version: 1
title: Short audio textures from three seeds
capability: stable-audio-tools graphics
tier: C
kind: python
packages: ["torch==2.7.1", "torchaudio==2.7.1", "numpy==2.2.6", "diffusers==0.35.1", "huggingface-hub==0.36.0", "safetensors==0.7.0", "accelerate==1.12.0", "torchsde==0.2.6", "scipy==1.16.3", "soundfile==0.13.1", "tqdm==4.67.1", "Pillow==12.3.0"]
source:
  name: "Stable Audio Tools"
  repo: https://github.com/stability-ai/stable-audio-tools
  license: "MIT code / weight terms separate"
io:
  inputs:
  - name: driver.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: audio-0.wav
    media: file
  - name: audio-1.wav
    media: file
  - name: audio-2.wav
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["audio-0.wav", "audio-1.wav", "audio-2.wav", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Short audio textures from three seeds

Original Stable Audio Tools DDIM sampling and a pretrained Harmonai network generate three short stereo audio textures on the CPU.

원본 Stable Audio Tools 샘플러와 Harmonai 학습 모델로 CPU에서 세 가지 짧은 스테레오 소리를 생성합니다.

## Setup

Requires Python 3.12 and memory for float32 CPU inference. Original Stable Audio Tools code and the public Harmonai jmann-small-190k Dance Diffusion checkpoint (about 886 MB) are SHA-256 verified, downloaded on demand and cached. Verified on a 16 GB Apple Silicon Mac. This standalone sampler path does not import the optional model-registry constructors and needs no API key or gated model access.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공개 Harmonai 모델 약 886MB를 필요할 때 받아 캐시합니다. 원본 DDIM 샘플러를 48단계 실행해 시드마다 약 1.37초의 스테레오 소리를 생성했습니다. 듣기 쉽게 최대 진폭을 0.9로 맞추고 원래 진폭과 배율도 기록합니다. 문장으로 음악을 지시하는 Stable Audio Open 예제는 아니며, 조건 없이 생성하는 Dance Diffusion 소리 예제입니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,tarfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/stable-audio-tools';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original Stable Audio Tools file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  archive=root/'engine.tar.gz';download(sources['engine'],archive);dest=root/'engine';dest.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  for item in sources['model']['files']:download(item,root/'model'/item['path'])
  (root/'.ready').touch()
 engine=next((root/'engine').iterdir());env={**os.environ,'PYTHONPATH':str(engine),'OMP_NUM_THREADS':'2','HF_HUB_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(engine),str(root/'model')],env=env,check=True,timeout=1800)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and all(f['samples']==65536 and f['sampleRate']==48000 and len(f['trace'])==48 for f in result['frames'])
 print('PASS original Stable Audio Tools original DDIM sampler with pretrained Dance Diffusion and cached weights')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The unchanged sample_v DDIM sampler executes 48 steps with eta=0 for seeds 17, 29 and 43. It calls the original pretrained Diffusers UNet1DModel; the adapter only unwraps its velocity result. Each output has 65,536 stereo samples at 48 kHz, about 1.37 seconds. Audio is peak-normalized to 0.9 for playback; raw peak, playback gain and all 48 denoising RMS values are recorded. These are unconditional Dance Diffusion textures, not prompt-conditioned Stable Audio Open music. No upstream demo recordings are used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
