---
id: differential-mesh.gallery
version: 1
title: Growing a native triangle network
capability: differential-mesh graphics
tier: C
kind: python
packages: ["Cython==0.29.37", "numpy==1.26.4", "setuptools==80.9.0"]
source:
  name: "Differential Mesh"
  repo: https://github.com/inconvergent/differential-mesh
  license: "MIT"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
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

# Growing a native triangle network

Original differential-mesh grows and relaxes a triangle network from 146 to 4,041 faces using its compiled Cython implementation.

differential-mesh 원본 Cython 코드로 삼각형 연결망을 성장시키고 이완해 146개에서 4,041개 면으로 확장했어요.

## Setup

Requires Python 3.12, Cython 0.29.37, NumPy 1.26.4, setuptools 80.9.0 and a C compiler. Map main.py and source.json into in/. The two original archives are SHA-256 verified and compiled extensions are cached for the current interpreter and platform.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
if sys.version_info[:2]!=(3,12):raise RuntimeError('Use Python 3.12 with the pinned NumPy and Cython packages.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'differential-mesh';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256((json.dumps(config,sort_keys=True)+platform.platform()+sys.version).encode()).hexdigest();root=cache/key
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  root.mkdir(exist_ok=True)
  for name in ['zonemap','differential-mesh']:
   source=config[name];archive=cache/(source['sha256']+'.tar.gz')
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=source['sha256']:
    with urllib.request.urlopen(source['url'],timeout=120) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=source['sha256']:raise RuntimeError(name+' checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   directory=root/name;directory.mkdir(exist_ok=True)
   with tarfile.open(archive) as tar:tar.extractall(directory,filter='data')
   original=next(directory.iterdir())/'src'
   for p in original.iterdir():
    # Use Zonemap's matching declaration; its unused performance-test signature
    # differs from the stale declaration copied into differential-mesh.
    if name=='differential-mesh' and p.name=='zonemap.pxd':continue
    shutil.copyfile(p,root/p.name)
  (root/'build.py').write_text("from setuptools import setup,Extension\nfrom Cython.Build import cythonize\nimport numpy\nextensions=[Extension(name,[name+'.pyx'],include_dirs=[numpy.get_include()],extra_compile_args=['-O2','-DCYTHON_PROFILE=0']) for name in ['zonemap','mesh','differentialMesh']]\nsetup(ext_modules=cythonize(extensions,compiler_directives={'language_level':3}))\n")
  subprocess.run([sys.executable,'build.py','build_ext','--inplace'],cwd=root,check=True)
  if not list(root.glob('differentialMesh*.so')):raise RuntimeError('Native extension missing')
  (root/'ready').write_text(key)
 subprocess.run([sys.executable,'in/main.py'],env={**os.environ,'PYTHONPATH':str(root)},check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Unmodified original differential-mesh and Zonemap Cython sources run growth, position relaxation and edge optimization with seed 17, one thread, 50000 reserved elements and 14 spatial zones. The small input avoids the upstream large default allocation. Cython 0.29.37 preserves the original inherited private-method behavior. Optional Cython profiling is disabled with CYTHON_PROFILE=0 for Python 3.12 compatibility. Zonemap uses its own matching declaration for an unused benchmark method; shared initialization helpers come from differential-mesh. No growth algorithms are changed. Assertions check finite coordinates and increasing triangle count; geometry is uniformly scaled only for display.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
