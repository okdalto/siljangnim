---
id: libfive.gallery
version: 1
title: Implicit solids with cylindrical bores
capability: libfive graphics
tier: C
kind: python
packages: ["cmake==4.4.3"]
source:
  name: "libfive"
  repo: https://github.com/libfive/libfive
  license: "MPL-2.0 / GPL-2+"
io:
  inputs:
  - name: CMakeLists.txt
    media: file
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

# Implicit solids with cylindrical bores

Original libfive evaluates implicit solid differences and meshes three bore radii; every output is checked as a closed manifold.

libfive 원본 CAD 코어로 구형 입체에 세 크기의 원통 구멍을 뚫고 닫힌 메시인지 검증했어요.

## Setup

Requires Python 3.12+, CMake, a C++17 compiler, tar with Zstandard support, and libpng development files. The recipe verifies and caches pinned libfive, Boost 1.86 headers and Eigen 3.4.0 sources, then builds the original core with a small CMake dependency wrapper. No Studio UI or Guile is required. Tested on Apple Silicon with libpng 1.6.59.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request,zipfile
venv_bin=pathlib.Path(sys.executable).absolute().parent
compiler=shutil.which('c++');cmake=str(venv_bin/'cmake') if (venv_bin/'cmake').is_file() else shutil.which('cmake')
if not compiler or not cmake:raise RuntimeError('A C++17 compiler, CMake and libpng development files are required.')
config=json.loads(pathlib.Path('in/source.json').read_text());driver=pathlib.Path('in/CMakeLists.txt').read_bytes();cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'libfive';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256(json.dumps(config,sort_keys=True).encode()+driver+platform.platform().encode()+subprocess.check_output([compiler,'--version'])).hexdigest();root=cache/key;library=root/'build/libfive-core'/('libfive.dylib' if sys.platform=='darwin' else 'libfive.so')
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not library.is_file():
  root.mkdir(exist_ok=True);roots={}
  for item in [{'name':'libfive',**config},*config['dependencies']]:
   archive=cache/item['sha256']
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=120) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError(item['name']+' checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   target=root/item['name'];target.mkdir(exist_ok=True)
   if item['name']=='boost':
    with zipfile.ZipFile(archive) as z:
     member=next(n for n in z.namelist() if n.startswith('pkg-') and n.endswith('.tar.zst'));packed=root/'boost.tar.zst';packed.write_bytes(z.read(member))
    subprocess.run(['tar','-xf',str(packed),'-C',str(target)],check=True);packed.unlink();roots['boost']=target/'include'
   else:
    with tarfile.open(archive) as tar:tar.extractall(target,filter='data')
    roots[item['name']]=next(p for p in target.iterdir() if p.is_dir())
  (root/'CMakeLists.txt').write_bytes(driver)
  prefix=os.environ.get('CMAKE_PREFIX_PATH','/opt/homebrew/opt/libpng' if sys.platform=='darwin' else '')
  env={**os.environ,'GIT_CEILING_DIRECTORIES':str(root)}
  subprocess.run([cmake,'-S',str(root),'-B',str(root/'build'),'-DCMAKE_BUILD_TYPE=Release','-DLIBFIVE_SOURCE='+str(roots['libfive']),'-DBOOST_HEADERS='+str(roots['boost']),'-DEIGEN_HEADERS='+str(roots['eigen']),'-DCMAKE_PREFIX_PATH='+prefix],env=env,check=True)
  subprocess.run([cmake,'--build',str(root/'build'),'--parallel','4'],check=True)
 subprocess.run([sys.executable,'in/main.py',str(library)],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The input constructs sphere-minus-cylinder expression trees through original libfive C APIs, then calls the single-threaded native mesher at resolution 12 for bore radii 0.15, 0.30 and 0.45. It checks finite vertices, triangle indices and two incident faces per edge. The viewer only projects the native mesh; no CSG or meshing algorithm is reimplemented.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
