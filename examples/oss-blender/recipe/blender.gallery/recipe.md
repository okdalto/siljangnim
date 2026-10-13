---
id: blender.gallery
version: 1
title: Rendered still life (Blender)
capability: 3d render cycles still life
tier: D
kind: command
program: blender
source:
  name: Blender
  repo: https://projects.blender.org/blender/blender
  license: GPL-2.0-or-later
io:
  inputs:
  - name: build.py
  outputs:
  - name: still-life.png
    media: file
  - name: still-life.blend
    media: file
verify:
  params: {}
  expect_outputs:
  - still-life.png
  - still-life.blend
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Rendered still life (Blender)

## Setup

Install Blender (tested with 5.2.2 LTS) and put blender on PATH. The included build.py creates the entire scene.

## Run

Runs `blender` with no shell. Reads `in/`, writes `out/`.

```json
["blender", "-b", "-t", "4", "-P", "in/build.py"]
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
