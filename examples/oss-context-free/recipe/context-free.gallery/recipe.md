---
id: context-free.gallery
version: 1
title: Recursive branches from a shape grammar
capability: context-free graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "Context Free"
  repo: https://github.com/mtnviewjohn/context-free
  license: "GPL-2.0-or-later"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: grammar-0.cfdg
    media: file
  - name: grammar-1.cfdg
    media: file
  - name: grammar-2.cfdg
    media: file
  - name: render-0.png
    media: file
  - name: render-0.svg
    media: file
  - name: render-1.png
    media: file
  - name: render-1.svg
    media: file
  - name: render-2.png
    media: file
  - name: render-2.svg
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["grammar-0.cfdg", "grammar-1.cfdg", "grammar-2.cfdg", "render-0.png", "render-0.svg", "render-1.png", "render-1.svg", "render-2.png", "render-2.svg", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Recursive branches from a shape grammar

The original Context Free engine expands a branching grammar into 16,383 shapes, producing PNG and SVG at three branch angles.

Context Free 원본 엔진으로 재귀 문법을 16,383개 도형으로 펼쳐 세 각도의 PNG와 SVG를 생성했어요.

## Setup

Requires Python 3.12+, Pillow 11.3.0, macOS and a C++20 compiler. Install Homebrew bison 3.8.2, flex 2.6.4, libpng and icu4c development packages. Map main.py and source.json into in/. The recipe verifies the original source SHA-256 and caches the native build. On other systems build upstream cfdg and run main.py with its executable path.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This build recipe was verified on macOS. Install upstream cfdg on other platforms and run main.py with its path.')
brew=shutil.which('brew')
if not brew:raise RuntimeError('Install Homebrew development packages bison, flex, libpng and icu4c plus a C++20 compiler.')
def prefix(name):return pathlib.Path(subprocess.check_output([brew,'--prefix',name],text=True).strip())
bison,flex,png,icu=[prefix(n) for n in ['bison','flex','libpng','icu4c']]
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'context-free';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256((config['sha256']+platform.platform()).encode()).hexdigest();root=cache/key;source=root/('context-free-'+config['commit']);archive=cache/(config['sha256']+'.tar.gz')
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Context Free source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  env={**os.environ,'PATH':os.pathsep.join([str(bison/'bin'),str(flex/'bin'),os.environ.get('PATH','')])}
  subprocess.run(['make','-j2','CPPFLAGS=-DNDEBUG -I'+str(flex/'include')+' -I'+str(png/'include')+' -I'+str(icu/'include'),'LIB_DIRS='+str(png/'lib'),'LIBS=png m c++ icucore'],cwd=source,env=env,check=True)
  if not (source/'cfdg').is_file():raise RuntimeError('Native cfdg executable missing')
  (root/'ready').write_text(key)
 subprocess.run([sys.executable,'in/main.py',str(source/'cfdg')],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Original cfdg expands the same grammar at branch angles 18, 32 and 48 degrees, fixed variation ABCD and minimum shape size 0.8. Each run emits 16,383 shapes as native PNG and SVG. Assertions verify 512 by 512 images and nontrivial color coverage. The original source is unchanged. On macOS the build uses matching Homebrew Flex 2.6.4 headers and links icucore, preventing a system Flex/header ABI mismatch. Other platforms need their upstream cfdg build.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
