---
id: pysstv.gallery
version: 1
title: An image encoded as sound
capability: pysstv image audio rendering
tier: C
kind: python
packages:
- PySSTV==0.5.7
- numpy==2.2.6
- Pillow==11.3.0
source:
  name: "PySSTV"
  repo: https://github.com/dnet/pySSTV
  license: "MIT"
io:
  inputs: []
  outputs:
  - name: input.png
    media: file
  - name: spectrum.png
    media: file
  - name: signal.wav
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["input.png","spectrum.png","signal.wav","result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# An image encoded as sound

PySSTV encodes an original grayscale image into an 8.95-second Robot8BW signal. Inspect the actual WAV spectrum and enable Listen to hear it.

PySSTV로 직접 만든 회색조 그림을 8.95초 Robot8BW 신호로 부호화했어요. 실제 WAV의 스펙트럼을 살펴보고 Listen을 켜서 들어 보세요.

## Setup

Install the pinned packages above and map any listed input from the example assets to in/. No GPU or API key is needed.

## Run

```python
import pathlib,json,numpy as np
from PIL import Image
from pysstv.grayscale import Robot8BW
import wave
out=pathlib.Path('out');out.mkdir(parents=True,exist_ok=True);w,h=160,120;y,x=np.mgrid[:h,:w];pixels=np.uint8(np.clip((np.sin(np.sqrt((x-80)**2+(y-60)**2)*.15)*.3+x/w*.7)*255,0,255));image=Image.fromarray(pixels);image.save(out/'input.png');sstv=Robot8BW(image,11025,16);sstv.write_wav(str(out/'signal.wav'))
with wave.open(str(out/'signal.wav')) as audio:assert audio.getframerate()==11025;samples=np.frombuffer(audio.readframes(audio.getnframes()),np.int16).astype(np.float32)/32768
assert 8<len(samples)/11025<12 and np.max(np.abs(samples))>.2
leader=np.abs(np.fft.rfft(samples[:2048]*np.hanning(2048)));peak=np.argmax(leader)*11025/2048;assert abs(peak-1900)<10
n=256;windows=np.stack([samples[i:i+n]*np.hanning(n) for i in range(0,len(samples)-n,256)]);spectra=np.abs(np.fft.rfft(windows));spectra=np.log1p(spectra);spectra/=spectra.max();gray=np.uint8(spectra[:,0:70].T[::-1]*255);Image.fromarray(gray).resize((600,220)).save(out/'spectrum.png');(out/'result.json').write_text(json.dumps({'mode':'Robot8BW','sample_rate':11025,'duration':len(samples)/11025,'image_size':[160,120],'spectrum_max_hz':70*11025/256},indent=2));print('PySSTV',len(samples)/11025)

```

## Verify

The script checks finite output and numerical properties before saving results. The gallery reads saved files; its controls do not rerun the computation.
