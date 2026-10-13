---
id: splishsplash.gallery
version: 1
title: Colliding fluid blocks with DFSPH
capability: splishsplash graphics
tier: C
kind: python
packages: ["pysplishsplash==2.18.1", "numpy==2.2.6"]
source:
  name: "SPlisHSPlasH"
  repo: https://github.com/interactivecomputergraphics/splishsplash
  license: "MIT"
io:
  inputs:
  - name: main.py
    media: file
  outputs:
  - name: result.json
    media: file
  - name: input-scene.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "input-scene.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Colliding fluid blocks with DFSPH

SPlisHSPlasH directly simulates the collision of two original fluid blocks with 128 particles using DFSPH.

SPlisHSPlasH 원본 DFSPH 엔진으로 두 유체 블록의 128개 입자 충돌을 직접 계산했어요.

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

The original DFSPH engine simulates 128 particles for 155 steps at 0.002 seconds, saving steps 0, 50 and 150. There are no external boundary models. It is a small CPU collision demonstration, not a high-resolution fluid render. The viewer selects prepared outputs; rerun the recipe to change computation.

