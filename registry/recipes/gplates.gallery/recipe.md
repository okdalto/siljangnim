---
id: gplates.gallery
version: 1
title: Reconstructing a synthetic plate
capability: gplates graphics
tier: C
kind: python
packages: ["pygplates==1.0.0", "numpy==2.2.6"]
source:
  name: "GPlates"
  repo: https://github.com/GPlates/GPlates
  license: "GPL-2.0-only"
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

# Reconstructing a synthetic plate

pyGPlates reconstructs an original synthetic polygon using a time-dependent Euler rotation model.

pyGPlates로 직접 만든 오일러 회전 모델에 따라 합성 판 다각형의 위치를 복원했어요.

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

The Euler poles and plate polygon are synthetic original inputs, not a real geological reconstruction model. Native reconstruction preserves spherical area and unit radius. The viewer selects prepared outputs; rerun the recipe to change computation.

