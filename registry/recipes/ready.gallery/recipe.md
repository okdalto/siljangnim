---
id: ready.gallery
version: 1
title: Reaction-diffusion spots on OpenCL
capability: ready graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "Ready"
  repo: https://github.com/gollygang/ready
  license: "GPL-3.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: seed.vti
    media: file
  - name: source.json
    media: file
  outputs:
  - name: concentrations-0.json
    media: file
  - name: concentrations-1.json
    media: file
  - name: concentrations-2.json
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
  - name: state-0.vti
    media: file
  - name: state-1.vti
    media: file
  - name: state-2.vti
    media: file
verify:
  params: {}
  expect_outputs: ["concentrations-0.json", "concentrations-1.json", "concentrations-2.json", "render-0.png", "render-1.png", "render-2.png", "result.json", "state-0.vti", "state-1.vti", "state-2.vti"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Reaction-diffusion spots on OpenCL

Ready 0.11.4 runs its original OpenCL Gray-Scott solver for 1000, 5000 and 15000 steps from a deterministic initial pattern.

Ready 0.11.4 원본 OpenCL 솔버에서 고정된 초기 조건으로 Gray–Scott 반응·확산을 1000·5000·15000단계 계산했어요.

## Setup

This recipe downloads and caches the official Ready 0.11.4 macOS disk image, then runs its bundled rdy command-line engine from a read-only temporary mount. Apple Silicon needs Rosetta 2 for this Intel binary. Python 3.12+ and an OpenCL device are required. Tested on Apple M5. The package download is about 35 MB.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,sys,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This package recipe is for macOS. On another platform install Ready 0.11.4 and pass rdy to in/main.py.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'ready';cache.mkdir(parents=True,exist_ok=True);archive=cache/(config['sha256']+'.dmg')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
  with urllib.request.urlopen(config['url'],timeout=180) as response:data=response.read()
  if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Ready package checksum mismatch')
  with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
  pending.replace(archive)
 with tempfile.TemporaryDirectory(prefix='siljangnim-ready-') as mount:
  subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,str(archive)],check=True)
  try:
   binary=pathlib.Path(mount)/'Ready-0.11.4-Mac/rdy'
   if not binary.is_file():raise RuntimeError('rdy is missing from the pinned package')
   subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
  finally:subprocess.run(['hdiutil','detach',mount],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The upstream self-replicating-spots input is adapted by replacing initial white noise with a constant concentration. The original OpenCL engine advances the simulation and saves native VTI snapshots. Its own data export supplies reagent concentrations; the driver checks finite values, concentration bounds and different total mass at each time. PNGs are nearest-neighbor grayscale visualizations of original reagent B, with a fixed 0 to 0.5 scale.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
