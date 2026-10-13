---
id: dither.gallery
version: 1
title: Three ways to distribute ink
capability: dither rendering geometry
tier: D
kind: command
program: go
source:
  name: "dither"
  repo: https://github.com/makew0rld/dither
  license: "MPL-2.0"
io:
  inputs:
  - name: main.go
    media: file
  - name: go.mod
    media: file
  - name: go.sum
    media: file
  - name: input.png
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

# Three ways to distribute ink

The dither Go library converts an original image to a strict black-and-white palette using Floyd–Steinberg, Atkinson and ordered Bayer dithering.

Go dither 라이브러리로 직접 만든 그림을 Floyd–Steinberg·Atkinson·Bayer 방식의 흑백 팔레트로 변환했어요.

## Setup

Install Go (tested with 1.25.10) and put go on PATH.  Map the listed assets into in/. The exact dependencies and checksums are supplied in go.mod and go.sum. First execution downloads those modules to Go's cache and compiles the original tool. Subsequent executions reuse the cache. Opening the example only downloads its prepared files; it does not install Go or modules.

Go 1.25.10에서 검증했어요. 나열된 파일을 in/에 연결하세요. 재실행할 때만 고정된 의존성을 다운로드하고 Go 캐시를 재사용해요. 예제를 열 때는 준비된 파일만 받아요.

## Run

Runs without a shell, reading in/ and writing out/.

```json
["go","-C","in","run","-mod=readonly",".","../out","input.png"]
```

## Verify

Executed with the supplied source and pinned dependencies on macOS arm64. The original tool generates the supplied geometry or pixels.

## Notes

Original synthetic inputs and driver. The viewer controls stored results; edit main.go and rerun to change computation inputs.
