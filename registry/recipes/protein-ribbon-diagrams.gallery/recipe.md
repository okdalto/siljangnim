---
id: protein-ribbon-diagrams.gallery
version: 1
title: Crambin backbone ribbons
capability: protein-ribbon-diagrams rendering geometry
tier: D
kind: command
program: go
source:
  name: "Protein Ribbon Diagrams"
  repo: https://github.com/fogleman/ribbon
  license: "MIT"
io:
  inputs:
  - name: main.go
    media: file
  - name: go.mod
    media: file
  - name: go.sum
    media: file
  - name: 1CRN.pdb
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

# Crambin backbone ribbons

Fogleman’s ribbon generates a mesh from the public 1CRN structure. Rotate the locally computed backbone surface; this is a structural visualization, not a new molecular simulation.

Fogleman의 ribbon으로 공개 1CRN 구조의 메시를 직접 생성했어요. 계산한 주사슬 표면을 회전해 보세요. 새 분자 시뮬레이션이 아닌 구조 시각화예요.

## Setup

Install Go (tested with 1.25.10) and put go on PATH. Map the listed assets into in/. The exact dependencies and checksums are supplied in go.mod and go.sum. First execution downloads those modules to Go's cache and compiles the original tool. Subsequent executions reuse the cache. Opening the example only downloads its prepared files; it does not install Go or modules.

Go 1.25.10에서 검증했어요. 나열된 파일을 in/에 연결하세요. 재실행할 때만 고정된 의존성을 다운로드하고 Go 캐시를 재사용해요. 예제를 열 때는 준비된 파일만 받아요.

## Run

Runs without a shell, reading in/ and writing out/.

```json
["go","-C","in","run","-mod=readonly",".","../out","1CRN.pdb"]
```

## Verify

Executed with the supplied source and pinned dependencies on macOS arm64. The original tool generates the supplied geometry or pixels.

## Notes

Input: public 1CRN structure (W. A. Hendrickson and M. M. Teeter). wwPDB archive data is CC0-1.0: https://www.wwpdb.org/about/usage-policies . This computes a ribbon visualization, not a new molecular simulation.
