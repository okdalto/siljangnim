---
id: geometry-central-heat-method.gallery
version: 1
title: Heat-method distance on a cylinder
capability: geometry-central-heat-method simulation native
tier: C
kind: python
packages: ["cmake==4.4.3"]
source:
  name: "Geometry Central \u00b7 Heat Method"
  repo: https://github.com/nmwsharp/geometry-central
  license: "MIT"
io:
  inputs:
  - name: main.cpp
    media: file
  - name: source.json
    media: file
  - name: CMakeLists.txt
    media: file
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Heat-method distance on a cylinder

geometry-central computes geodesic distances from three cylinder vertices with its heat-method solver. Colors show distances on the unwrapped surface.

geometry-central 열 방법 솔버로 원통 표면의 세 꼭짓점에서 거리를 계산했어요. 펼친 표면에 실제 거리를 색으로 표시해요.

## Setup

Requires Python 3.11.15 or newer and a C++20 compiler on PATH (tested with Apple clang 17). Map main.cpp, source.json, CMakeLists.txt into in/. Source files or archives are pinned, SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Native CMake builds are cached by source, driver and toolchain identity. The original computation runs on every invocation. Viewing only downloads prepared results.

원본 도구를 직접 실행해요. 필요한 실행 프로그램을 PATH에 두고 입력 파일을 연결하세요. 검증된 소스를 캐시하며 계산은 매번 실행해요. 예제를 열 때는 준비된 결과만 받아요.

## Run

```python
import fcntl, hashlib, json, os, pathlib, platform, shutil, subprocess, tarfile, tempfile, urllib.request
import cmake as cmake_package

config=json.loads(pathlib.Path('in/source.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'sources'
cache.mkdir(parents=True,exist_ok=True)
def archive(entry):
    path=cache/(entry['sha256']+'.tar.gz')
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:
        with urllib.request.urlopen(entry['url'],timeout=120) as response:data=response.read()
        if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise RuntimeError('Source checksum mismatch')
        with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:
            f.write(data)
            pending=pathlib.Path(f.name)
        pending.replace(path)
    return path
sources=[archive(config)]+[archive(e) for e in config['dependencies']]
cmake=str(pathlib.Path(cmake_package.CMAKE_BIN_DIR)/'cmake')
compiler=shutil.which('c++')
if not compiler:raise RuntimeError('Install a C++17 compiler and put c++ on PATH.')
identity=json.dumps(config,sort_keys=True).encode()+platform.platform().encode()
for cmd in [[compiler,'--version'],[cmake,'--version']]:identity+=subprocess.check_output(cmd)
identity+=json.dumps({k:os.environ.get(k) for k in ['CC','CXX','CFLAGS','CXXFLAGS','CPPFLAGS','LDFLAGS','SDKROOT','MACOSX_DEPLOYMENT_TARGET','CMAKE_GENERATOR','CMAKE_TOOLCHAIN_FILE']},sort_keys=True).encode()
for name in ['main.cpp','CMakeLists.txt']:identity+=pathlib.Path('in',name).read_bytes()
work=cache.parent/'native-builds'/hashlib.sha256(identity).hexdigest();work.mkdir(parents=True,exist_ok=True)
with (work/'build.lock').open('a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    binary=work/'build/gallery';stamp=work/'complete.json';reuse=False
    if binary.is_file() and stamp.is_file():
        try:reuse=json.loads(stamp.read_text())['sha256']==hashlib.sha256(binary.read_bytes()).hexdigest()
        except (KeyError,ValueError):pass
    if not reuse:
        for name in ['source','happly','eigen','build']:
            if (work/name).exists():shutil.rmtree(work/name)
        roots=[]
        for name,tar in zip(['source','happly','eigen'],sources):
            dest=work/name;dest.mkdir()
            with tarfile.open(tar) as f:f.extractall(dest,filter='data')
            roots.append(next(dest.iterdir()))
        source,happly,eigen=roots
        shutil.copytree(happly,source/'deps/happly',dirs_exist_ok=True)
        for name in ['main.cpp','CMakeLists.txt']:shutil.copyfile(pathlib.Path('in',name),work/name)
        subprocess.run([cmake,'-S',str(work),'-B',str(work/'build'),'-DSOURCE_DIR='+str(source),'-DGC_EIGEN_LOCATION='+str(eigen),'-DCMAKE_BUILD_TYPE=Release'],check=True)
        subprocess.run([cmake,'--build',str(work/'build'),'--target','gallery','--parallel','2'],check=True)
        stamp.write_text(json.dumps({'sha256':hashlib.sha256(binary.read_bytes()).hexdigest()}))
        print('Built native geometry-central engine')
    else:print('Using cached native geometry-central build')
    subprocess.run([str(binary),'out'],check=True)
data=json.loads(pathlib.Path('out/result.json').read_text())
assert len(data['frames'])==3
```

## Verify

Executed from a fresh source cache and again using cached files. Outputs matched byte for byte; driver checks cover finite results and problem-specific numerical invariants. Nonzero engine exits fail the recipe.

## Notes

The original native library is built with Eigen 3.4.0 and its pinned happly submodule. Mean distance error is checked against the exact cylindrical geodesic formula. The map unwraps angle and height for display; colors are normalized per source. The recipe caches checksum-verified archives and the compiled binary, and reruns the heat solve every time. The viewer selects prepared outputs and does not rerun the solver.
