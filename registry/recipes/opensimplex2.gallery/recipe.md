---
id: opensimplex2.gallery
version: 1
title: Noise variants as height fields
capability: opensimplex2 geometry rendering
tier: D
kind: command
program: cargo
source:
  name: "OpenSimplex2"
  repo: https://github.com/kdotjpg/opensimplex2
  license: "CC0-1.0 / some files Unlicense"
io:
  inputs:
  - name: Cargo.toml
    media: file
  - name: Cargo.lock
    media: file
  - name: main.rs
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

# Noise variants as height fields

OpenSimplex2 generates fast, smooth and four-octave smooth noise on the same grid. Rotate the directly computed terrain meshes.

OpenSimplex2의 빠른 노이즈·매끄러운 노이즈·4옥타브 노이즈를 같은 격자에서 계산했어요. 직접 계산한 지형 메시를 회전해 보세요.

## Setup

Install Rust and Cargo (tested with Rust 1.90.0) and a native linker. Map the listed assets into in/. Cargo.toml pins direct dependencies and Cargo.lock records resolved versions and checksums. First execution downloads and compiles the selected example's crates; later runs reuse Cargo's cache. Opening the example downloads only its prepared files.

Rust 1.90.0에서 검증했어요. 파일을 in/에 연결하세요. 재실행할 때만 해당 예제의 의존성을 받고 Cargo 캐시를 재사용해요. 예제를 여는 것만으로 Rust나 의존성을 설치하지 않아요.

## Run

```json
["cargo", "run", "--locked", "--release", "--manifest-path", "in/Cargo.toml", "--", "out"]
```

## Verify

Executed the supplied source and locked dependencies on macOS arm64. The driver checks finite geometry and nonempty outputs or rendered pixels. This viewer presents saved results from that execution.

## Notes

Original synthetic input and driver. Edit main.rs and rerun to change inputs; the viewer selects precomputed results. GPU output pixels may vary by adapter.
