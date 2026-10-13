---
id: stipplegen.gallery
version: 1
title: Weighted Lloyd relaxation in Processing
capability: stipplegen graphics
tier: C
kind: python
packages: ["JPype1==1.6.0", "packaging==25.0", "Pillow==11.3.0"]
source:
  name: "StippleGen"
  repo: https://github.com/evil-mad/stipplegen
  license: "LGPL-2.1-or-later"
io:
  inputs:
  - name: input.png
    media: file
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: points-1.csv
    media: file
  - name: points-12.csv
    media: file
  - name: points-4.csv
    media: file
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
  expect_outputs: ["points-1.csv", "points-12.csv", "points-4.csv", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Weighted Lloyd relaxation in Processing

StippleGen executes its original Processing sketch and captures 500 weighted stipples at generations 1, 4 and 12.

StippleGen 원본 Processing 스케치를 실행해 1·4·12세대의 가중 점 500개와 원본 화면을 저장했어요.

## Setup

Requires Java 21, Python 3.12+ and a graphical desktop. Tested on macOS Apple Silicon. The recipe verifies and caches StippleGen revision ef2e3ca3c52af298e9e63b3c3d8f9a3414d18656, Processing 4.4.0, ControlP5 2.2.6, Toxiclibs 0021 and the pinned Java compilation dependencies. Processing preprocessor and Eclipse compiler compile the original PDE sketch; a Java runtime is sufficient without a separate JDK.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,subprocess,sys,tempfile,urllib.request,zipfile
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'stipplegen';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(json.dumps(config,sort_keys=True).encode()).hexdigest();root=cache/key;root.mkdir(exist_ok=True)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for item in config['artifacts']:
  target=root/item['name']
  if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
   with urllib.request.urlopen(item['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError(item['name']+' checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=root,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(target)
  if item['name'].endswith('.zip'):
   with zipfile.ZipFile(target) as z:
    for name in ['controlP5.jar','toxiclibscore.jar','toxiclibs_p5.jar']:
     members=[n for n in z.namelist() if n.endswith('/library/'+name) and not n.startswith('__MACOSX/')]
     if members:(root/name).write_bytes(z.read(members[0]))
 subprocess.run([sys.executable,'in/main.py',str(root)],check=True)
```

## Verify

The original engine was executed repeatedly using cached dependencies. Native Voronoi region order can vary, so unordered point sets were compared: maximum observed coordinate difference was 0.207 pixels, below the 1 pixel threshold. Original canvas images passed mean absolute RGB difference below 1 on a 0–255 scale (observed zero). Each output contains exactly 500 finite points.

원본 엔진을 반복 실행했습니다. 보로노이 영역의 저장 순서가 달라질 수 있어 점 집합을 순서와 무관하게 비교했으며 최대 좌표 차이는 약 0.207픽셀로 기준 1픽셀 이내였습니다. 원본 화면의 RGB 평균 절대 차이도 255점 척도에서 기준 1 이내였고, 실제 관측값은 0이었습니다.

## Scope

The original weighted Lloyd algorithm processes the supplied two-lobed grayscale input. The adapter changes the input path, seed and point count to 500, and adds checkpoint export hooks. It preserves the original algorithm and rendering. The original Processing canvas and 500 native point coordinates are saved at generations 1, 4 and 12. No screenshot from the upstream gallery is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
