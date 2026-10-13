---
id: inkscape.gallery
version: 1
title: Vector rosette export (Inkscape)
capability: svg vector png export
tier: D
kind: command
program: inkscape
source:
  name: Inkscape
  repo: https://gitlab.com/inkscape/inkscape
  license: GPL-2.0-or-later
io:
  inputs:
  - name: source.svg
  outputs:
  - name: rosette.png
    media: file
verify:
  params: {}
  expect_outputs:
  - rosette.png
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Vector rosette export (Inkscape)

## Setup

Install inkscape (1.4.4) and put its executable on PATH. Input files are bundled with the example.

## Run

Runs `inkscape` with no shell. Reads `in/`, writes `out/`.

```json
["inkscape", "in/source.svg", "--export-type=png", "--export-filename=out/rosette.png", "--export-width=768"]
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
