---
id: tippecanoe.gallery
version: 1
title: Roads at three tile zoom levels
capability: tippecanoe graphics
tier: C
kind: python
packages: []
source:
  name: "Tippecanoe"
  repo: https://github.com/felt/tippecanoe
  license: "BSD-2-Clause"
io:
  inputs:
  - name: main.py
    media: file
  outputs:
  - name: result.json
    media: file
  - name: input.geojson
    media: file
  - name: roads.mbtiles
    media: file
  - name: decoded-1.json
    media: file
  - name: decoded-3.json
    media: file
  - name: decoded-5.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "input.geojson", "roads.mbtiles", "decoded-1.json", "decoded-3.json", "decoded-5.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Roads at three tile zoom levels

Tippecanoe builds real vector tiles from original synthetic roads; decoded native geometry shows zoom-dependent detail.

Tippecanoe로 합성 도로의 실제 벡터 타일을 만들고 원본 디코더의 기하를 확대 수준별로 표시해요.

## Setup

Requires Python 3.11 or newer, the pinned packages above, and Tippecanoe 2.79.0 and tippecanoe-decode on PATH. Map the listed inputs into in/. For native tools, install the listed version through your system package manager. The Faust recipe downloads its pinned official WASM files only when needed and verifies SHA-256 before caching under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Opening the gallery downloads only prepared outputs.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. Faust의 공식 WASM 파일은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py'], check=True)
```

## Verify

Executed twice with the original engine. MBTiles storage ordering differs across parallel runs, while decoded geometry and JSON results match byte for byte. SQLite integrity checks passed.

원본 엔진으로 두 번 실행했습니다. 타일 저장 순서는 달라도 디코딩한 기하는 동일했고 SQLite 무결성 검사도 통과했습니다.

## Scope

Native Tippecanoe builds MBTiles from 19 original synthetic roads. Its own decoder retrieves all tiles at zooms 1, 3 and 5. SQLite integrity must pass; decoded geometry has 1632, 2031 and 2335 vertices respectively. Tile boundaries can split a road. MBTiles byte ordering can vary across parallel runs; decoded geometry, JSON results and input were identical.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
