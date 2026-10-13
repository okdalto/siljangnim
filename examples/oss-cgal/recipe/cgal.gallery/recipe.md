---
id: cgal.gallery
version: 1
title: Constrained Delaunay triangulation
capability: cgal graphics
tier: C
kind: python
packages: ["cgal==6.0.1.post202410241521"]
source:
  name: "CGAL"
  repo: https://github.com/cgal/cgal
  license: "GPL-3.0 / LGPL-3.0 by package"
io:
  inputs:
  - name: main.py
    media: file
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Constrained Delaunay triangulation

Native CGAL triangulates original seeded points inside an octagonal boundary while preserving its constraints.

CGAL 네이티브 엔진으로 팔각형 경계와 내부 점을 제약 삼각분할했어요.

## Setup

Requires Python 3.11 or newer and the pinned packages above. Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py', 'out'], check=True)
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check finite geometry, triangulated area, reconstruction error, spectral pitch, spherical area, collision symmetry or cloth strain, as applicable.

## Scope

The native constrained Delaunay triangulation is checked for validity and total triangle area against the octagonal input boundary. The viewer selects prepared outputs; rerun the recipe to change computation.

