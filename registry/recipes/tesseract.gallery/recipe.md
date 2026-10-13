---
id: tesseract.gallery
version: 1
title: Native OCR under image distortion
capability: tesseract graphics
tier: C
kind: python
packages: ["Pillow==11.3.0", "tesserocr==2.11.0"]
source:
  name: "Tesseract"
  repo: https://github.com/tesseract-ocr/tesseract
  license: "Apache-2.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: result.json
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: input-0.png
    media: file
  - name: input-1.png
    media: file
  - name: input-2.png
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png", "input-0.png", "input-1.png", "input-2.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Native OCR under image distortion

Tesseract recognizes original synthetic text in clean, rotated and blurred images and returns word boxes.

Tesseract로 직접 만든 문자의 원본·회전·흐림 이미지를 인식하고 단어 영역을 얻었어요.

## Setup

Requires Python 3.11 or newer and the pinned packages above. Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py', 'in/source.json', 'out'], check=True)
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check packing non-overlap, focal intersections, decoded Bayer pixels or exact recognized text, as applicable.

## Scope

Small original synthetic inputs demonstrate the original engine. The viewer selects prepared outputs; rerun this recipe to change computation. SVGNest uses its placement worker, not the full genetic search. Ray Optics uses its original IdealLens methods, not its browser UI. The RAW example is synthetic, not a calibrated camera photograph.
