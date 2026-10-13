---
id: katago.gallery
version: 1
title: Neural move policy on a small Go board
capability: katago graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "KataGo"
  repo: https://github.com/lightvector/KataGo
  license: "MIT"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  - name: analysis.cfg
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

# Neural move policy on a small Go board

KataGo directly analyzes three original nine-by-nine Go positions and renders its native neural move policy.

KataGo로 직접 구성한 9×9 바둑판 세 상태를 분석하고 원본 신경망 착수 정책을 표시해요.

## Setup

Requires Python 3.11 or newer and the pinned packages above plus KataGo 1.18.2 on PATH (macOS: brew install katago). Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py', 'in/source.json', 'out'], check=True)
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check finite geometry, exact recognized text, normalized neural policy or track identity, as applicable.

## Scope

KataGo 1.18.2 used the Apple M5 Metal backend with the CC0 g170e 20-block network. The immutable model download is SHA-256 verified and cached. Each original 9x9 position gets 16 search visits; displayed circles show raw neural policy before search, not a claim of strong play. Policies must normalize and ownership values must be finite and bounded. Reruns were byte-identical on the tested machine; other backends can differ. The viewer selects prepared outputs; rerun the recipe to change computation.

