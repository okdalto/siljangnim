---
id: fontforge.gallery
version: 1
title: An original glyph in three weights
capability: fontforge graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "FontForge"
  repo: https://github.com/fontforge/fontforge
  license: "GPL-3.0-or-later / BSD parts"
io:
  inputs:
  - name: main.py
    media: file
  - name: font.py
    media: file
  outputs:
  - name: result.json
    media: file
  - name: render-0.png
    media: file
  - name: glyph-0.svg
    media: file
  - name: font-0.ttf
    media: file
  - name: render-1.png
    media: file
  - name: glyph-1.svg
    media: file
  - name: font-1.ttf
    media: file
  - name: render-2.png
    media: file
  - name: glyph-2.svg
    media: file
  - name: font-2.ttf
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "glyph-0.svg", "font-0.ttf", "render-1.png", "glyph-1.svg", "font-1.ttf", "render-2.png", "glyph-2.svg", "font-2.ttf"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# An original glyph in three weights

FontForge changes the weight of an original glyph and exports validated outlines and real TrueType fonts.

FontForge로 직접 그린 글리프의 굵기를 바꾸고 검증한 윤곽과 실제 TrueType 글꼴을 내보냈어요.

## Setup

Requires Python 3.11 or newer, the pinned packages above, and FontForge 20251009 and Pillow 11.3.0 on PATH. Map the listed inputs into in/. For native tools, install the listed version through your system package manager. The Faust recipe downloads its pinned official WASM files only when needed and verifies SHA-256 before caching under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Opening the gallery downloads only prepared outputs.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. Faust의 공식 WASM 파일은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py'], check=True)
```

## Verify

Executed twice with the original engine. All listed outputs matched byte for byte.

원본 엔진으로 두 번 실행해 모든 출력이 일치하는지 확인했습니다.

## Scope

A single original A glyph is drawn using the native GlyphPen, changed with native changeWeight, and exported as SVG and TrueType. Native validation must return zero, including after overlap removal. Pillow displays the exported font. Each variant uses a fresh CLI process; SOURCE_DATE_EPOCH fixes font timestamps.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
