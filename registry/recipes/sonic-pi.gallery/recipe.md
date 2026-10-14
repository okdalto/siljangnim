---
id: sonic-pi.gallery
version: 1
title: Three original Sonic Pi instruments rendered offline
capability: sonic-pi graphics
tier: C
kind: python
packages: []
source:
  name: "Sonic Pi"
  repo: https://github.com/sonic-pi-net/sonic-pi
  license: "MIT core / AGPL web / CC-BY-SA docs"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
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
  - name: score-0.osc
    media: file
  - name: score-1.osc
    media: file
  - name: score-2.osc
    media: file
verify:
  params: {}
  expect_outputs: ["audio-0.wav", "audio-1.wav", "audio-2.wav", "result.json", "score-0.osc", "score-1.osc", "score-2.osc"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Three original Sonic Pi instruments rendered offline

Original Sonic Pi 5.0 beep, blade and prophet definitions render a supplied six-note phrase through native SuperCollider, with playable PCM audio.

Sonic Pi 5.0의 원본 beep·blade·prophet 악기 정의로 직접 만든 여섯 음 구절을 SuperCollider에서 렌더했어요. 실제 PCM 오디오를 들을 수 있어요.

## Setup

Requires macOS and Python 3.12+. Three original compiled Sonic Pi 5.0.0 instrument definitions at revision 25baaed3c28003bf141f591081217136194b0d69 are downloaded with SHA-256 verification and cached. The pinned SuperCollider 3.14.1 universal package is also verified and cached, mounted read-only for its native offline scsynth renderer and detached afterward. No global application installation or audio device is required.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Sonic Pi의 원본 악기 정의를 체크섬으로 확인하고 원본 SuperCollider 오프라인 엔진에서 실행합니다. 48kHz 스테레오 PCM과 실제 파형을 저장합니다. Ruby 라이브 코딩 언어·편집기·스케줄러가 아니라 Sonic Pi 악기의 소리 합성 부분을 실행하는 예제입니다. prophet은 원래 무작위 변조를 포함하므로 실행마다 파형이 조금 달라질 수 있습니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,sys,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This package recipe is for macOS. On another platform install SuperCollider 3.14.1 and pass scsynth to in/main.py.')
sources=json.loads(pathlib.Path('in/sources.json').read_text());defs=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'sonic-pi';defs.mkdir(parents=True,exist_ok=True)
for item in sources:
 target=defs/item['sha256'];
 if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
  with urllib.request.urlopen(item['url'],timeout=120) as r:data=r.read()
  if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Sonic Pi instrument checksum mismatch')
  with tempfile.NamedTemporaryFile(dir=defs,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
  pending.replace(target)
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
   with tempfile.TemporaryDirectory(prefix='siljangnim-sonic-inputs-') as folder:
    import shutil
    for item in sources:shutil.copy(defs/item['sha256'],pathlib.Path(folder)/item['path'])
    subprocess.run([str(pathlib.Path(sys.executable).absolute()),'in/main.py',str(binary),folder],check=True,timeout=120)
  finally:subprocess.run(['hdiutil','detach',mount],check=True)
```

## Verify

Original instrument definitions were rendered repeatedly with the cached native engine. Beep and blade PCM matched exactly. Prophet has original stochastic modulation: equal duration, relative RMS difference below 5% and maximum normalized frequency-band power difference below 0.03 were required. Observed values were 0.099% RMS difference and 0.00136 band-power difference; each recording contained 100,864 stereo samples per channel at 48 kHz.

원본 악기를 캐시된 엔진에서 반복 실행했습니다. beep·blade PCM은 정확히 일치했습니다. 무작위 변조가 있는 prophet은 길이가 동일하고 RMS 차이 5% 이내·정규화 주파수 대역 에너지 차이 0.03 이내인지 확인했습니다. 실제 차이는 약 0.099%와 0.00136이었으며 각 파일은 48kHz에서 채널당 100,864샘플입니다.

## Scope

The supplied OSC score plays MIDI notes 60, 64, 67, 72, 67 and 64 with the original beep, blade and prophet SynthDefs, controlling their documented note, amplitude and envelope parameters. Native scsynth exports 48 kHz stereo PCM; no replacement waveform generator is used. The gallery displays native audio and a waveform excerpt. This exercises Sonic Pi instrument DSP, not its Ruby live-coding language, editor or runtime scheduler. The prophet instrument includes stochastic modulation, so independent renders need not have identical samples.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
