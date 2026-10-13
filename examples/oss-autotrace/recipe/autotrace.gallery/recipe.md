---
id: autotrace.gallery
version: 1
title: Pixels fitted to vector curves
capability: autotrace graphics
tier: C
kind: python
packages: ["Pillow==11.3.0", "svgpathtools==1.7.1", "numpy==2.2.6", "scipy==1.17.1", "svgwrite==1.4.3"]
source:
  name: "AutoTrace"
  repo: https://github.com/autotrace/autotrace
  license: "GPL-2+ / LGPL-2.1+"
io:
  inputs:
  - name: main.py
    media: file
  outputs:
  - name: result.json
    media: file
  - name: input.ppm
    media: file
  - name: trace-0.svg
    media: file
  - name: trace-1.svg
    media: file
  - name: trace-2.svg
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "input.ppm", "trace-0.svg", "trace-1.svg", "trace-2.svg"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Pixels fitted to vector curves

AutoTrace converts an original raster drawing into SVG curves at three fitting error thresholds.

AutoTrace 원본 CLI로 직접 그린 래스터 도형을 세 오차 허용치의 SVG 곡선으로 변환했어요.

## Setup

Requires Python 3.11 or newer, the pinned packages above, and AutoTrace binary 0.40.0 (Homebrew distribution 0.31.10_2) on PATH. Map the listed inputs into in/. For native tools, install the listed version through your system package manager. The Faust recipe downloads its pinned official WASM files only when needed and verifies SHA-256 before caching under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Opening the gallery downloads only prepared outputs.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. Faust의 공식 WASM 파일은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py'], check=True)
```

## Verify

Executed twice with the original engine. All listed outputs matched byte for byte.

원본 엔진으로 두 번 실행해 모든 출력이 일치하는지 확인했습니다.

## Scope

Native AutoTrace traces an original circle and triangle raster. Exact SVG outputs are retained. svgpathtools samples only the resulting SVG for the viewer; it does not perform tracing. The tested binary reports 0.40.0 while its Homebrew distribution is named 0.31.10_2.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
