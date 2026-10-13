---
id: origami-simulator.gallery
version: 1
title: A dynamically folded accordion
capability: origami-simulator graphics
tier: C
kind: python
packages: []
source:
  name: "Origami Simulator"
  repo: https://github.com/amandaghassaei/origamisimulator
  license: "MIT"
io:
  inputs:
  - name: accordion.fold
    media: file
  - name: runner.cjs
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# A dynamically folded accordion

Original Origami Simulator GPU dynamics folds a new four-panel pattern at 0%, 35% and 70%, with edge strain checked below 0.2%.

Origami Simulator 원본 GPU 솔버로 직접 만든 네 칸 접기 패턴을 0%·35%·70% 접고 모서리 변형률을 검증했어요.

## Setup

Requires Python 3.12+ and Electron with WebGL support (tested with Electron 44.4.4). Set ELECTRON to the executable if needed. Original app files are SHA-256 verified and cached; an isolated temporary browser profile runs them through a loopback-only server.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile,urllib.request
binary=os.environ.get('ELECTRON') or shutil.which('electron')
if not binary:raise RuntimeError('Install Electron or set ELECTRON to its executable path. Tested with Electron 44.4.4.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'origami-simulator';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.tar.gz')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Origami Simulator source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  (root/'ready').write_text(config['sha256'])
 source=next(p for p in root.iterdir() if p.is_dir() and (p/'index.html').is_file())
 with tempfile.TemporaryDirectory(prefix='siljangnim-origami-simulator-') as profile:
  env={**os.environ,'ORIGAMI_PROFILE':profile};env.pop('ELECTRON_RUN_AS_NODE',None)
  subprocess.run([binary,str(pathlib.Path('in/runner.cjs').absolute()),str(source),str(pathlib.Path('out').absolute())],env=env,check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied accordion.fold is original input. The original FOLD importer triangulates it and the original GPU dynamic solver runs exactly 2000 steps at each fold percentage, resetting before each result. Native positions and faces are exported. Checks require finite positions, a genuinely nonplanar folded result, and edge strain below 0.2% (observed below 0.02%). The viewer draws the exported native mesh rather than recreating the folding solver.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
