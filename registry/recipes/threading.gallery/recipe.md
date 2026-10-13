---
id: threading.gallery
version: 1
title: String art from an original spiral
capability: threading graphics
tier: C
kind: python
packages: []
source:
  name: "Threading"
  repo: https://github.com/piellardj/image-stylization-threading
  license: "GPL-3.0"
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
  - name: threads-0.svg
    media: file
  - name: threads-1.svg
    media: file
  - name: threads-2.svg
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-1.png", "render-2.png", "result.json", "threads-0.svg", "threads-1.svg", "threads-2.svg"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# String art from an original spiral

The original Threading app converts an original spiral image into 500, 1,500 and 3,000 thread segments and exports native SVG results.

Threading 원본 앱에 직접 만든 나선 이미지를 넣어 500·1,500·3,000개 실 선분과 SVG 결과를 생성했어요.

## Setup

Requires Python 3.12+ and Electron (tested with 44.4.4). Set ELECTRON to its executable if it is not on PATH. Map runner.cjs and source.json into in/. Original app files are SHA-256 verified and cached; a hidden browser window executes the app against a loopback server. No upstream gallery image is used as output.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile,urllib.request
binary=os.environ.get('ELECTRON') or shutil.which('electron')
if not binary:raise RuntimeError('Install Electron or set ELECTRON to its executable path. Tested with Electron 44.4.4.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'threading';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.tar.gz')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Threading source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  (root/'ready').write_text(config['sha256'])
 source=next(p for p in root.iterdir() if p.is_dir() and (p/'docs/index.html').is_file())
 with tempfile.TemporaryDirectory(prefix='siljangnim-threading-') as profile:
  env={**os.environ,'THREADING_PROFILE':profile};env.pop('ELECTRON_RUN_AS_NODE',None)
  subprocess.run([binary,str(pathlib.Path('in/runner.cjs').absolute()),str(source),str(pathlib.Path('out').absolute())],env=env,check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

The unmodified public Threading application is served on a loopback-only HTTP server in an isolated Electron profile. An original spiral image is created in the input driver and supplied through the actual file input. The original optimizer produces 500, 1500 and 3000 segments. The driver waits for the actual segment count and captures the original canvas and native SVG export. Math.random is seeded before input for reproducibility; the threading algorithm is unchanged. The temporary browser profile is removed after execution.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
