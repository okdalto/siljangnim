---
id: glslviewer.gallery
version: 1
title: Native OpenGL shader rosettes
capability: glslviewer graphics
tier: C
kind: python
packages: ["cmake==4.4.3", "Pillow==11.3.0"]
source:
  name: "glslViewer"
  repo: https://github.com/patriciogonzalezvivo/glslviewer
  license: "BSD-3-Clause"
io:
  inputs:
  - name: main.py
    media: file
  - name: pattern.frag
    media: file
  - name: source.json
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

# Native OpenGL shader rosettes

glslViewer 3.5.2 compiles and runs an original GLSL shader at three phase values, then exports native OpenGL screenshots.

glslViewer 3.5.2 원본에서 직접 만든 GLSL 셰이더를 세 위상 값으로 실행하고 OpenGL 결과를 저장했어요.

## Setup

This verified build recipe targets macOS with Xcode command-line tools, Python 3.12+ and an OpenGL-capable desktop session. Source archives for glslViewer 3.5.2 and its exact Vera and Lygia submodule revisions are SHA-256 verified and cached. The first source download is about 125 MB; the CMake build is cached. Git submodule updates are disabled because every source revision is supplied explicitly.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
if sys.platform!='darwin':raise RuntimeError('This verified native build recipe targets macOS with Xcode command-line tools.')
venv_bin=pathlib.Path(sys.executable).absolute().parent;cmake=str(venv_bin/'cmake') if (venv_bin/'cmake').is_file() else shutil.which('cmake');compiler=shutil.which('c++')
if not cmake or not compiler:raise RuntimeError('CMake and a C++ compiler are required.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'glslviewer';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256(json.dumps(config,sort_keys=True).encode()+platform.platform().encode()+subprocess.check_output([compiler,'--version'])+b'cmake-policy-3.5-no-git-v1').hexdigest();root=cache/key;binary=root/'build/glslViewer'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not binary.is_file():
  root.mkdir(exist_ok=True)
  for item in config['archives']:
   archive=cache/item['sha256']
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=180) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError(item['name']+' checksum mismatch')
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   target=root/'source'/item['destination']
   if not target.exists() or not any(target.iterdir()):
    with tempfile.TemporaryDirectory(dir=root) as temp:
     with tarfile.open(archive) as tar:tar.extractall(temp,filter='data')
     if target.exists():target.rmdir()
     next(pathlib.Path(temp).iterdir()).rename(target)
  subprocess.run([cmake,'-S',str(root/'source'),'-B',str(root/'build'),'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_POLICY_VERSION_MINIMUM=3.5','-DCMAKE_DISABLE_FIND_PACKAGE_Git=TRUE'],check=True)
  subprocess.run([cmake,'--build',str(root/'build'),'--parallel','4'],check=True)
 subprocess.run([sys.executable,'in/main.py',str(binary),str(root/'source/deps/vera/deps')],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied GLSL shader is original input. The original executable compiles it, sets u_phase to 0, 1 and 2 through its command API, and saves the original framebuffer using its screenshot command. No WebGL port replaces glslViewer. The driver validates square images, nontrivial colors and distinct phase results. Display pixel density can change PNG resolution; the tested Retina output is 512 by 512.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
