---
id: blender.nodes
version: 1
title: Procedural instances (Blender)
capability: 3d nodes simulation render
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
  - name: metrics.json
    media: file
  - name: procedural.blend
    media: file
  - name: result-0.png
    media: file
  - name: result-1.png
    media: file
  - name: result-2.png
    media: file
verify:
  params: {}
  expect_outputs:
  - metrics.json
  - procedural.blend
  - result-0.png
  - result-1.png
  - result-2.png
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-16'
    version: 1
status: verified
origin: local
updated: '2026-10-16'
---

# Procedural instances (Blender)

## Setup

Install Blender (tested with official 4.5.3 macOS arm64) and put blender on PATH.

## Run

```json
["blender", "-b", "-t", "4", "-P", "in/build.py"]
```

## Verify

The script asserts evaluated vertex counts for all three grid sizes and saves metrics.json along with three renders and the editable .blend file.

## Notes

An actual Geometry Nodes graph creates 16, 49 and 100 randomly sized instances. Compare three saved Cycles renders; edit the script or .blend file and rerun to change the graph.
Original procedural input; no external assets. Preview controls select prepared renders, not live Blender execution.
