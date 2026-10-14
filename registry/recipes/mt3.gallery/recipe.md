---
id: mt3.gallery
version: 1
title: Transcribing three short melodies
capability: mt3 graphics
tier: C
kind: python
packages: ["tensorflow==2.18.1", "tensorflow-text==2.18.1", "jax==0.4.23", "jaxlib==0.4.23", "flax==0.8.4", "optax==0.2.2", "chex==0.1.86", "orbax-checkpoint==0.5.0", "numpy==1.26.4", "ml-dtypes==0.4.1", "seqio==0.0.20", "note-seq==0.0.5", "clu==0.0.12", "tensorstore==0.1.66", "tensorflow-datasets==4.9.7", "pretty_midi==0.2.11", "mir_eval==0.8.2", "librosa==0.10.2.post1", "soundfile==0.13.1", "scipy==1.12.0", "Pillow==12.3.0", "gin-config==0.5.0", "fiddle==0.3.0", "cached-property==2.0.1", "tensorflow-metadata==1.16.1", "protobuf==4.25.8", "array-record==0.6.0", "nest-asyncio==1.6.0", "babel==2.18.0", "editdistance==0.8.1", "immutabledict==4.3.1", "mesh-tensorflow==0.1.21", "nltk==3.10.3", "pandas==3.0.6", "rouge-score==0.1.2", "sacrebleu==2.6.0", "scikit-learn==1.9.1", "sentencepiece==0.2.2", "six==1.17.0", "transformers==5.17.0"]
source:
  name: "MT3"
  repo: https://github.com/magenta/mt3
  license: "Apache-2.0"
io:
  inputs:
  - name: driver.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: input-0.wav
    media: file
  - name: input-1.wav
    media: file
  - name: input-2.wav
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
  - name: transcription-0.mid
    media: file
  - name: transcription-1.mid
    media: file
  - name: transcription-2.mid
    media: file
verify:
  params: {}
  expect_outputs: ["input-0.wav", "input-1.wav", "input-2.wav", "render-0.png", "render-1.png", "render-2.png", "result.json", "transcription-0.mid", "transcription-1.mid", "transcription-2.mid"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Transcribing three short melodies

Original MT3 transcribes three locally synthesized melodies on the CPU, comparing its estimated notes with the supplied input.

원본 MT3가 직접 합성한 짧은 선율 세 개를 CPU에서 음표로 변환합니다. 입력 음표와 모델의 추정 결과를 비교해 보세요.

## Setup

Requires Python 3.12. Original MT3, compatible T5X, JEstimator and T5 code and the official public MT3 checkpoint (about 172 MB) are downloaded on demand, SHA-256 verified and cached. TensorFlow and JAX run on the CPU. The original inference notebook is adapted only for local configuration paths and a batch size of one. No GPU or API key is required. The isolated original T5 wheel source avoids overlapping stable and nightly SeqIO/TFDS installations.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 모델 약 172MB를 필요할 때 받아 캐시합니다. 직접 만든 3.2초 소리 세 개와 원본 모델이 추정한 MIDI를 비교합니다. 음높이 집합의 재현율은 100%·100%·75%였으며, 끝나는 시각과 악기 추정에는 오차가 있습니다. 추정 음표를 수동으로 고치지 않았으며 합주 음원의 성능을 검증한 예제는 아닙니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,tarfile,zipfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/mt3';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
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
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original MT3 file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  for name in ['engine','t5x','jestimator','t5']:
   archive=root/(name+'.tar.gz');download(sources[name],archive);dest=root/name;dest.mkdir(exist_ok=True)
   if name=='t5':
    with zipfile.ZipFile(archive) as z:z.extractall(dest/'source')
   else:
    with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(lambda item:download(item,root/'checkpoint'/item['path']),sources['model']['files']))
  (root/'.ready').touch()
 engine=next((root/'engine').iterdir());t5x=next((root/'t5x').iterdir());jestimator=next((root/'jestimator').iterdir());env={**os.environ,'PYTHONPATH':os.pathsep.join([str(engine),str(t5x),str(jestimator),str(next((root/'t5').iterdir()))]),'JAX_PLATFORMS':'cpu','TF_CPP_MIN_LOG_LEVEL':'2','OMP_NUM_THREADS':'2','TF_NUM_INTRAOP_THREADS':'2','TF_NUM_INTEROP_THREADS':'2'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(engine),str(root/'checkpoint')],env=env,check=True,timeout=600)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and all(f['predictedNotes']>0 for f in result['frames'])
 print('PASS original MT3 pretrained CPU transcription with cached dependencies')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

Three own 3.2-second harmonic-tone inputs are transcribed with the official pretrained model. Input WAV, predicted MIDI and a comparison piano roll are included. Predictions are not corrected by hand: pitch-set recall is 100%, 100% and 75%; estimated note endings and instrument labels can differ from the inputs. These short synthetic inputs do not establish accuracy on ensemble recordings. No upstream demonstration audio or outputs are used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
