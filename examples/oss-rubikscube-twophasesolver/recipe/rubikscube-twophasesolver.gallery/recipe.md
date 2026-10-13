---
id: rubikscube-twophasesolver.gallery
version: 1
title: Replay a verified two-phase cube solution
capability: rubikscube-twophasesolver graphics
tier: C
kind: python
packages: ["RubikTwoPhase==1.1.1"]
source:
  name: "RubiksCube-TwophaseSolver"
  repo: https://github.com/hkociemba/RubiksCube-TwophaseSolver
  license: "GPL-3.0"
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

# Replay a verified two-phase cube solution

RubikTwoPhase solves an original 12-move scramble; replay its moves through the native cube model and verify the solved state.

RubikTwoPhase 원본으로 12수 섞기의 해법을 찾고 원본 큐브 모델에 한 수씩 적용해 완성 상태를 검증했어요.

## Setup

Requires Python 3.12+ and RubikTwoPhase 1.1.1. The original solver generates about 80 MB of search tables on first execution, which can take several minutes or longer. The recipe places them in a locked cache keyed by package version, byte order and native array width. Later runs reuse the tables; opening the gallery only loads the small prepared solution.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import subprocess,sys
subprocess.run([sys.executable,'in/main.py'],check=True)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

An original 12-move scramble is applied using native CubieCube and moveCube. The actual two-phase solver returns a solution; every move is replayed through the same native cube model and the final facelet string is asserted to equal the solved cube. The viewer displays a flat cube net for each verified state, including all 12 solution moves. No solver or cube permutations are reimplemented.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
