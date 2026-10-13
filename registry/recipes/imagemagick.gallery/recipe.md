---
id: imagemagick.gallery
version: 4
title: Etched edges (ImageMagick)
capability: image edge detect grayscale
tier: D
kind: command
program: magick
source:
  name: ImageMagick
  repo: https://github.com/ImageMagick/ImageMagick
  license: ImageMagick
io:
  inputs:
  - name: source.png
  outputs:
  - name: edges.png
    media: file
verify:
  params: {}
  expect_outputs:
  - edges.png
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 4
status: verified
origin: local
updated: '2026-10-13'
---

# Etched edges (ImageMagick)

## Setup

Install ImageMagick (tested with 7.1.2-33) and put magick on PATH. source.png is bundled.

## Run

Runs `magick` with no shell. Reads `in/`, writes `out/`.

```json
["magick", "in/source.png", "-alpha", "off", "-colorspace", "Gray", "-blur", "0x1.5", "-morphology", "Edge", "Diamond:1", "-auto-level", "-negate", "out/edges.png"]
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
