---
id: hole-fixer.gallery
version: 1
title: Smooth repair of an open mesh
capability: hole_fixer graphics
tier: C
kind: python
packages: []
source:
  name: "hole_fixer"
  repo: https://github.com/erkaman/hole_fixer
  license: "MIT (this implementation) / dependencies separate"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: input.off
    media: file
  - name: repaired-0.off
    media: file
  - name: repaired-1.off
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["input.off", "repaired-0.off", "repaired-1.off", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Smooth repair of an open mesh

The original hole_fixer fills an open sphere cap with surface fairing at two subdivision levels, producing closed triangle meshes.

hole_fixer 원본 표면 보정 코드로 구의 열린 윗부분을 두 세분화 수준에서 채워 닫힌 메시를 만들었어요.

## Setup

Requires Python 3.12+ and a C++14 compiler. Map main.py and source.json into in/. Original source and bundled dependencies are SHA-256 verified before compiling and caching. Verified on macOS arm64.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
ID='hole_fixer'

compiler=shutil.which('c++')
if not compiler:raise RuntimeError('Install a native compiler (c++).')
config=json.loads(pathlib.Path('in/source.json').read_text());driver=b'';cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/ID;cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(config['sha256'].encode()+driver+platform.platform().encode()+subprocess.check_output([compiler,'--version'])).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz');binary=root/'renderer'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not binary.is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError(ID+' source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  source=next(p for p in root.iterdir() if p.is_dir() and (p/'main.cpp').is_file())
  subprocess.run([compiler,'-std=c++14','-O2','-Wno-deprecated-declarations','-I'+str(source/'libigl'),'-I'+str(source/'libigl/eigen'),str(source/'main.cpp'),'-o',str(binary)],check=True)
 subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

The unmodified native executable and its bundled libigl/Eigen dependencies repair an original open sphere mesh. Outputs use zero or two patch subdivisions and at most 900 target faces. Assertions check finite vertices, triangle edge incidence and zero remaining boundary edges after repair. The input has 24 boundary edges. This demonstrates simple single-hole surface fairing, not arbitrary mesh repair.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
