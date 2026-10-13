---
id: nanovg.gallery
version: 1
title: Native vector paths on OpenGL
capability: nanovg graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "NanoVG"
  repo: https://github.com/memononen/nanovg
  license: "Zlib"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  - name: main.c
    media: file
  outputs:
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Native vector paths on OpenGL

NanoVG directly renders gradient-filled rounded shapes and cubic curves through its original native OpenGL backend.

NanoVG 원본 OpenGL 백엔드로 그라데이션 도형과 베지어 곡선을 직접 렌더링했어요.

## Setup

Requires macOS, Python 3.12+, Pillow 11.3.0 and Xcode command line tools. Map main.c, main.py and source.json into in/. The source archive is SHA-256 verified and the native binary is cached by source, driver, compiler and platform.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
ID='nanovg'
if platform.system()!='Darwin':raise RuntimeError('This offscreen CGL driver requires macOS; other platforms need an OpenGL context driver.')
compiler=shutil.which('cc')
if not compiler:raise RuntimeError('Install a native compiler (cc).')
config=json.loads(pathlib.Path('in/source.json').read_text());driver=pathlib.Path('in/main.c').read_bytes();cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/ID;cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(config['sha256'].encode()+driver+platform.platform().encode()+subprocess.check_output([compiler,'--version'])).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz');binary=root/'renderer'
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
  source=next(p for p in root.iterdir() if p.is_dir() and (p/'src/nanovg.c').is_file())
  (root/'main.c').write_bytes(driver)
  subprocess.run([compiler,'-O2','-Wno-deprecated-declarations','-I'+str(source/'src'),str(root/'main.c'),str(source/'src/nanovg.c'),'-framework','OpenGL','-o',str(binary)],check=True)
 subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Unmodified NanoVG C sources execute path tessellation, gradients, stencil strokes and antialiasing in an actual macOS OpenGL 3.2 context. The original driver varies stroke width and curve control points. Native framebuffer pixels are read back; Python only converts PPM to PNG. This driver requires macOS CGL; other systems need an OpenGL context adapter.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
