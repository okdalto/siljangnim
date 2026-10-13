---
id: lineintegralconvolutions.gallery
version: 1
title: Vector flow through convolution
capability: lineintegralconvolutions graphics
tier: C
kind: python
packages: ["line-integral-convolutions==2.1.0", "rlic==0.5.3", "ahe==0.1.0", "numpy==2.2.6", "scipy==1.17.1", "matplotlib==3.11.2", "Pillow==11.3.0"]
source:
  name: "LineIntegralConvolutions"
  repo: https://github.com/astrokriel/lineintegralconvolutions
  license: "MIT"
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
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Vector flow through convolution

Line Integral Convolutions directly computes three LIC images from an original synthetic vector field.

Line Integral Convolutions로 직접 만든 벡터장의 LIC 이미지를 세 적분 길이로 계산했어요.

## Setup

Requires Python 3.11 or newer and the pinned packages above. Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py', 'out'], check=True)
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check finite geometry, classification loss and accuracy, LIC contrast or pitch error and confidence, as applicable.

## Scope

The original LIC API uses its rLIC backend with a synthetic vector field, fixed seed 42 and three kernel lengths. Filtering and equalization also run through the original package. The viewer selects prepared outputs; rerun the recipe to change computation.

