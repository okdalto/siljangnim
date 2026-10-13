---
id: colmap.gallery
version: 1
title: Two-view reconstruction under noise
capability: colmap graphics
tier: C
kind: python
packages: ["pycolmap==4.2.0", "numpy==2.2.6"]
source:
  name: "COLMAP"
  repo: https://github.com/colmap/colmap
  license: "BSD-3-Clause"
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

# Two-view reconstruction under noise

Native COLMAP triangulates an original synthetic point cloud from two cameras at three observation noise levels.

COLMAP 네이티브 엔진으로 두 카메라의 합성 관측에서 세 잡음 수준의 3D 점을 복원했어요.

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

This directly runs native two-view triangulation on synthetic normalized camera observations. It does not run feature matching or a full photograph reconstruction pipeline. The noiseless reconstruction must match the input to within 1e-10. The viewer selects prepared outputs; rerun the recipe to change computation.

