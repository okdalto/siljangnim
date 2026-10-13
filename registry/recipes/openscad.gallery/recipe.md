---
id: openscad.gallery
version: 1
title: Perforated lantern (OpenSCAD)
capability: cad csg stl lantern
tier: D
kind: command
program: openscad
source:
  name: OpenSCAD
  repo: https://github.com/openscad/openscad
  license: GPL-2.0
io:
  inputs:
  - name: lantern.scad
  outputs:
  - name: lantern.stl
    media: file
verify:
  params: {}
  expect_outputs:
  - lantern.stl
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Perforated lantern (OpenSCAD)

## Setup

Install OpenSCAD (tested with 2021.01) and put openscad on PATH.

## Run

Runs `openscad` with no shell. Reads `in/`, writes `out/`.

```json
["openscad", "--export-format", "asciistl", "-o", "out/lantern.stl", "in/lantern.scad"]
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
