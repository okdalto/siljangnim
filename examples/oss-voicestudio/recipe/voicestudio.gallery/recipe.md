---
id: voicestudio.gallery
version: 1
title: Reading a sentence through the studio backend
capability: voicestudio graphics
tier: C
kind: python
packages: ["torch==2.7.1", "numpy==2.2.6", "espeakng-loader==0.2.4", "phonemizer==3.3.0", "onnxruntime==1.23.2", "huggingface-hub==0.36.0", "soundfile==0.13.1", "Pillow==12.3.0"]
source:
  name: "VoiceStudio"
  repo: https://github.com/debpalash/voicestudio
  license: "AGPL-3.0"
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

# Reading a sentence through the studio backend

Original VoiceStudio calls its KittenTTS backend to synthesize one sentence in three preset voices on the local CPU.

원본 VoiceStudio의 KittenTTS 백엔드가 같은 문장을 세 기본 목소리로 읽습니다. 이 Mac의 CPU에서 직접 생성한 음성이에요.

## Setup

Requires Python 3.12. Pinned original VoiceStudio and KittenTTS source code and the official public kitten-tts-mini-0.8 checkpoint (about 82 MB including voices) are downloaded on demand, SHA-256 verified and cached. The original backend, text cleanup, token-budget preflight, phonemizer and ONNX model execute unchanged on the CPU. All model access uses a private offline Hugging Face cache pinned to the recorded revision. No API key, GPU or reference speaker recording is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 공개 KittenTTS 모델과 목소리 데이터 약 82MB를 필요할 때 받아 캐시합니다. 원본 VoiceStudio의 문장 정리·토큰 길이 검사·음소 변환·ONNX 추론을 실행했습니다. 같은 영어 문장을 세 기본 목소리로 읽고 24kHz 모노 음성으로 저장합니다. 원본 음성 생성 백엔드 예제이며, Electron 화면·프로젝트 편집·더빙·목소리 복제까지 실행하지는 않습니다.

For the first download or native build, call `recipe_run` with `timeout_s: 1800`. If a slow connection exceeds that limit, rerun to reuse completed cache files.

첫 다운로드·컴파일에는 최대 30분의 실행 시간을 지정하세요. 연결이 느려 제한 시간을 넘겼다면 다시 실행해 완료된 캐시 파일을 재사용할 수 있습니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,tarfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/voicestudio';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original VoiceStudio file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  for name in ['engine','kitten']:
   archive=root/(name+'.tar.gz');download(sources[name],archive);dest=root/name;dest.mkdir(exist_ok=True)
   with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  model=sources['model'];hub=root/'hf'/('models--'+model['repo'].replace('/','--'));snap=hub/'snapshots'/model['revision']
  for item in model['files']:download(item,snap/item['path'])
  (hub/'refs').mkdir(parents=True,exist_ok=True);(hub/'refs/main').write_text(model['revision']);(root/'.ready').touch()
 engine=next((root/'engine').iterdir());kitten=next((root/'kitten').iterdir());env={**os.environ,'PYTHONPATH':os.pathsep.join([str(engine/'backend'),str(kitten)]),'HF_HUB_CACHE':str(root/'hf'),'HF_HUB_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','OMNIVOICE_DATA_DIR':str(root/'app-data'),'OMNIVOICE_KITTENTTS_MODEL':sources['model']['repo']}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py')],env=env,check=True,timeout=300)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and all(f['sampleRate']==24000 and f['samples']>24000 for f in result['frames'])
 print('PASS original VoiceStudio KittenTTS backend and original pretrained CPU model')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

One supplied English sentence is synthesized in three original preset voices, with 24 kHz mono output. ONNX Runtime seed 17 makes the model’s stochastic operations reproducible. This runs VoiceStudio’s original KittenTTSBackend generation path; it does not launch the Electron interface, exercise project editing, dubbing, voice cloning or its other speech engines. No upstream demo audio is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
