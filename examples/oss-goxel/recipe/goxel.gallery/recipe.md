---
id: goxel.gallery
version: 1
title: Voxel solids exported as native meshes
capability: goxel graphics
tier: C
kind: python
packages: ["scons==4.9.1", "cmake==4.4.3"]
source:
  name: "Goxel"
  repo: https://github.com/guillaumechereau/goxel
  license: "GPL-3.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
  - name: surface-0.ply
    media: file
  - name: surface-1.ply
    media: file
  - name: surface-2.ply
    media: file
  - name: volume-0.vox
    media: file
  - name: volume-1.vox
    media: file
  - name: volume-2.vox
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "surface-0.ply", "surface-1.ply", "surface-2.ply", "volume-0.vox", "volume-1.vox", "volume-2.vox"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Voxel solids exported as native meshes

Goxel 0.15.1 stores original voxel solids and exports PLY surfaces and MagicaVoxel volumes for three cylindrical bore sizes.

Goxel 0.15.1 원본으로 세 가지 구멍 크기의 복셀 입체를 만들고 PLY 메시와 VOX 파일로 내보냈어요.

## Setup

This build recipe targets macOS with Xcode command-line tools and an active graphical desktop. It verifies and caches Goxel 0.15.1 sources and GLFW 3.4, builds static GLFW and the original Goxel CLI, and disables the unused Yocto ray tracer. The only build-file adaptation points dependency discovery to the pinned GLFW. Python 3.12+ is required.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
if sys.platform!='darwin':raise RuntimeError('This verified build recipe targets macOS with Xcode command-line tools.')
venv_bin=pathlib.Path(sys.executable).absolute().parent
cmake=str(venv_bin/'cmake') if (venv_bin/'cmake').is_file() else shutil.which('cmake');compiler=shutil.which('c++');scons=str(venv_bin/'scons') if (venv_bin/'scons').is_file() else shutil.which('scons')
if not all([cmake,compiler,scons]):raise RuntimeError('CMake, SCons and a C++17 compiler are required.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'goxel';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256(json.dumps(config,sort_keys=True).encode()+platform.platform().encode()+subprocess.check_output([compiler,'--version'])+b'mac-glfw-static-v1').hexdigest();root=cache/key;binary=root/'goxel'/'goxel'
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
  # Dependency discovery only: use our pinned static GLFW instead of system pkg-config.
  p=root/'goxel/SConstruct';s=p.read_text();needle="env.ParseConfig('pkg-config --cflags --libs glfw3')"
  if needle in s:s=s.replace(needle,f"env.Append(CPPPATH=[{str(prefix/'include')!r}], LIBPATH=[{str(prefix/'lib')!r}], LIBS=['glfw3'], FRAMEWORKS=['IOKit', 'CoreFoundation'])");p.write_text(s)
  subprocess.run([scons,'-C',str(root/'goxel'),'mode=release','werror=0','yocto=0','-j4'],check=True)
 subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied driver defines three voxel sphere-minus-cylinder inputs through original Goxel JavaScript volume APIs. Original native PLY and VOX exporters execute. PLY vertices, indices and exported volume signatures are checked. The preview rescales coordinates and triangulates exported quads for display; it does not rebuild the voxel surface algorithm.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
