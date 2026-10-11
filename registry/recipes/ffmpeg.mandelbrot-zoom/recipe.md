---
id: ffmpeg.mandelbrot-zoom
version: 2
title: Mandelbrot zoom video from ffmpeg's lavfi source
capability: video-generate fractal mandelbrot mp4
tier: D
kind: command
program: ffmpeg
source:
  name: FFmpeg
  repo: https://github.com/FFmpeg/FFmpeg
  license: LGPL-2.1-or-later (this build may include GPL parts)
io:
  inputs: []
  outputs:
  - name: mandelbrot.mp4
    media: video
verify:
  params: {}
  expect_outputs:
  - mandelbrot.mp4
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-11'
    version: 2
status: verified
origin: local
updated: '2026-10-11'
---

# Mandelbrot zoom video from ffmpeg's lavfi source

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs `ffmpeg` with no shell. Reads `in/`, writes `out/`.

```json
["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "mandelbrot=s=640x360:rate=30:end_pts=240:start_scale=3:end_scale=0.001", "-t", "8", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "30", "-movflags", "+faststart", "out/mandelbrot.mp4"]
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Needs ffmpeg with libx264 on PATH. The lavfi mandelbrot source renders the zoom; change s, end_scale or -t in the arguments.
