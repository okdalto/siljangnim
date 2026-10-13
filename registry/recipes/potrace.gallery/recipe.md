---
id: potrace.gallery
version: 1
title: Leaf outline tracing (Potrace)
capability: bitmap pbm svg trace
tier: D
kind: command
program: potrace
source:
  name: Potrace
  repo: https://potrace.sourceforge.net
  license: GPL-2.0-or-later
io:
  inputs:
  - name: leaf.pbm
  - name: source.png
  outputs:
  - name: trace.svg
    media: file
verify:
  params: {}
  expect_outputs:
  - trace.svg
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Leaf outline tracing (Potrace)

## Setup

Install Potrace (tested with 1.16) and put potrace on PATH. leaf.pbm is bundled.

## Run

Runs `potrace` with no shell. Reads `in/`, writes `out/`.

```json
["potrace", "in/leaf.pbm", "--svg", "--output", "out/trace.svg"]
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
