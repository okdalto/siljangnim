---
id: essentia.gallery
version: 1
title: Harmonics in native Mel analysis
capability: essentia graphics
tier: C
kind: python
packages: ["essentia==2.1b6.dev1389", "numpy==2.2.6", "Pillow==11.3.0"]
source:
  name: "Essentia"
  repo: https://github.com/mtg/essentia
  license: "AGPL-3.0"
io:
  inputs:
  - name: main.py
    media: file
  outputs:
  - name: result.json
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: audio-0.wav
    media: file
  - name: audio-1.wav
    media: file
  - name: audio-2.wav
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png", "audio-0.wav", "audio-1.wav", "audio-2.wav"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Harmonics in native Mel analysis

Essentia computes Mel spectra, MFCC coefficients and pitch estimates for three original synthetic melodies.

Essentia로 직접 만든 세 배음 멜로디의 Mel 스펙트럼·MFCC·음높이를 계산했어요.

## Setup

Requires Python 3.11 or newer and the pinned packages above. Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import subprocess, sys
subprocess.run([sys.executable, 'in/main.py', 'out'], check=True)
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check finite geometry, triangulated area, reconstruction error, spectral pitch, spherical area, collision symmetry or cloth strain, as applicable.

## Scope

The four-note inputs use pure, full-harmonic and odd-harmonic synthesis. Original Essentia windowing, spectra, Mel bands, MFCC and YinFFT run on the actual samples. The WAV files contain those inputs. The viewer selects prepared outputs; rerun the recipe to change computation.

