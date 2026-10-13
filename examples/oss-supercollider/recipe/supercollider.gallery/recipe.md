---
id: supercollider.gallery
version: 1
title: Three native audio oscillators
capability: supercollider graphics
tier: C
kind: python
packages: []
source:
  name: "SuperCollider"
  repo: https://github.com/supercollider/supercollider
  license: "GPL-3.0"
io:
  inputs:
  - name: main.py
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
  - name: patch-0.scsyndef
    media: file
  - name: patch-1.scsyndef
    media: file
  - name: patch-2.scsyndef
    media: file
  - name: result.json
    media: file
  - name: score-0.osc
    media: file
  - name: score-1.osc
    media: file
  - name: score-2.osc
    media: file
verify:
  params: {}
  expect_outputs: ["audio-0.wav", "audio-1.wav", "audio-2.wav", "patch-0.scsyndef", "patch-1.scsyndef", "patch-2.scsyndef", "result.json", "score-0.osc", "score-1.osc", "score-2.osc"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Three native audio oscillators

SuperCollider scsynth renders SinOsc, Saw and Pulse to PCM WAV; listen to the original synthesis and inspect its waveform.

SuperCollider scsynth 원본으로 사인파·톱니파·펄스파를 WAV로 합성해 듣고 파형을 비교해요.

## Setup

This package recipe requires macOS and Python 3.12+. It downloads the official SuperCollider 3.14.1 universal DMG (about 251 MB) once, verifies its SHA-256, and caches it. Each execution mounts the image read-only, invokes scsynth in non-realtime mode, and detaches the image in a finally block. No system-wide installation, audio input or audio device is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,sys,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This package recipe is for macOS. On another platform install SuperCollider 3.14.1 and pass scsynth to in/main.py.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'supercollider';cache.mkdir(parents=True,exist_ok=True);archive=cache/(config['sha256']+'.dmg')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
  with urllib.request.urlopen(config['url'],timeout=180) as response:data=response.read()
  if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('SuperCollider package checksum mismatch')
  with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
  pending.replace(archive)
 with tempfile.TemporaryDirectory(prefix='siljangnim-supercollider-') as mount:
  subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,str(archive)],check=True)
  try:
   binary=pathlib.Path(mount)/'SuperCollider.app/Contents/Resources/scsynth'
   if not binary.is_file():raise RuntimeError('scsynth is missing from the pinned package')
   subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
  finally:subprocess.run(['hdiutil','detach',mount],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The input driver writes new SynthDef and OSC score files according to the original documented binary formats. Original SinOsc, Saw, Pulse, Line, BinaryOpUGen and Out unit generators perform all synthesis in scsynth. The driver validates mono 48 kHz 16-bit PCM output, sample counts and amplitude, then draws a short section of the native waveform. No synthesis algorithm is replaced with Python. SynthDefs, OSC scores and original WAV files are included.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
