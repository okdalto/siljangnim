---
id: blender.physics
version: 1
title: Falling rigid bodies (Blender)
capability: 3d physics simulation render
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
  - name: physics.blend
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
  - physics.blend
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

# Falling rigid bodies (Blender)

## Setup

Install Blender (tested with official 4.5.3 macOS arm64) and put blender on PATH.

## Run

```json
["blender", "-b", "-t", "4", "-P", "in/build.py"]
```

## Verify

The script asserts downward motion and final block centers above the floor and saves metrics.json along with three renders and the editable .blend file.

## Notes

Blender simulates 12 colliding blocks over 90 frames. Compare saved renders at frames 1, 18 and 90. The .blend contains the simulation setup; play from frame 1 to recalculate it.
Original procedural input; no external assets. Preview controls select prepared renders, not live Blender execution.
