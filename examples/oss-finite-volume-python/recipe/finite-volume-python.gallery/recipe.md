---
id: finite-volume-python.gallery
version: 1
title: Two shearing fluid layers
capability: finite-volume-python simulation science
tier: C
kind: python
packages:
- numpy==2.2.6
- matplotlib==3.11.2
- Pillow==11.3.0
source:
  name: "Finite Volume Python"
  repo: https://github.com/pmocz/finitevolume-python
  license: "GPL-3.0"
io:
  inputs:
  - name: solver.py
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
  expect_outputs: ["result.json","render-0.png","render-1.png","render-2.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Two shearing fluid layers

Philip Mocz’s finite-volume solver evolves two shearing fluid layers on a 64×64 grid. The three density maps come from an actual local run.

Philip Mocz의 유한체적 솔버로 64×64 격자의 엇갈리는 두 유체층을 계산했어요. 직접 실행한 세 시간의 밀도 지도를 비교하세요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU, API key or observation download is required. 

## Run

```python
import runpy
runpy.run_path('in/solver.py',run_name='__main__')
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

The supplied solver.py is adapted from the pinned upstream source under GPL-3.0. LICENSE and SOURCE.json preserve the license, provenance and modification notes. Grid size and output handling were changed; the original numerical solver is retained.
