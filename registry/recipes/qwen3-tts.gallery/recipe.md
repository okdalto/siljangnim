---
id: qwen3-tts.gallery
version: 1
title: One sentence in three built-in voices
capability: qwen3-tts graphics
tier: C
kind: python
packages: ["torch==2.7.1", "torchaudio==2.7.1", "numpy==2.2.6", "transformers==4.57.3", "accelerate==1.12.0", "librosa==0.11.0", "soundfile==0.13.1", "sox==1.5.0", "onnxruntime==1.23.2", "einops==0.8.1", "huggingface-hub==0.36.0", "safetensors==0.7.0", "tokenizers==0.22.2", "Pillow==12.3.0", "scipy==1.16.3", "numba==0.61.2"]
source:
  name: "Qwen3-TTS"
  repo: https://github.com/qwenlm/qwen3-tts
  license: "Apache-2.0"
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

# One sentence in three built-in voices

Original Qwen3-TTS 0.6B CustomVoice synthesizes the same short sentence in three built-in voices, entirely on the local CPU.

원본 Qwen3-TTS 0.6B 모델이 같은 짧은 문장을 세 기본 목소리로 읽습니다. 이 Mac의 CPU에서 직접 합성한 음성이에요.

## Setup

Requires Python 3.12 and sufficient memory for float32 CPU inference (verified on a 16 GB Apple Silicon Mac). Original qwen-tts 0.1.1 inference code and the official ungated 0.6B CustomVoice checkpoint are SHA-256 verified, downloaded on demand and cached (about 2.5 GB of weights). The optional Gradio interface is not installed. No API key, paid service, GPU or reference voice is needed. SoX and FlashAttention are not used by this built-in-voice path; their optional import warnings do not prevent synthesis.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 모델 약 2.5GB는 처음 레시피를 실행할 때만 받아 검증하고 캐시합니다. 메모리 16GB인 Apple Silicon Mac의 CPU에서 확인했으며 합성된 음성은 24kHz, 길이는 각각 2.56·1.68·1.92초입니다. 세 음성 모두 별도 Whisper 모델로 다시 인식해 입력 문장과 일치함을 확인했습니다. 사람의 목소리를 복제하지 않고 모델에 포함된 기본 목소리를 사용합니다. 이 경로에서는 선택 기능인 SoX·FlashAttention이 필요하지 않습니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,time,urllib.request,zipfile
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest()
cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/qwen3-tts';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
def verified(path,item):
 if not path.exists() or path.stat().st_size!=item['size']:return False
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()==item['sha256']
def download(item,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 if verified(path,item):return
 if item['size']<8*1024*1024:
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original Qwen file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  download(sources['package'],root/'qwen.whl')
  with zipfile.ZipFile(root/'qwen.whl') as archive:archive.extractall(root/'source')
  for item in sources['files']:download(item,root/'model'/item['path'])
  (root/'.ready').touch()
 env={**os.environ,'PYTHONPATH':str(root/'source'),'HF_HUB_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','OMP_NUM_THREADS':'2'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(root/'model')],env=env,check=True,timeout=1200)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and all(f['sampleRate']==24000 and f['rms']>.001 for f in result['frames'])
 print('PASS original Qwen3-TTS CPU synthesis with cached official model')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The unchanged original model synthesizes “Welcome to the studio.” using its built-in Ryan, Aiden and Serena voices with greedy generation, seed 17 and float32 CPU inference. Output is original 24 kHz speech, with durations 2.56, 1.68 and 1.92 seconds. Waveforms display min/max samples from each recording. Independent Whisper tiny.en transcription returned the exact sentence for all three recordings. This example does not clone a person or demonstrate the larger model’s instruction controls. The gallery plays prepared local results; edit text and rerun the recipe to synthesize new speech.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
