---
id: galaxy-renderer.gallery
version: 1
title: Spiral arms from native orbital elements
capability: galaxy-renderer graphics
tier: C
kind: python
packages: []
source:
  name: "Galaxy Renderer"
  repo: https://github.com/beltoforion/Galaxy-Renderer
  license: "BSD-2-Clause"
io:
  inputs:
  - name: main.cpp
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

# Spiral arms from native orbital elements

Galaxy Renderer computes 12,000 stellar orbits and rotation curves; compare three angular offsets in a face-on view.

Galaxy Renderer 원본 C++ 코어로 별 12,000개의 궤도와 회전 곡선을 계산하고 세 가지 나선팔 감김을 비교해요.

## Setup

Requires Python 3.12+ and a C++17 compiler. The pinned original source archive is SHA-256 verified. The recipe compiles the original Galaxy.cpp, Helper.cpp and CumulativeDistributionFunction.cpp with an input/export driver; source and binary are cached by source hash, compiler version and platform. No SDL window or GPU is needed for this CPU core.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
ID='galaxy-renderer'
compiler=shutil.which('c++')
if not compiler:raise RuntimeError('Install a native C++17 compiler (c++).')
config=json.loads(pathlib.Path('in/source.json').read_text());driver=pathlib.Path('in/main.cpp').read_bytes();cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/ID;cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(config['sha256'].encode()+driver+platform.platform().encode()+subprocess.check_output([compiler,'--version'])).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz');binary=root/'renderer'
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
  source=next(p for p in root.iterdir() if p.is_dir() and (p/'Galaxy.cpp').is_file())
  (root/'main.cpp').write_bytes(driver)
  subprocess.run([compiler,'-std=c++17','-O2','-I'+str(source/'include'),'-I'+str(source/'dependencies/glew-2.1.0/include'),str(root/'main.cpp'),str(source/'Galaxy.cpp'),str(source/'Helper.cpp'),str(source/'CumulativeDistributionFunction.cpp'),'-o',str(binary)],check=True)
 pathlib.Path('out').mkdir(exist_ok=True)
 subprocess.run([str(binary),'out/result.json'],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original galaxy core generates 12,000 stars with seed 17, a 13,000 parsec radius and angular offsets 0.00015, 0.0004 and 0.00065. It supplies semi-axes, phase, velocity, tilt, temperature, magnitude and dark-matter/no-dark-matter rotation curves. The export driver projects these native orbital elements into a face-on snapshot at time zero. This is a core computation example with a simple point visualization, not a capture of the full SDL galaxy renderer.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
