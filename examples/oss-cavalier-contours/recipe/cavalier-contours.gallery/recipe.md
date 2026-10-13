---
id: cavalier-contours.gallery
version: 1
title: Offsets that preserve circular arcs
capability: cavalier-contours geometry rendering
tier: D
kind: command
program: cargo
source:
  name: "Cavalier Contours"
  repo: https://github.com/jbuckmccready/cavalier_contours
  license: "MIT OR Apache-2.0"
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

# Offsets that preserve circular arcs

Cavalier Contours offsets an arc-and-line capsule at three distances. Native arc results are flattened only for display with a fixed 0.002 tolerance.

Cavalier Contours로 원호와 직선으로 만든 캡슐을 세 거리만큼 오프셋했어요. 결과 원호는 표시할 때만 0.002 오차로 선분화해요.

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
