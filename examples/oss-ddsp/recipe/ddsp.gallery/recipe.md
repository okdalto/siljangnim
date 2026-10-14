---
id: ddsp.gallery
version: 1
title: Differentiable harmonic synthesis
capability: ddsp graphics
tier: C
kind: python
packages: []
source:
  name: "DDSP"
  repo: https://github.com/magenta/ddsp
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

# Differentiable harmonic synthesis

DDSP 3.7.0 synthesizes three harmonic profiles and verifies native TensorFlow energy gradients against their analytical values.

DDSP 3.7.0 원본으로 세 가지 배음의 소리를 합성하고 TensorFlow가 계산한 에너지 미분값을 해석적 값과 비교했어요.

## Setup

Requires Apple Silicon macOS and Python 3.12+ for the wrapper. The recipe downloads and SHA-256 verifies DDSP 3.7.0, Python 3.10.20+20260510 and uv 0.11.13, then caches a private runtime with the supplied exact dependency closure, including TensorFlow-macos 2.11.0. No system Python replacement or pretrained model is needed. The bootstrap removes only eager imports of unused losses and spectral_ops modules from ddsp/__init__.py; original synthesis, processor and core implementations are unchanged.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Apple Silicon macOS용입니다. Python 3.10 실행 환경과 TensorFlow를 별도 캐시에 준비합니다. 사용하지 않는 학습·피치 분석 모듈의 자동 import 두 줄만 제외하고 원본 합성 코드를 실행합니다. 사전 학습 모델의 음색 전이가 아닌 미분 가능한 배음 합성 예제이며, 전체 2초 오디오와 40ms 파형 구간을 제공합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,tarfile,tempfile,urllib.request,zipfile
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This pinned TensorFlow runtime recipe targets Apple Silicon macOS.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());key=hashlib.sha256(b'ddsp-synthesis-only-v1'+(inputs/'source.json').read_bytes()+(inputs/'requirements.txt').read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'ddsp';cache.mkdir(parents=True,exist_ok=True);root=cache/key
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  root.mkdir(exist_ok=True)
  for name,item in config.items():
   archive=cache/(item['sha256']+('.whl' if name=='source' else '.tar.gz'))
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=180) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('DDSP runtime checksum mismatch: '+name)
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   dest=root/name;dest.mkdir(exist_ok=True)
   if name=='source':
    with zipfile.ZipFile(archive) as z:z.extractall(dest)
   else:
    with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  # Keep original synthesis modules. Disable eager imports of optional pitch-estimation/training modules, which are unused here.
  init=root/'source/ddsp/__init__.py';s=init.read_text()
  for line in ['from ddsp import losses\n','from ddsp import spectral_ops\n']:
   assert line in s;s=s.replace(line,'')
  init.write_text(s)
  uv=next((root/'uv').glob('*/uv'));python=root/'python/python/bin/python3.10'
  subprocess.run([str(uv),'venv','--clear','--python',str(python),'--no-python-downloads',str(root/'venv')],check=True)
  subprocess.run([str(uv),'pip','install','--python',str(root/'venv/bin/python'),'--no-deps','--requirement',str(inputs/'requirements.txt')],check=True)
  (root/'ready').write_text(key)
 env={**os.environ,'PYTHONPATH':str(root/'source'),'TF_NUM_INTEROP_THREADS':'1','TF_NUM_INTRAOP_THREADS':'1','TF_CPP_MIN_LOG_LEVEL':'2'}
 subprocess.run([str(root/'venv/bin/python'),str(inputs/'main.py')],env=env,check=True)
 frames=json.loads((output/'result.json').read_text())['frames'];assert len(frames)==3 and all(f['samples']==32000 and abs(f['energyGradient']-f['expectedGradient'])<1e-4 for f in frames)
 print('PASS original DDSP synthesis and native TensorFlow gradients in cached Python 3.10 runtime')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original Harmonic synthesizer produces two-second, 16 kHz PCM audio for three partial profiles with a 220 Hz vibrato input. Native GradientTape derivatives of mean audio energy with respect to gain are compared with 2*energy/gain, at 1e-4 tolerance. The plot shows a 40 ms excerpt; playback uses the full original synthesized output. This exercises differentiable synthesis, not a trained timbre-transfer model.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
