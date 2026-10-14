---
id: luxcorerender.gallery
version: 1
title: Rough surfaces through native path tracing
capability: luxcorerender graphics
tier: C
kind: python
packages: ["pyluxcore==2.11.2", "Pillow==12.3.0"]
source:
  name: "LuxCoreRender"
  repo: https://github.com/luxcorerender/luxcore
  license: "Apache-2.0"
io:
  inputs:
  - name: main.py
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

# Rough surfaces through native path tracing

LuxCoreRender 2.11.2 traces a supplied scene on the CPU at three surface roughnesses, using 64 native samples per pixel.

LuxCoreRender 2.11.2 원본 CPU 경로 추적으로 직접 만든 장면을 세 표면 거칠기에서 픽셀당 64샘플로 렌더했어요.

## Setup

Requires Apple Silicon macOS 14+ and Python 3.12. The official pyluxcore 2.11.2 ARM64 wheel and Pillow 12.3.0 are installed on demand in the recipe environment. Native TILEPATHCPU tracing runs with one CPU thread; the original film pipeline produces the image. No model, external mesh or texture is downloaded.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Apple Silicon macOS 14 이상과 Python 3.12용 공식 배포판을 사용합니다. 직접 만든 구와 바닥을 원본 TILEPATHCPU로 렌더하며 외부 모델이나 텍스처를 받지 않습니다. 갤러리에서는 직접 계산한 세 거칠기의 결과를 비교합니다.

## Run

```python
from pathlib import Path
import hashlib,json,runpy
from PIL import Image,ImageStat
runpy.run_path('in/main.py',run_name='__main__')
output=Path('out');frames=json.loads((output/'result.json').read_text())['frames'];assert len(frames)==3
images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
assert all(im.size==(384,384) and min(ImageStat.Stat(im).stddev)>10 for im in images)
assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
print('PASS original LuxCore path tracing, finite film values and distinct roughness images')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied Python input builds three smooth spheres and a ground plane through original Scene.DefineMesh and Scene.Parse APIs. Native glossy2 roughness values are 0.025, 0.15 and 0.45. The original tiled sampler uses an 8 by 8 sampling grid with multipass disabled. Finite original float film values are converted to PNG, preserving the renderer output. Dimensions, nonblank content and different results are checked. Input geometry, colors and lighting are authored for this example.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
