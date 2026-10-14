---
id: kepler-gl.gallery
version: 1
title: Native geographic point and bin layers
capability: kepler-gl graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "kepler.gl"
  repo: https://github.com/keplergl/kepler.gl
  license: "MIT"
io:
  inputs:
  - name: capture.html
    media: file
  - name: runner.cjs
    media: file
  - name: sources.json
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

# Native geographic point and bin layers

kepler.gl 2.5.5 loads 2,400 supplied coordinates and renders original point, square-grid and hexagonal aggregation layers without remote map tiles.

kepler.gl 2.5.5에 직접 만든 좌표 2,400개를 넣어 점·사각 격자·육각 집계를 원본 엔진으로 렌더했어요. 외부 지도 타일은 사용하지 않아요.

## Setup

Requires Python 3.12+ and Electron on PATH or through ELECTRON; tested with Electron 44.4.4 on macOS. Original kepler.gl 2.5.5, exact React/Redux/styled-components dependencies and Mapbox CSS are downloaded, SHA-256 verified and cached. The application uses an inline blank map style and blocks remote browser requests, so no map-service token is required. deckGlProps.useDevicePixels=false avoids an old-renderer Retina viewport mismatch without modifying engine source.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Python 3.12 이상과 Electron이 필요합니다. 직접 만든 가상 좌표를 사용하며 실제 관측 자료가 아닙니다. 배경 지도를 비워 외부 지도 서비스·토큰 없이 원본 점·격자·육각 집계를 실행합니다. 원본 엔진 수정 없이 지원되는 화면 배율 옵션으로 Retina 표시를 맞췄습니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tempfile,urllib.request
from PIL import Image,ImageStat
binary=os.environ.get('ELECTRON') or shutil.which('electron')
if not binary:raise RuntimeError('Install Electron or set ELECTRON to its executable. Tested with Electron 44.4.4.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'kepler-gl';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();root=cache/key;root.mkdir(exist_ok=True)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for item in sources:
  target=root/item['name']
  if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
   with urllib.request.urlopen(item['url'],timeout=180) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Native dependency checksum mismatch: '+item['name'])
   with tempfile.NamedTemporaryFile(dir=root,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(target)
 with tempfile.TemporaryDirectory(prefix='siljangnim-kepler-') as tmp:
  work=pathlib.Path(tmp);(work/'vendor').symlink_to(root,target_is_directory=True);shutil.copy(inputs/'capture.html',work/'capture.html')
  env={**os.environ,'KEPLER_PROFILE':str(work/'profile')};env.pop('ELECTRON_RUN_AS_NODE',None)
  subprocess.run([binary,str(inputs/'runner.cjs'),str(work),str(output)],env=env,check=True,timeout=120)
 frames=json.loads((output/'result.json').read_text())['frames'];assert [f['type'] for f in frames]==['point','grid','hexagon'] and all(f['points']==2400 for f in frames)
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.width==im.height and im.width>=512 and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original kepler.gl point, grid and hexagonal layers with 2400 own coordinates')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

A seeded synthetic field near Seoul supplies 2,400 coordinates and weights. Original Redux addDataToMap, data containers, point layers and grid/hexagonal aggregation run in the original KeplerGl component. The preview compares native screenshots, including the original application attribution. The coordinates are synthetic, not measured observations, and the background contains no external map data. The driver verifies the native data count, layer types, nonblank images and distinct results.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
