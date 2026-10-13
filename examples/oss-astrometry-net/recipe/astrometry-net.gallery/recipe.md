---
id: astrometry-net.gallery
version: 1
title: Recovering a rotated star field
capability: astrometry-net graphics
tier: C
kind: python
packages: ["astropy==8.0.1", "numpy==2.2.6", "pyerfa==2.0.1.5", "astropy-iers-data==0.2026.9.28.0.59.37", "PyYAML==6.0.3", "packaging==26.3"]
source:
  name: "Astrometry.net"
  repo: https://github.com/dstndstn/astrometry.net
  license: "BSD / GPL-3.0-or-later"
io:
  inputs:
  - name: main.py
    media: file
  outputs:
  - name: result.json
    media: file
  - name: catalog.fits
    media: file
  - name: index-original.fits
    media: file
  - name: stars-0.xyls
    media: file
  - name: stars-1.xyls
    media: file
  - name: stars-2.xyls
    media: file
  - name: solved-0.wcs
    media: file
  - name: solved-1.wcs
    media: file
  - name: solved-2.wcs
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "catalog.fits", "index-original.fits", "stars-0.xyls", "stars-1.xyls", "stars-2.xyls", "solved-0.wcs", "solved-1.wcs", "solved-2.wcs"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Recovering a rotated star field

Astrometry.net builds a synthetic star index and directly solves three rotated observations, recovering sky coordinates.

Astrometry.net으로 합성 별 인덱스를 만들고 세 회전 관측 좌표를 직접 풀어 천구 좌표를 복원했어요.

## Setup

Requires Python 3.11+, the pinned packages above, and Astrometry.net 0.97 tools build-astrometry-index and solve-field on PATH. macOS: brew install astrometry-net. The recipe generates its own tiny synthetic index; no external sky catalog is downloaded. Map the listed inputs into in/. Opening the gallery downloads only prepared outputs. Source/runtime caches live under (XDG_CACHE_HOME or ~/.cache)/siljangnim.

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

The original index builder and plate solver process a seeded synthetic sky catalog and 0, 25 and 60 degree observations. This tests plate solving from detected coordinates, not image source extraction or real sky data. Solved WCS files are retained; maximum projected star error must be below 0.1 pixel (observed below 0.0004). Generated FITS headers can include timestamps; prepared geometry JSON matched on repeat.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
