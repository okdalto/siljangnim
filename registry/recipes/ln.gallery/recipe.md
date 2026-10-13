---
id: ln.gallery
version: 1
title: Hidden lines around solids
capability: ln rendering geometry
tier: D
kind: command
program: go
source:
  name: "ln"
  repo: https://github.com/fogleman/ln
  license: "MIT"
io:
  inputs:
  - name: main.go
    media: file
  - name: go.mod
    media: file
  - name: go.sum
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

# Hidden lines around solids

The ln engine ray-tests surface lines against solids and projects the visible segments. Three camera views are computed locally.

ln 엔진으로 표면의 선과 입체의 가림 관계를 검사했어요. 보이는 선만 투영한 세 시점을 직접 계산했어요.

## Setup

Install Go (tested with 1.25.10) and put go on PATH. Map the listed assets into in/. The exact dependencies and checksums are supplied in go.mod and go.sum. First execution downloads those modules to Go's cache and compiles the original tool. Subsequent executions reuse the cache. Opening the example only downloads its prepared files; it does not install Go or modules.

Go 1.25.10에서 검증했어요. 나열된 파일을 in/에 연결하세요. 재실행할 때만 고정된 의존성을 다운로드하고 Go 캐시를 재사용해요. 예제를 열 때는 준비된 파일만 받아요.

## Run

Runs without a shell, reading in/ and writing out/.

```json
["go","-C","in","run","-mod=readonly",".","../out"]
```

## Verify

Executed with the supplied source and pinned dependencies on macOS arm64. The original tool generates the supplied geometry or pixels.

## Notes

Original synthetic inputs and driver. The viewer controls stored results; edit main.go and rerun to change computation inputs.
