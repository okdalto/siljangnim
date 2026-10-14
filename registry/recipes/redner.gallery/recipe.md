---
id: redner.gallery
version: 1
title: Recovering a triangle with native rendering gradients
capability: redner graphics
tier: C
kind: python
packages: []
source:
  name: "redner"
  repo: https://github.com/bachili/redner
  license: "MIT"
io:
  inputs:
  - name: main.py
    media: file
  - name: requirements.txt
    media: file
  - name: source.json
    media: file
  - name: wheels.json
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

# Recovering a triangle with native rendering gradients

Original redner 0.4.28 differentiates CPU renderings to fit a triangle to a native target image, reducing image error by 99.2%.

원본 redner 0.4.28이 CPU 렌더링을 미분해 삼각형을 목표 이미지에 맞췄어요. 이미지 오차가 약 99.2% 줄었어요.

## Setup

Requires Apple Silicon macOS with Rosetta 2 already available, and Python 3.12+ to run this installer. The recipe downloads SHA-256 verified Python 3.8.20, uv 0.11.13 and 29 exact original wheels into a private cache. The pinned uv installer relocates the Intel Python runtime from a verified local archive; macOS codesign adds a local ad-hoc signature to that private runtime so Rosetta can launch it reliably. It does not install a global Python or change security settings. All rendering uses redner 0.4.28 and PyTorch 2.2.2 on the CPU. The original wheel expects an alternate Embree filename, so the driver adds a local alias to its bundled library without changing native engine code.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

원본 엔진·의존성 29개와 Intel Python을 처음 실행할 때 받아 검증하고 전용 캐시에 보관합니다. Rosetta 2가 필요합니다. 전용 Python에만 로컬 서명을 적용하며 전역 Python이나 보안 설정을 바꾸지 않습니다. 원본 렌더러가 계산한 미분값으로 60번 최적화하고 실제 손실·정점 좌표를 저장합니다. 병렬 계산의 작은 반올림 차이는 검증 허용 범위로 비교합니다.

## Run

```python
from pathlib import Path
import urllib.parse
import fcntl,hashlib,json,os,platform,subprocess,tarfile,tempfile,urllib.request,shutil
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This pinned redner runtime requires Apple Silicon macOS with Rosetta 2 already available.')
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());wheels=json.loads((inputs/'wheels.json').read_text())
key=hashlib.sha256(b'redner-cpu-v5'+(inputs/'source.json').read_bytes()+(inputs/'requirements.txt').read_bytes()+(inputs/'wheels.json').read_bytes()).hexdigest()
cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache')).resolve()/'siljangnim/redner';cache.mkdir(parents=True,exist_ok=True);archives=cache/'archives';archives.mkdir(exist_ok=True);root=cache/key[:24]

def fetch(item):
 archive=archives/item['sha256']
 if archive.is_file():
  with archive.open('rb') as f:
   if hashlib.file_digest(f,'sha256').hexdigest()==item['sha256']:return archive
 with tempfile.NamedTemporaryFile(dir=archives,delete=False) as f:
  pending=Path(f.name)
  with urllib.request.urlopen(item['url'],timeout=180) as response:shutil.copyfileobj(response,f)
 with pending.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
 if digest!=item['sha256']:pending.unlink();raise RuntimeError('redner dependency checksum mismatch')
 pending.replace(archive);return archive

with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  root.mkdir(exist_ok=True)
  dest=root/'uv';dest.mkdir(exist_ok=True)
  with tarfile.open(fetch(config['uv'])) as tar:tar.extractall(dest,filter='data')
  wheelhouse=root/'wheels';wheelhouse.mkdir(exist_ok=True)
  for item in wheels:
   dest=wheelhouse/item['filename']
   if not dest.exists():os.link(fetch(item),dest)
  uv=next((root/'uv').glob('*/uv'))
  mirror=root/'mirror'/config['python']['version'].split('+')[1];mirror.mkdir(parents=True,exist_ok=True)
  archive=mirror/urllib.parse.unquote(config['python']['url'].split('/')[-1])
  if not archive.exists():os.link(fetch(config['python']),archive)
  subprocess.run([str(uv),'python','install','--no-bin','--install-dir','python','--mirror',(root/'mirror').resolve().as_uri(),'cpython-3.8.20-macos-x86_64-none'],cwd=root,check=True,timeout=300)
  python=root/'python/cpython-3.8.20-macos-x86_64-none/bin/python3.8' 
  # Sign this private runtime locally so Rosetta can launch it reliably on macOS.
  for binary in [python.parent.parent/'lib/libpython3.8.dylib',python]:
   subprocess.run(['/usr/bin/codesign','--force','--sign','-',str(binary)],check=True,timeout=60)
  subprocess.run([str(uv),'venv','--clear','--python',str(python),'--no-python-downloads',str(root/'venv')],check=True)
  subprocess.run([str(uv),'pip','install','--python',str(root/'venv/bin/python'),'--no-index','--find-links',str(wheelhouse),'--no-deps','--requirement',str(inputs/'requirements.txt')],check=True)
  # The original Intel wheel expects this Embree filename; expose its bundled library without changing native code.
  site=root/'venv/lib/python3.8/site-packages';(site/'libembree3.3.dylib').symlink_to('libembree3.dylib')
  (root/'.ready').write_text(key)
 env={**os.environ,'OMP_NUM_THREADS':'2','MPLBACKEND':'Agg','DYLD_LIBRARY_PATH':str(root/'venv/lib/python3.8/site-packages')}
 subprocess.run([str(root/'venv/bin/python'),str(inputs/'main.py')],env=env,check=True,timeout=1800)
 frames=json.loads((out/'result.json').read_text())['frames'];assert len(frames)==3 and frames[-1]['mse']<frames[0]['mse']*.3
 print('PASS original redner CPU rendering and native edge gradients in cached Intel Python 3.8 runtime')
```

## Verify

Two executions of the complete cached recipe passed finite-gradient and loss-reduction checks. Parallel native reductions can round differently. Required tolerances were mean RGB difference below 1 on a 0–255 scale, vertex-coordinate difference below 0.01 and relative MSE difference below 5%. Observed maxima were 0.00280, 0.000330 and 0.0694%, respectively. Final target-image error decreased by 99.23%.

전체 레시피를 캐시에서 두 번 실행했습니다. 병렬 계산의 반올림 차이를 고려해 RGB 평균 차이 1/255 미만, 정점 좌표 차이 0.01 미만, MSE 상대 차이 5% 미만을 확인했습니다. 실제 최대 차이는 각각 0.00280/255, 0.000330, 0.0694%였고, 목표 이미지 오차는 99.23% 줄었습니다.

## Scope

A supplied triangle and area light produce the target image with the original path tracer. Three perturbed vertices are optimized by Adam using native redner edge gradients for 60 steps. Each panel compares the target, the current native rendering and their amplified difference. Display renders use 64 samples per pixel, optimization uses 8, and all gradient values must be finite. Saved loss histories and vertex coordinates document the actual optimization. This is an inverse-rendering example, not a pretrained-model result.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
