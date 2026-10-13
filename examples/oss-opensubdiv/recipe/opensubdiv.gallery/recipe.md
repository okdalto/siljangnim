---
id: opensubdiv.gallery
version: 1
title: Catmull-Clark refinement levels
capability: opensubdiv geometry native
tier: C
kind: python
packages: [cmake==4.4.3]
source:
  name: "OpenSubdiv"
  repo: https://github.com/pixaranimationstudios/opensubdiv
  license: LicenseRef-Tomorrow-Open-Source-Technology-1.0
io:
  inputs:
  - name: main.cpp
    media: file
  - name: CMakeLists.txt
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

# Catmull-Clark refinement levels

OpenSubdiv refines the upstream tutorial cube at three levels. Its Far topology and primvar interpolation produce the displayed vertices and faces.

OpenSubdiv로 원본 튜토리얼 정육면체를 세 단계로 세분화했어요. Far 토폴로지·속성 보간이 계산한 꼭짓점과 면이에요.

## Setup

Requires Python 3.11.15 or newer on macOS or Linux, native C/C++ compilers and a native build tool such as Make. The recipe installs pinned CMake 4.4.3 into its Python environment. Map main.cpp, CMakeLists.txt and source.json into in/. The SHA-256 verified upstream archive is cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim/sources. Native builds are cached beside it under native-builds, keyed by source, driver, compiler, CMake, OS and relevant build settings. A file lock serializes matching builds; the executable checksum is checked before reuse. First compilation can take several minutes and substantial disk space. Every rerun executes the engine, even when its binary is cached. Viewing only downloads prepared outputs.

macOS 또는 Linux의 Python·C/C++ 컴파일러와 Make 같은 빌드 도구가 필요해요. 레시피 환경에 CMake 4.4.3을 설치해요. 원본 소스 체크섬을 검증하고 소스와 빌드 결과를 캐시해요. 첫 컴파일은 몇 분이 걸릴 수 있어요. 바이너리를 재사용해도 계산 자체는 매번 실행하며 갤러리에서는 준비된 결과만 내려받아요.

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
import fcntl, platform
import cmake as cmake_package
cmake = str(pathlib.Path(cmake_package.CMAKE_BIN_DIR)/'cmake')
cpp = shutil.which('c++')
if not cpp:
    raise RuntimeError('Install a native C/C++ compiler and put c++ on PATH.')
compiler_version=subprocess.check_output([cpp,'--version'],text=True)
cmake_version=subprocess.check_output([cmake,'--version'],text=True)
identity=(config['sha256']+compiler_version+cmake_version+platform.platform()+json.dumps({k:os.environ.get(k) for k in ['CC','CXX','CFLAGS','CXXFLAGS','CPPFLAGS','LDFLAGS','SDKROOT','MACOSX_DEPLOYMENT_TARGET','CMAKE_GENERATOR','CMAKE_TOOLCHAIN_FILE']},sort_keys=True)).encode()
for name in ['main.cpp','CMakeLists.txt']:
    identity+=pathlib.Path('in',name).read_bytes()
key=hashlib.sha256(identity).hexdigest()
work=cache.parent/'native-builds'/key
work.mkdir(parents=True,exist_ok=True)
# Serialize builds with the same source/driver/toolchain key on macOS and Linux.
with (work/'build.lock').open('a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    executable=work/'build'/'gallery'
    stamp=work/'complete.json'
    reusable=False
    if executable.is_file() and stamp.is_file():
        try:
            reusable=json.loads(stamp.read_text())['sha256']==hashlib.sha256(executable.read_bytes()).hexdigest()
        except (ValueError,KeyError):
            reusable=False
    if not reusable:
        # Only replace directories owned by this content-addressed build entry.
        for name in ['source','build']:
            if (work/name).exists():shutil.rmtree(work/name)
        source_root=work/'source';source_root.mkdir()
        with tarfile.open(archive) as source:
            source.extractall(source_root,filter='data')
        source=next(source_root.iterdir())
        for name in ['main.cpp','CMakeLists.txt']:
            shutil.copyfile(pathlib.Path('in',name),work/name)
        subprocess.run([cmake,'-S',str(work),'-B',str(work/'build'),'-DTOOL_SOURCE='+str(source),'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_POLICY_VERSION_MINIMUM=3.5'],check=True)
        subprocess.run([cmake,'--build',str(work/'build'),'--target','gallery','--parallel','2'],check=True)
        assert executable.is_file()
        stamp.write_text(json.dumps({'sha256':hashlib.sha256(executable.read_bytes()).hexdigest()}))
        print('Built native engine from verified source')
    else:
        print('Using cached native build')
    result=subprocess.run([str(executable)],check=True,capture_output=True,text=True)
    data=json.loads(result.stdout)
    assert len(data['frames'])==config['frames']
    pathlib.Path('out').mkdir(exist_ok=True)
    pathlib.Path('out/result.json').write_text(json.dumps(data,allow_nan=False))
```

## Verify

Executed on macOS arm64 with a fresh source/build cache, then rerun with the verified cached executable. The driver asserts numerical invariants; nonzero compiler or engine exits fail the recipe.

## Notes

Original procedural input and driver. The viewer changes stored results or viewing transforms, not the underlying computation. Source URL, exact commit and checksum are in source.json.

The driver includes upstream tutorial helpers from the pinned archive. Their copyright and license stay in the original source; see example credits.
