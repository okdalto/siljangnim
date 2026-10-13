---
id: py5.gallery
version: 1
title: Woven waves in Processing
capability: py5 graphics
tier: C
kind: python
packages: ["py5==0.10.11a0", "JPype1==1.6.0", "Pillow==11.3.0"]
source:
  name: "py5"
  repo: https://github.com/py5coding/py5
  license: "LGPL-2.1"
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

# Woven waves in Processing

py5 runs its original Processing JAVA2D renderer to draw 32 layered curves at three amplitudes.

py5 원본 Processing JAVA2D 렌더러로 32개 곡선을 그리고 세 가지 진폭의 결과를 비교해요.

## Setup

Requires Java 21 (tested with Temurin 21.0.8+9), Python 3.12+, and a desktop display. Set JAVA_HOME to your Java installation. The Python packages include the original py5/Processing renderer; the hub caches its isolated environment. A temporary Processing window opens for rendering and closes on completion.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import pathlib,subprocess,sys,json
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True)
for name in ['result.json','render-0.png','render-1.png','render-2.png']:(out/name).unlink(missing_ok=True)
# macOS Processing can exit the interpreter itself, so validation runs in this parent process.
subprocess.run([sys.executable,'in/main.py'],check=True,timeout=120)
meta=json.loads((out/'result.json').read_text());assert len(meta['frames'])==3
pixels=[]
for i in range(3):
 with Image.open(out/f'render-{i}.png') as im:
  im.load();assert im.width>=600 and im.height>=600
  assert len(im.convert('RGB').getcolors(2000000) or [])>100
  pixels.append(im.tobytes())
assert len(set(pixels))==3
print('PASS actual py5/Processing renders and distinct amplitude variants')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

Original py5 and Processing APIs render a new wave drawing using begin_shape, vertex, stroke and save_frame. The drawing is original input code; the JAVA2D renderer is the original library. Each of the three PNGs is captured through Processing save_frame, not through a replacement drawing library.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
