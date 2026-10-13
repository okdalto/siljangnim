---
id: diffvg.gallery
version: 1
title: Area gradients from vector rasterization
capability: diffvg graphics
tier: C
kind: python
packages: ["torch==2.9.1", "numpy==2.2.6", "Pillow==11.3.0", "setuptools==80.9.0", "filelock==4.0.6", "typing-extensions==4.16.0", "sympy==1.14.0", "networkx==3.7", "jinja2==3.1.6", "fsspec==2026.9.0", "MarkupSafe==3.0.3", "mpmath==1.3.0", "cmake==3.31.10", "svgpathtools==1.7.1", "scikit-image==0.25.2", "cssutils==2.11.1", "matplotlib==3.10.6", "contourpy==1.4.0", "cycler==0.12.1", "fonttools==4.66.0", "kiwisolver==1.5.1", "pyparsing==3.3.3", "python-dateutil==2.9.0.post0", "imageio==2.38.0", "tifffile==2026.9.20", "lazy-loader==0.6", "more-itertools==11.1.0", "scipy==1.17.1", "svgwrite==1.4.3", "six==1.17.0", "packaging==26.3"]
source:
  name: "diffvg"
  repo: https://github.com/bachili/diffvg
  license: "Apache-2.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: shape-0.svg
    media: file
  - name: shape-1.svg
    media: file
  - name: shape-2.svg
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png", "shape-0.svg", "shape-1.svg", "shape-2.svg"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Area gradients from vector rasterization

Original diffvg renders circles and differentiates coverage with respect to radius; native gradients match the analytic circumference.

diffvg 원본 엔진으로 원을 렌더링하고 반지름에 대한 면적 미분을 계산해 해석적인 원둘레와 비교했어요.

## Setup

Requires Python 3.12 (tested with 3.12.7), the pinned packages above and a C++ compiler. Pinned diffvg and dependency archives are SHA-256 verified before native CPU compilation. pybind11 2.13.6 supplies Python 3.12 compatibility; the old Thrust _VSTD namespace is aliased to std on macOS. Renderer algorithms are unchanged. Map the listed inputs into in/. Opening the gallery downloads only prepared outputs. Source/runtime caches live under (XDG_CACHE_HOME or ~/.cache)/siljangnim.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. 원본 소스와 고정 실행 환경은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'diffvg';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256((json.dumps(config,sort_keys=True)+platform.platform()+sys.version).encode()).hexdigest();root=cache/key;source=root/('diffvg-'+config['commit']);build=root/'build'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  root.mkdir(exist_ok=True)
  for entry in [config]+config['submodules']:
   archive=cache/(entry['sha256']+'.tar.gz')
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=entry['sha256']:
    with urllib.request.urlopen(entry['url'],timeout=120) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise RuntimeError('Source checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   with tarfile.open(archive) as tar:
    if 'path' not in entry:tar.extractall(root,filter='data')
    else:
     for member in tar.getmembers():
      parts=member.name.split('/',1)
      if len(parts)<2:continue
      member.name=parts[1];tar.extract(member,source/entry['path'],filter='data')
  cmake=pathlib.Path(sys.executable).parent/'cmake'
  if not cmake.is_file():cmake=shutil.which('cmake')
  if not cmake:raise RuntimeError('Install CMake 3.31.10 and a C++ compiler.')
  args=[str(cmake),'-S',str(source),'-B',str(build),'-DDIFFVG_CUDA=OFF','-DCMAKE_BUILD_TYPE=Release','-DPython_EXECUTABLE='+sys.executable,'-DPYTHON_EXECUTABLE='+sys.executable]
  if platform.system()=='Darwin':args+=['-DCMAKE_CXX_FLAGS=-D_VSTD=std']
  subprocess.run(args,check=True);subprocess.run([str(cmake),'--build',str(build),'-j2'],check=True)
  if not list(build.glob('diffvg*.so')):raise RuntimeError('Native extension missing')
  (root/'ready').write_text(key)
 subprocess.run([sys.executable,'in/main.py'],check=True,env={**os.environ,'PYTHONPATH':os.pathsep.join([str(build),str(source)]),'MPLCONFIGDIR':str(cache/'matplotlib')})
```

## Verify

Executed twice with the original engine. Prepared images and geometry matched; see Scope for FITS metadata and parallel gradient comparison details.

원본 엔진으로 두 번 실행해 결과를 대조했습니다. FITS 메타데이터와 병렬 미분 계산의 비교 조건은 Scope에 명시했습니다.

## Scope

The original CPU rasterizer and backward pass render three circles. Native area derivatives must match 2*pi*radius within 2.5 percent; rendered area must match pi*radius^2 within 1.5 percent. Images and SVG match on repeat; parallel floating-point gradient reductions are compared with tolerance. Compatibility changes use pybind11 2.13.6 for Python 3.12 and define _VSTD=std for old Thrust on current macOS. No renderer algorithms are modified. Source archives and submodules are SHA-256 verified; compiled results are cached by source, platform and Python ABI.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
