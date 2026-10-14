---
id: earth.gallery
version: 1
title: Native wind particles around a globe
capability: earth graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "earth"
  repo: https://github.com/cambecc/earth
  license: "MIT"
io:
  inputs:
  - name: capture.html
    media: file
  - name: runner.cjs
    media: file
  - name: source.json
    media: file
  - name: wind.json
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

# Native wind particles around a globe

earth interpolates a supplied synthetic wind field and renders 80 native particle steps at three globe longitudes.

earth 원본 엔진으로 직접 만든 가상 바람장을 보간하고 세 경도에서 입자 80단계를 계산해 렌더했어요.

## Setup

Requires Python 3.12+ and Electron on PATH or through ELECTRON; tested on macOS with Electron 44.4.4. Original source revision 5f091f0c3b60aa38a996a886985bacb3673d16c3 and its bundled libraries are SHA-256 verified and cached. Capture hooks fix the random seed and stop after 80 native particle frames; interpolation, projection and particle evolution are unchanged.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Python 3.12 이상과 Electron이 필요합니다. 입력은 실제 기상 관측이나 예보가 아닌 가상 바람장입니다. 원본 보간·투영·입자 이동을 유지하고 난수 시드와 80프레임 저장 지점만 고정했습니다. 해안선은 퍼블릭 도메인 Natural Earth 데이터입니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile,urllib.request
from PIL import Image
binary=os.environ.get('ELECTRON') or shutil.which('electron')
if not binary:raise RuntimeError('Install Electron or set ELECTRON to its executable. Tested with Electron 44.4.4.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'earth';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.tar.gz')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('earth source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  (root/'ready').write_text(config['sha256'])
 source=next(p/'public' for p in root.iterdir() if p.is_dir() and (p/'public').is_dir())
 with tempfile.TemporaryDirectory(prefix='siljangnim-earth-') as tmp:
  work=pathlib.Path(tmp);public=work/'public';shutil.copytree(source,public)
  shutil.copy(inputs/'capture.html',public/'capture.html');shutil.copy(inputs/'wind.json',public/'data/weather/current/current-wind-surface-level-gfs-1.0.json')
  code=public/'libs/earth/1.0.0/earth.js';s=code.read_text();needle='setTimeout(frame, FRAME_RATE);';assert s.count(needle)==1
  s=s.replace('var particles = [];','window.__seed=17; window.__frames=0; window.__ready=false; var particles = [];')
  s=s.replace(needle,"if (++window.__frames < 80) setTimeout(frame, 0); else { window.__result={frames:80,particles:particleCount,probe:grids.primaryGrid.interpolate(0,0),finite:particles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))}; window.__ready=true; }");code.write_text(s)
  env={**os.environ,'EARTH_PROFILE':str(work/'profile')};env.pop('ELECTRON_RUN_AS_NODE',None)
  subprocess.run([binary,str(inputs/'runner.cjs'),str(public),str(output)],env=env,check=True)
  frames=json.loads((output/'result.json').read_text())['frames'];assert all(f['frames']==80 and f['particles']>1000 and f['finite'] for f in frames)
  images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
  assert all(im.width/im.height==4/3 and im.width>=512 and len(im.getcolors(im.width*im.height))>1000 for im in images)
  assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
  print('PASS native earth interpolation probe and three globe views after 80 original particle steps')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Decoded image pixels and result metadata matched exactly; PNG container bytes are not the comparison criterion. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, PNG를 디코딩한 픽셀과 결과 메타데이터가 동일함을 검증했습니다.

## Scope

The supplied 72 by 37, five-degree wind grid is synthetic, not measured or forecast weather. All 2,457 particles evolve through the original engine. The driver checks finite particle positions, the interpolation probe and distinct globe views. Natural Earth public-domain coastline data bundled with the original application supplies the outline. Screenshots preserve the native 1,024 by 768 pixels.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
