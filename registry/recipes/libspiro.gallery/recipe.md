---
id: libspiro.gallery
version: 1
title: Smoothness between curve knots
capability: libspiro geometry native
tier: C
kind: python
packages: []
source:
  name: "libspiro"
  repo: https://github.com/fontforge/libspiro
  license: "GPL-3.0-or-later"
io:
  inputs:
  - name: main.cpp
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: [result.json]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Smoothness between curve knots

libspiro solves spiral splines for the same knots using corner, G2 and G4 point types. The generated Bézier curves are sampled for display.

libspiro로 같은 매듭을 모서리·G2·G4 유형으로 풀었어요. 생성된 베지어 곡선을 표본화해 비교해요.

## Setup

Requires Python 3.11.15 or newer and C/C++ compilers cc and c++ on PATH (Xcode Command Line Tools on macOS). Map the supplied main.cpp and source.json assets into in/. No Python packages or GPU are required. The Python wrapper downloads the pinned upstream source archive, verifies its SHA-256, and caches it under the user cache directory (XDG_CACHE_HOME or ~/.cache)/siljangnim/sources. It compiles the original engine and driver in a temporary directory and executes the result. Opening the gallery only downloads prepared example files.

재실행에는 Python과 C/C++ 컴파일러가 필요해요. 고정된 원본 소스의 SHA-256을 검증해 캐시에 저장하고, 임시 폴더에서 빌드·실행해요. 갤러리에서는 이미 직접 계산한 결과를 내려받아요.

## Run

```python
import hashlib, json, os, pathlib, shutil, subprocess, tarfile, tempfile, urllib.request

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
    subprocess.run([cpp,'-std=c++17','-O2','in/main.cpp',*objects,*includes,'-o',str(executable)],check=True)
    result = subprocess.run([str(executable)],check=True,capture_output=True,text=True)
    data = json.loads(result.stdout)
    assert len(data['frames'])==config['frames']
    pathlib.Path('out').mkdir(exist_ok=True)
    pathlib.Path('out/result.json').write_text(json.dumps(data,allow_nan=False))
```

## Verify

Executed on macOS arm64 from a fresh source cache and again with the cached archive. The driver asserts numerical invariants; nonzero compiler or engine exits fail the recipe.

## Notes

Original procedural input and driver. The viewer changes stored results or viewing transforms, not the underlying computation. Source URL, exact commit and checksum are in source.json.
