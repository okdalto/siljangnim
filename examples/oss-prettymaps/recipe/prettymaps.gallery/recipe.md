---
id: prettymaps.gallery
version: 1
title: A fictional city through the original map renderer
capability: prettymaps graphics
tier: C
kind: python
packages: ["numpy==1.26.4", "matplotlib==3.9.4", "shapely==2.0.7", "osmnx==1.9.3", "ipykernel==6.29.5", "geopandas==1.1.4", "pandas==2.3.3", "Pillow==12.3.0"]
source:
  name: "prettymaps"
  repo: https://github.com/marceloprates/prettymaps
  license: "AGPL-3.0"
io:
  inputs:
  - name: main.py
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

# A fictional city through the original map renderer

prettymaps 1.3.0 renders five supplied geometry layers and 174 buildings in warm-paper, night-ink and graphite styles.

prettymaps 1.3.0 원본 렌더러로 직접 만든 다섯 지형 레이어와 건물 174개를 세 가지 스타일로 그렸어요.

## Setup

Requires Python 3.12. The original prettymaps 1.3.0 wheel is SHA-256 verified, cached and loaded without source changes. Its old packaging metadata requires NumPy below 1.25; this recipe explicitly tests the unchanged source with NumPy 1.26.4 on Python 3.12 instead. The listed dependencies provide that tested environment; do not separately pip-install prettymaps into it.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Python 3.12에서 원본 prettymaps 1.3.0 소스와 NumPy 1.26.4의 조합을 검증했습니다. 원본 패키지의 오래된 NumPy 버전 제한 때문에 패키지 소스를 체크섬 확인 후 직접 로드하며 알고리즘은 수정하지 않았습니다. 직접 만든 가상 도시를 사용하므로 OpenStreetMap 다운로드는 없습니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,runpy,sys,tempfile,urllib.request,zipfile
from PIL import Image
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'prettymaps';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.whl')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('prettymaps source wheel checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with zipfile.ZipFile(archive) as z:z.extractall(root)
  (root/'ready').write_text(config['sha256'])
 sys.path.insert(0,str(root));runpy.run_path(str(inputs/'main.py'),run_name='__main__')
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(512,512) and len(im.getcolors(512*512))>100 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 frames=json.loads((output/'result.json').read_text())['frames'];assert all(f['layers']==5 and f['buildings']>100 for f in frames)
 print('PASS original prettymaps source on Python 3.12 with NumPy 1.26.4; valid layers and distinct maps')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The input constructs a fictional circular city as five GeoDataFrames: perimeter, water, parks, streets and buildings. Original prettymaps.plot with a supplied Plot backup executes the native drawing pipeline without an OpenStreetMap request. Geometry validity, 174 buildings, five layers and three distinct 512 by 512 images are verified. No external map or rendered example is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
