---
id: precomputed-atmospheric-scattering.gallery
version: 1
title: Earth skies from native GPU scattering
capability: precomputed-atmospheric-scattering graphics
tier: C
kind: python
packages: ["cmake==4.4.3", "Pillow==11.3.0"]
source:
  name: "Precomputed Atmospheric Scattering"
  repo: https://github.com/ebruneton/precomputed_atmospheric_scattering
  license: "BSD-3-Clause"
io:
  inputs:
  - name: main.cpp
    media: file
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: render-0.png
    media: file
  - name: render-0.ppm
    media: file
  - name: render-1.png
    media: file
  - name: render-1.ppm
    media: file
  - name: render-2.png
    media: file
  - name: render-2.ppm
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-0.ppm", "render-1.png", "render-1.ppm", "render-2.png", "render-2.ppm", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Earth skies from native GPU scattering

The original atmospheric model precomputes four scattering orders on the GPU and renders skies at three solar elevations.

원본 대기 모델에서 4차 산란까지 GPU로 계산하고 태양 고도 5·20·60도의 하늘을 직접 렌더했어요.

## Setup

Requires macOS, Xcode command-line tools with C++17, Python 3.12+ and a desktop OpenGL 4.1 context. Source revision 34f14e745cff948f4ca3157d1b62a445ffa7286f and GLFW 3.4 are SHA-256 verified and cached; the native executable is cached. The original model precomputes its scattering textures locally on every execution. No external lookup table or rendered sky is downloaded.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
if sys.platform!='darwin':raise RuntimeError('This verified build recipe targets macOS with Xcode command-line tools.')
venv_bin=pathlib.Path(sys.executable).absolute().parent
cmake=str(venv_bin/'cmake') if (venv_bin/'cmake').is_file() else shutil.which('cmake');compiler=shutil.which('c++')
if not all([cmake,compiler]):raise RuntimeError('CMake and a C compiler are required.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'precomputed-atmospheric-scattering';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256(json.dumps(config,sort_keys=True).encode()+platform.platform().encode()+subprocess.check_output([compiler,'--version'])+pathlib.Path('in/main.cpp').read_bytes()+b'mac-glfw-opengl-binding-v1').hexdigest();root=cache/key;binary=root/'precomputed-atmospheric-scattering'/'precomputed-atmospheric-scattering'
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
  source=root/'precomputed-atmospheric-scattering'
  for p in [source/'atmosphere/model.cc',source/'atmosphere/model.h']:
   p.write_text(p.read_text().replace('#include <glad/glad.h>','#include <OpenGL/gl3.h>'))
  for name in ['definitions','functions']:
   p=source/'atmosphere'/f'{name}.glsl';p.with_suffix('.glsl.inc').write_text('const char '+name+'_glsl[] = R"glsl(\n'+p.read_text()+'\n)glsl";\n')
  driver=pathlib.Path('in/main.cpp').absolute()
  subprocess.run([compiler,'-std=c++17','-O2','-DGLFW_INCLUDE_NONE','-DGL_SILENCE_DEPRECATION','-I'+str(source),'-I'+str(prefix/'include'),str(driver),str(source/'atmosphere/model.cc'),str(prefix/'lib/libglfw3.a'),'-framework','OpenGL','-framework','Cocoa','-framework','IOKit','-framework','CoreFoundation','-o',str(binary)],check=True)
 subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The driver uses original Earth spectral and ozone parameters and calls the original C++ Model::Init with four scattering orders and separate Mie textures. The view shader calls the original GetSkyRadiance function at 5, 20 and 60 degree sun elevations. OpenGL errors, finite transmittance in [0,1], image dimensions and distinct sky results are checked. Apple OpenGL headers replace GLAD binding discovery without altering the model. Native PPM images are converted to PNG.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
