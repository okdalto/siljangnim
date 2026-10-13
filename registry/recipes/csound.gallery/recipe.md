---
id: csound.gallery
version: 1
title: FM synthesis with native Csound
capability: csound graphics
tier: C
kind: python
packages: ["numpy==1.26.4"]
source:
  name: "Csound"
  repo: https://github.com/csound/csound
  license: "LGPL-2.1-or-later"
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
  - name: patch-0.csd
    media: file
  - name: patch-1.csd
    media: file
  - name: patch-2.csd
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["audio-0.wav", "audio-1.wav", "audio-2.wav", "patch-0.csd", "patch-1.csd", "patch-2.csd", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# FM synthesis with native Csound

Csound directly synthesizes three FM tones; listen to the original WAV files and compare their waveforms and spectra.

Csound 원본 엔진으로 세 FM 음색을 합성했어요. WAV를 직접 듣고 파형과 주파수 스펙트럼을 비교하세요.

## Setup

Requires macOS, Python 3.11+ and NumPy 1.26.4. Map main.py and source.json into in/. The official package is downloaded only on rerun, SHA-256 verified, mounted read-only and extracted into the cache, then unmounted. It does not run the system installer. Other platforms can install upstream Csound 6.18.1 and pass its executable to main.py.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,sys,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This package recipe is for macOS. Install Csound 6.18.1 on other platforms and pass its executable to main.py.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'csound';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.dmg')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Csound package checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True);mount=root/'mount';mount.mkdir(exist_ok=True)
  subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',str(mount),str(archive)],check=True)
  try:
   package=next(mount.glob('*.pkg'));extracted=root/'extracted'
   if not extracted.exists():subprocess.run(['pkgutil','--expand-full',str(package),str(extracted)],check=True)
  finally:subprocess.run(['hdiutil','detach',str(mount)],check=True)
  if not (extracted/'CsoundApps64.pkg/Payload/usr/local/bin/csound').is_file():raise RuntimeError('Csound package extraction incomplete')
  (root/'ready').write_text(config['sha256'])
 extracted=root/'extracted';frameworks=extracted/'CsoundLib64.pkg/Payload/Library/Frameworks';opcodes=frameworks/'CsoundLib64.framework/Versions/6.0/Resources/Opcodes64';binary=extracted/'CsoundApps64.pkg/Payload/usr/local/bin/csound';env={**os.environ,'DYLD_FRAMEWORK_PATH':str(frameworks),'OPCODE6DIR64':str(opcodes)}
 subprocess.run([sys.executable,'in/main.py',str(binary)],env=env,check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

The official Csound 6.18.1 macOS universal package is extracted into a recipe cache without system installation. Native foscil synthesis uses a 220 Hz carrier, ratio 2 and FM indices 0.5, 2 and 5. Outputs contain exactly 96000 mono 16-bit samples at 48000 Hz. Assertions check sample count, finite values and nonzero unclipped amplitude. NumPy computes display waveforms and spectra from the actual WAV samples. Listening starts only when the viewer control is enabled.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
