---
id: pt.gallery
version: 1
title: CPU path-traced materials
capability: pt rendering geometry
tier: D
kind: command
program: go
source:
  name: "pt"
  repo: https://github.com/fogleman/pt
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

# CPU path-traced materials

The pt renderer traces an original scene with diffuse, glossy and metallic materials. The three saved renders use independent Monte Carlo samples.

pt 렌더러로 확산·광택·금속 재질의 장면을 직접 경로 추적했어요. 저장된 세 렌더는 각각 독립적인 몬테카를로 표본을 사용해요.

## Setup

Install Go (tested with 1.25.10) and put go on PATH. Map the listed assets into in/. The exact dependencies and checksums are supplied in go.mod and go.sum. First execution downloads those modules to Go's cache and compiles the original tool. Subsequent executions reuse the cache. Opening the example only downloads its prepared files; it does not install Go or modules.

Go 1.25.10에서 검증했어요. 나열된 파일을 in/에 연결하세요. 재실행할 때만 고정된 의존성을 다운로드하고 Go 캐시를 재사용해요. 예제를 열 때는 준비된 파일만 받아요.

## Run

Runs without a shell, reading in/ and writing out/.

```json
["go","-C","in","run","-mod=readonly",".","../out"]
```

## Verify

Executed with the supplied source and pinned dependencies on macOS arm64. The Monte Carlo renderer uses independent random samples, so repeated renders are not pixel-identical.

## Notes

Original synthetic inputs and driver. The viewer controls stored results; edit main.go and rerun to change computation inputs.
