---
id: swingline.gallery
version: 1
title: Weighted stipples computed on the GPU
capability: swingline graphics
tier: C
kind: python
packages: ["cmake==4.4.3"]
source:
  name: "Swingline"
  repo: https://github.com/mkeeter/swingline
  license: "GPL-2.0-or-later"
io:
  inputs:
  - name: input.png
    media: file
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
  - name: stipples-0.svg
    media: file
  - name: stipples-1.svg
    media: file
  - name: stipples-2.svg
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "stipples-0.svg", "stipples-1.svg", "stipples-2.svg"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Weighted stipples computed on the GPU

Swingline runs its original GPU Voronoi solver for 10, 30 and 60 iterations, exporting 300 weighted stipples as native SVG circles.

Swingline 원본 GPU 보로노이 솔버를 10·30·60회 실행해 가중 점 300개를 원본 SVG 원으로 내보냈어요.

## Setup

Requires macOS, Xcode command-line tools, Python 3.12+ and a desktop OpenGL 3.3 context. The recipe verifies and caches the original source revision d2a427585ac5449d036a3234bff66480a0605a03 and GLFW 3.4, then caches the compiled executable. The only platform adaptation replaces Linux OpenGL header discovery with Apple OpenGL headers and frameworks.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
if sys.platform!='darwin':raise RuntimeError('This verified build recipe targets macOS with Xcode command-line tools.')
venv_bin=pathlib.Path(sys.executable).absolute().parent
cmake=str(venv_bin/'cmake') if (venv_bin/'cmake').is_file() else shutil.which('cmake');compiler=shutil.which('c++')
if not all([cmake,compiler]):raise RuntimeError('CMake and a C compiler are required.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'swingline';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256(json.dumps(config,sort_keys=True).encode()+platform.platform().encode()+subprocess.check_output([compiler,'--version'])+b'mac-glfw-opengl-binding-v1').hexdigest();root=cache/key;binary=root/'swingline'/'swingline'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not binary.is_file():
  root.mkdir(exist_ok=True)
  for item in [config,*config['dependencies']]:
   archive=cache/item['sha256']
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=120) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError(item['name']+' checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   target=root/item['name']
   if not target.is_dir():
    with tempfile.TemporaryDirectory(dir=root) as temp:
     with tarfile.open(archive) as tar:tar.extractall(temp,filter='data')
     next(pathlib.Path(temp).iterdir()).rename(target)
  prefix=root/'glfw-install'
  subprocess.run([cmake,'-S',str(root/'glfw'),'-B',str(root/'glfw-build'),'-DGLFW_BUILD_EXAMPLES=OFF','-DGLFW_BUILD_TESTS=OFF','-DGLFW_BUILD_DOCS=OFF','-DCMAKE_INSTALL_PREFIX='+str(prefix)],check=True)
  subprocess.run([cmake,'--build',str(root/'glfw-build'),'--parallel','4'],check=True)
  subprocess.run([cmake,'--install',str(root/'glfw-build')],check=True)
  source=root/'swingline/swingline.c';s=source.read_text()
  # macOS framework headers replace Linux libepoxy's OpenGL loader only.
  s=s.replace('#include <epoxy/gl.h>','#include <stdbool.h>\n#include <stdint.h>\n#include <OpenGL/gl3.h>');source.write_text(s)
  subprocess.run(['cc','-O2','-DGLFW_INCLUDE_NONE','-DGL_SILENCE_DEPRECATION','-I'+str(prefix/'include'),str(source),str(prefix/'lib/libglfw3.a'),'-framework','OpenGL','-framework','Cocoa','-framework','IOKit','-framework','CoreFoundation','-o',str(binary)],check=True)
 subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

A supplied 768 by 768 two-lobed grayscale input is processed by the original weighted Voronoi iteration shaders. The original SVG exporter produces exactly 300 finite circles after 10, 30 and 60 iterations. The preview preserves their positions and individual radii while rescaling the SVG coordinate system; it does not recompute stipples.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
