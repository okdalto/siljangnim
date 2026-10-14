---
id: ace-step.gallery
version: 1
title: Ten-second instrumental sketches from text
capability: ace-step graphics
tier: C
kind: python
packages: ["torch==2.10.0", "torchaudio==2.10.0", "numpy==2.2.6", "transformers==4.57.3", "diffusers==0.37.0", "safetensors==0.7.0", "huggingface-hub==0.36.0", "accelerate==1.12.0", "einops==0.8.1", "scipy==1.16.3", "soundfile==0.13.1", "loguru==0.7.3", "vector-quantize-pytorch==1.27.15", "numba==0.63.1", "matplotlib==3.10.6", "Pillow==12.3.0", "PyYAML==6.0.2", "pandas==2.3.3", "sentencepiece==0.2.1", "peft==0.18.0", "pytorch-wavelets==1.3.0", "PyWavelets==1.9.0", "diskcache==5.6.3"]
source:
  name: "ACE-Step 1.5"
  repo: https://github.com/ace-step/ACE-Step-1.5
  license: "MIT"
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

# Ten-second instrumental sketches from text

Original ACE-Step 1.5 Turbo generates piano, percussion and synthesizer sketches from text on Apple Silicon.

원본 ACE-Step 1.5 Turbo 모델이 이 Mac에서 문장을 읽고 피아노·타악기·신시사이저 연주를 각각 10초씩 생성합니다.

## Setup

Requires Python 3.12, Apple Silicon with MPS and sufficient unified memory (verified on a 16 GB Mac). Reserve at least 20 GB of free disk for the 6.34 GB checkpoint, Python dependencies and temporary memory swap. Pinned original ACE-Step 1.5 code, Turbo model, VAE and Qwen3 embedding model are downloaded on demand, SHA-256 verified and cached. Original component loaders select float16 for MPS; the model algorithms are unchanged. The original code synchronization helper copies pinned source model definitions into the private checkpoint cache. No API key or separate NVIDIA GPU is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

원본 프로젝트의 후속 버전인 ACE-Step 1.5를 사용합니다. 모델 약 6.34GB와 실행 의존성·임시 메모리 공간을 위해 디스크 여유 20GB 이상을 권장합니다. Apple Silicon의 MPS에서 원본 모델을 float16으로 실행하고, 세 문장마다 8단계 추론으로 10초 연주를 생성합니다. 선택 기능인 언어 모델의 추론·문장 재작성과 학습·웹 화면은 실행하지 않습니다. 입력 문장은 driver.py에서 바꿀 수 있습니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,tarfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/ace-step';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original ACE-Step 1.5 file checksum mismatch')
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
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and all(f['samples']==480000 and f['sampleRate']==48000 and f['steps']==8 for f in result['frames'])
 print('PASS original ACE-Step 1.5 text-to-music and cached weights')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

Three supplied instrumental prompts generate 10 seconds of 48 kHz stereo music each, using seed 17 and eight Turbo diffusion steps. Original caption encoding, diffusion, VAE decoding and peak normalization run locally. Optional 5 Hz language-model reasoning, prompt rewriting, voice conditioning, LoRA training and the web interface are not loaded. This example uses the original project’s ACE-Step 1.5 successor, not its older v1 checkpoint. The gallery plays these locally generated recordings; edit the supplied prompts in driver.py and rerun to recompute.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
