---
id: libmypaint.gallery
version: 1
title: Pressure-sensitive native brush strokes
capability: libmypaint graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "libmypaint"
  repo: https://github.com/mypaint/libmypaint
  license: "ISC"
io:
  inputs:
  - name: main.py
    media: file
  - name: main.c
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

# Pressure-sensitive native brush strokes

The original MyPaint brush engine paints pressure-sensitive strokes on its native tiled surface at three hardness settings.

MyPaint 원본 브러시 엔진과 타일 표면으로 압력에 반응하는 세 경도의 붓질을 그렸어요.

## Setup

Requires Python 3.11+, Pillow 11.3.0, a C compiler and libmypaint 1.6.1 headers/library. macOS: brew install libmypaint. On other systems install its development package; pkg-config is used when available. MYPAINT_PREFIX can select a nonstandard installation. Map the listed inputs into in/. Opening the gallery downloads only prepared outputs. Source/runtime caches live under (XDG_CACHE_HOME or ~/.cache)/siljangnim.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. 원본 소스와 고정 실행 환경은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py'], check=True)
```

## Verify

Executed twice with the original engine. Prepared images and geometry matched; see Scope for FITS metadata and parallel gradient comparison details.

원본 엔진으로 두 번 실행해 결과를 대조했습니다. FITS 메타데이터와 병렬 미분 계산의 비교 조건은 Scope에 명시했습니다.

## Scope

The unmodified native MyPaint brush engine handles pressure mapping, dabs, compositing and tiled pixels. The original driver changes hardness while keeping the same four stroke paths. Native fixed-tile pixels are exported as PNG. Assertions check painted pixel coverage. It does not load MyPaint GUI or third-party brush presets.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
