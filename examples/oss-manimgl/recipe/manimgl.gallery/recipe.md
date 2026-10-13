---
id: manimgl.gallery
version: 1
title: Native OpenGL mathematical surfaces
capability: manimgl graphics
tier: C
kind: python
packages: ["addict==2.4.0", "appdirs==1.4.4", "colour==0.1.5", "diskcache==5.6.3", "fonttools==4.66.0", "ipython==9.17.1", "isosurfaces==0.1.2", "manimgl==1.7.2", "manimpango==0.6.1", "mapbox-earcut==2.1.0", "matplotlib==3.11.2", "moderngl==5.12.0", "moderngl-window==3.1.1", "numpy==2.5.3", "pillow==12.3.0", "pydub==0.25.1", "pygments==2.21.0", "pyopengl==3.1.10", "pyperclip==1.11.0", "pyyaml==6.0.3", "rich==15.0.0", "scipy==1.18.1", "screeninfo==0.8.1", "setuptools==75.8.0", "skia-pathops==0.9.2", "svgelements==1.9.6", "sympy==1.14.0", "tqdm==4.70.1", "validators==0.35.0"]
source:
  name: "ManimGL"
  repo: https://github.com/3b1b/manim
  license: "MIT"
io:
  inputs:
  - name: main.py
    media: file
  - name: tested-requirements.txt
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

# Native OpenGL mathematical surfaces

ManimGL 1.7.2 renders three sinusoidal surfaces and their mesh lines with the original OpenGL camera and surface shaders.

ManimGL 1.7.2 원본 OpenGL 카메라와 곡면 셰이더로 세 진폭의 사인 곡면과 격자선을 직접 렌더했어요.

## Setup

Requires Python 3.12 and a desktop OpenGL context. Tested on macOS Apple Silicon. The original engine and its direct Python dependencies are pinned, including the original manimgl 1.7.2 package. LaTeX and video encoding are not needed because this example uses mathematical surfaces and direct native image export. Packages are installed only when the recipe is run.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import hashlib,json,runpy
from pathlib import Path
from PIL import Image
runpy.run_path('in/main.py',run_name='__main__')
images=[Image.open(Path('out')/f'render-{i}.png').convert('RGB') for i in range(3)]
assert all(im.size==(512,384) and len(im.getcolors(512*384))>100 for im in images)
assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
assert [f['amplitude'] for f in json.loads(Path('out/result.json').read_text())['frames']]==[0.25,0.65,1.05]
print('PASS native surface samples and distinct ManimGL images')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied scene samples a sinusoidal surface on a 41 by 41 grid at amplitudes 0.25, 0.65 and 1.05. Original ParametricSurface, SurfaceMesh, Scene and Camera APIs render the geometry with a fixed oblique view. Native surface samples are checked for finite coordinates; PNG dimensions, nontrivial colors and distinct outputs are validated. This uses the original 3Blue1Brown ManimGL engine rather than the separate Manim Community edition.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
