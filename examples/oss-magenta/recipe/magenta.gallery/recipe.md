---
id: magenta.gallery
version: 1
title: Melodies from the original pretrained RNN
capability: magenta graphics
tier: C
kind: python
packages: []
source:
  name: "Magenta"
  repo: https://github.com/magenta/magenta
  license: "Apache-2.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: requirements.txt
    media: file
  - name: source.json
    media: file
  outputs:
  - name: audio-0.wav
    media: file
  - name: audio-1.wav
    media: file
  - name: audio-2.wav
    media: file
  - name: melody-0.mid
    media: file
  - name: melody-1.mid
    media: file
  - name: melody-2.mid
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["audio-0.wav", "audio-1.wav", "audio-2.wav", "melody-0.mid", "melody-1.mid", "melody-2.mid", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Melodies from the original pretrained RNN

Magenta 2.1.4 continues a supplied four-note primer with its original Melody RNN at three temperatures, exporting MIDI and audio previews.

Magenta 2.1.4 원본 Melody RNN으로 직접 만든 네 음의 도입부를 세 온도에서 이어 만들고 MIDI와 소리 미리보기를 저장했어요.

## Setup

Requires Apple Silicon macOS and Python 3.12+ for the wrapper. Original Magenta 2.1.4, the official basic_rnn.mag model (about 12 MB), Python 3.10.20+20260510 and uv 0.11.13 are downloaded, SHA-256 verified and cached. The private runtime installs the exact dependency closure, including TensorFlow-macos 2.11.0 and TensorFlow Probability 0.19.0. Original Magenta source is unchanged.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Apple Silicon macOS용입니다. 원본 Melody RNN과 공식 학습 모델 약 12MB를 캐시해 직접 음표를 생성합니다. 주황색은 입력한 네 음, 청록색은 생성된 음입니다. 재생 소리는 생성된 MIDI를 원본 PrettyMIDI의 사인파 합성기로 변환한 미리보기이며 신경망이 파형을 생성한 것은 아닙니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,tarfile,tempfile,urllib.request,zipfile
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This pinned TensorFlow runtime recipe targets Apple Silicon macOS.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());key=hashlib.sha256(b'magenta-melody-rnn-v1'+(inputs/'source.json').read_bytes()+(inputs/'requirements.txt').read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'magenta';cache.mkdir(parents=True,exist_ok=True);root=cache/key
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  root.mkdir(exist_ok=True)
  for name,item in config.items():
   archive=cache/(item['sha256']+('.whl' if name=='source' else '.mag' if name=='model' else '.tar.gz'))
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=180) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Magenta runtime checksum mismatch: '+name)
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   dest=root/name;dest.mkdir(exist_ok=True)
   if name=='source':
    with zipfile.ZipFile(archive) as z:z.extractall(dest)
   elif name!='model':
    with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  uv=next((root/'uv').glob('*/uv'));python=root/'python/python/bin/python3.10'
  subprocess.run([str(uv),'venv','--clear','--python',str(python),'--no-python-downloads',str(root/'venv')],check=True)
  subprocess.run([str(uv),'pip','install','--python',str(root/'venv/bin/python'),'--no-deps','--requirement',str(inputs/'requirements.txt')],check=True)
  (root/'ready').write_text(key)
 env={**os.environ,'PYTHONPATH':str(root/'source'),'TF_NUM_INTEROP_THREADS':'1','TF_NUM_INTRAOP_THREADS':'1','TF_CPP_MIN_LOG_LEVEL':'2'}
 subprocess.run([str(root/'venv/bin/python'),str(inputs/'main.py'),str(cache/(config['model']['sha256']+'.mag'))],env=env,check=True)
 frames=json.loads((output/'result.json').read_text())['frames'];assert len(frames)==3 and all(len(f['notes'])>4 for f in frames)
 print('PASS original pretrained Magenta Melody RNN and native MIDI exports in cached Python 3.10 runtime')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original MelodyRnnSequenceGenerator extends the supplied C4/E4/G4/C5 primer at temperatures 0.5, 1.0 and 1.5 to an eight-second timeline. Native note times, pitches and newly generated notes are checked. Orange notes mark the primer and teal notes mark model output. Original PrettyMIDI sine synthesis makes the audio preview from the generated MIDI; the neural model generates notes, not the audio waveform.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
