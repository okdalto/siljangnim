---
id: instant-meshes.gallery
version: 1
title: Field-aligned quadrilateral remeshing
capability: instant-meshes graphics
tier: C
kind: python
packages: []
source:
  name: "Instant Meshes"
  repo: https://github.com/wjakob/instant-meshes
  license: "BSD-style 3 clauses + grant for contributed improvements"
io:
  inputs:
  - name: input.obj
    media: file
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: remesh-0.obj
    media: file
  - name: remesh-1.obj
    media: file
  - name: remesh-2.obj
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["remesh-0.obj", "remesh-1.obj", "remesh-2.obj", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Field-aligned quadrilateral remeshing

Original Instant Meshes remeshes a new rippled torus at three target densities, producing closed, all-quad native OBJ meshes.

Instant Meshes 원본으로 직접 만든 굴곡진 토러스를 세 밀도로 재메시하고 닫힌 사각형 메시인지 검증했어요.

## Setup

The SHA-256-pinned official macOS binary was last modified on 2019-11-03. It is downloaded from the original project binary link and cached. Apple Silicon requires Rosetta 2. Python 3.12+ is required; no GUI interaction or dataset download is needed. The archive is about 1.4 MB.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile,urllib.request
import sys,zipfile
if sys.platform!='darwin':raise RuntimeError('This pinned binary is for macOS. Apple Silicon requires Rosetta 2.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'instant-meshes';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.zip');binary=root/'Instant Meshes.app/Contents/MacOS/Instant Meshes'
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not binary.is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Instant Meshes archive checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with zipfile.ZipFile(archive) as z:z.extractall(root)
  binary.chmod(0o755)
 subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied input is an original closed torus with a gently rippled major radius, 2048 vertices and 4096 triangles. The original executable runs batch remeshing with deterministic algorithms and one thread. Target face counts are density controls, not promises of exact output counts: native subdivision produces 602, 1242 and 2412 quads. Checks require finite vertices, four distinct valid indices per face and exactly two faces incident to every edge. Native OBJ files and quadrilateral faces are preserved.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
