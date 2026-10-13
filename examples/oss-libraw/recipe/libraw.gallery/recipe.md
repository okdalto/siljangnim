---
id: libraw.gallery
version: 1
title: Synthetic Bayer RAW development
capability: libraw graphics
tier: C
kind: python
packages: ["numpy==2.2.6", "Pillow==11.3.0", "rawpy==0.27.1", "tifffile==2026.3.3"]
source:
  name: "LibRaw"
  repo: https://github.com/LibRaw/LibRaw
  license: "LGPL-2.1 / CDDL-1.0"
io:
  inputs:
  - name: main.py
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
  - name: input.dng
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png", "input.dng"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Synthetic Bayer RAW development

LibRaw directly decodes an original synthetic DNG and develops it with three demosaicing algorithms.

LibRaw로 직접 만든 합성 DNG를 읽고 세 가지 디모자이킹 알고리즘으로 현상했어요.

## Setup

Requires Python 3.11 or newer and the pinned packages above. Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py', 'out'], check=True)
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check packing non-overlap, focal intersections, decoded Bayer pixels or exact recognized text, as applicable.

## Scope

Small original synthetic inputs demonstrate the original engine. The viewer selects prepared outputs; rerun this recipe to change computation. SVGNest uses its placement worker, not the full genetic search. Ray Optics uses its original IdealLens methods, not its browser UI. The RAW example is synthetic, not a calibrated camera photograph.
