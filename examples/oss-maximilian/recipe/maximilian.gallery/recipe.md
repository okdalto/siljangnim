---
id: maximilian.gallery
version: 1
title: Native oscillator shapes
capability: maximilian audio synthesis native
tier: C
kind: python
packages: []
source:
  name: "Maximilian"
  repo: https://github.com/micknoise/maximilian
  license: "MIT"
io:
  inputs:
  - name: main.cpp
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
  - name: audio-0.wav
    media: file
  - name: audio-1.wav
    media: file
  - name: audio-2.wav
    media: file
verify:
  params: {}
  expect_outputs: [result.json, audio-0.wav, audio-1.wav, audio-2.wav]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Native oscillator shapes

Maximilian synthesizes sine, square and saw tones at 220 Hz. The saved audio and waveform window are computed by its original oscillators.

Maximilian의 원본 발진기로 220 Hz 사인·사각·톱니파를 합성했어요. 직접 계산한 음원과 파형 구간이에요.

## Setup

Requires Python 3.11.15 or newer and C/C++ compilers cc and c++ on PATH (Xcode Command Line Tools on macOS). Map the supplied main.cpp and source.json assets into in/. No Python packages or GPU are required. The Python wrapper downloads the pinned upstream source archive, verifies its SHA-256, and caches it under the user cache directory (XDG_CACHE_HOME or ~/.cache)/siljangnim/sources. It compiles the original engine and driver in a temporary directory and executes the result. Opening the gallery only downloads prepared example files.

재실행에는 Python과 C/C++ 컴파일러가 필요해요. 고정된 원본 소스의 SHA-256을 검증해 캐시에 저장하고, 임시 폴더에서 빌드·실행해요. 갤러리에서는 이미 직접 계산한 결과를 내려받아요.

## Run

```python
import wave, struct, math, hashlib, json, os, pathlib, shutil, subprocess, tarfile, tempfile, urllib.request

config = json.loads(pathlib.Path('in/source.json').read_text())
cache = pathlib.Path(os.environ.get('XDG_CACHE_HOME', pathlib.Path.home()/'.cache'))/'siljangnim'/'sources'
cache.mkdir(parents=True, exist_ok=True)
archive = cache/(config['sha256']+'.tar.gz')
if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
    with urllib.request.urlopen(config['url'], timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest()!=config['sha256']:
        raise RuntimeError('Source archive checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temporary:
        temporary.write(data)
        pending = pathlib.Path(temporary.name)
    pending.replace(archive)
cpp = shutil.which('c++')
cc = shutil.which('cc')
if not cpp or not cc:
    raise RuntimeError('Install a C/C++ toolchain and put c++ and cc on PATH (Xcode Command Line Tools on macOS).')
with tempfile.TemporaryDirectory(prefix='siljangnim-native-') as temporary:
    work = pathlib.Path(temporary)
    with tarfile.open(archive) as source:
        source.extractall(work, filter='data')
    source = next(work.iterdir())
    if config['id']=='libspiro':
        (source/'spiro-config.h').write_text('#define LS_VERSION_STR "pinned-a2f38e1"\n#define IS_FINITE(x) isfinite(x)\n')
    includes = ['-I'+str(source/f) for f in config['includes']]
    objects = []
    for filename in config['files']:
        if filename.endswith('.c'):
            output = work/(pathlib.Path(filename).stem+'.o')
            subprocess.run([cc,'-std=c99','-O2',*includes,'-c',str(source/filename),'-o',str(output)],check=True)
            objects.append(str(output))
        else:
            objects.append(str(source/filename))
    executable = work/'compute'
    subprocess.run([cpp,'-std=c++17','-O2',*config.get('flags',[]),'in/main.cpp',*objects,*includes,'-o',str(executable)],check=True)
    result = subprocess.run([str(executable)],check=True,capture_output=True,text=True)
    data = json.loads(result.stdout)
    assert len(data['frames'])==config['frames']
    pathlib.Path('out').mkdir(exist_ok=True)
    if config.get('audio'):
        for index, frame in enumerate(data['frames']):
            samples=frame.pop('samples')
            assert len(samples)==44100 and all(math.isfinite(v) for v in samples)
            peak=max(abs(v) for v in samples)
            assert peak>0
            # A common normalization per clip plus short fades avoids clipping/clicks.
            pcm=[int(max(-1,min(1,v/peak*.7))*32767*min(1,i/441,(len(samples)-1-i)/441)) for i,v in enumerate(samples)]
            with wave.open('out/audio-'+str(index)+'.wav','wb') as stream:
                stream.setparams((1,2,44100,0,'NONE','not compressed'))
                stream.writeframes(struct.pack('<'+'h'*len(pcm),*pcm))
            frame['audioPeakBeforeNormalization']=peak
    pathlib.Path('out/result.json').write_text(json.dumps(data,allow_nan=False))
```

## Verify

Executed on macOS arm64 from a fresh source cache and again with the cached archive. The driver asserts numerical invariants; nonzero compiler or engine exits fail the recipe.

## Notes

Original procedural input and driver. The viewer changes stored results or viewing transforms, not the underlying computation. Source URL, exact commit and checksum are in source.json.

Audio clips are peak-normalized individually to 0.7 and receive 10 ms fades; this changes loudness, not the native waveform synthesis. Each clip is one second at 44100 Hz. The waveform plot shows an 800-sample window before normalization.
