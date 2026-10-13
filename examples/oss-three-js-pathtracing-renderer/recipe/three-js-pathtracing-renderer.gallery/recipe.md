---
id: three-js-pathtracing-renderer.gallery
version: 1
title: Materials under native path tracing
capability: three-js-pathtracing-renderer graphics
tier: C
kind: python
packages: []
source:
  name: "THREE.js-PathTracing-Renderer"
  repo: https://github.com/erichlof/three.js-pathtracing-renderer
  license: "CC0-1.0 (project LICENSE)"
io:
  inputs:
  - name: runner.cjs
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

# Materials under native path tracing

The original THREE.js PathTracing Renderer accumulates 96 samples for diffuse clearcoat, copper and refractive materials.

THREE.js PathTracing Renderer 원본에서 코팅 확산·구리·굴절 재질을 각각 96개 샘플로 누적 렌더했어요.

## Setup

Requires Python 3.12+ and Electron with WebGL2 support (tested with Electron 44.4.4). Set ELECTRON to its executable if needed. The source archive is about 79 MB and is verified and cached only when rerunning the recipe. The app runs against a loopback-only server in a temporary browser profile.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile,urllib.request
binary=os.environ.get('ELECTRON') or shutil.which('electron')
if not binary:raise RuntimeError('Install Electron or set ELECTRON to its executable path. Tested with Electron 44.4.4.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'three-js-pathtracing-renderer';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.tar.gz')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('THREE.js PathTracing Renderer source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  (root/'ready').write_text(config['sha256'])
 source=next(p for p in root.iterdir() if p.is_dir() and (p/'Material_Roughness.html').is_file())
 with tempfile.TemporaryDirectory(prefix='siljangnim-three-js-pathtracing-renderer-') as profile:
  env={**os.environ,'PATHTRACER_PROFILE':profile};env.pop('ELECTRON_RUN_AS_NODE',None)
  subprocess.run([binary,str(pathlib.Path('in/runner.cjs').absolute()),str(source),str(pathlib.Path('out').absolute())],env=env,check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The upstream Material Roughness scene and original rendering shaders execute unchanged. The driver selects original material controls, seeds Math.random and advances the original animation function under controlled scheduling until the native sample counter reaches exactly 96. Each PNG is captured from the original renderer canvas immediately after rendering; no gallery image or replacement path tracer is used. Native WebGL sampling is repeatable on the tested GPU; other GPUs can differ slightly.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
