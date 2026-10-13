---
id: gwpy.gallery
version: 1
title: Filtering a synthetic signal
capability: gwpy simulation science
tier: C
kind: python
packages:
- gwpy==4.0.2
- numpy==2.2.6
source:
  name: "GWpy"
  repo: https://github.com/gwpy/gwpy
  license: "GPL-3.0-or-later"
io:
  inputs: []
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Filtering a synthetic signal

GWpy measures amplitude spectra of an original noisy two-tone signal before and after filtering. This is synthetic data, not a gravitational-wave detection.

GWpy로 직접 만든 잡음 섞인 두 주파수 신호의 필터 전후 진폭 스펙트럼을 계산했어요. 중력파 관측이 아닌 합성 데이터예요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU, API key or observation download is required. 

## Run

```python
import pathlib,json,numpy as np
out=pathlib.Path('out');out.mkdir(exist_ok=True)

from gwpy.timeseries import TimeSeries
rng=np.random.default_rng(8);t=np.arange(8192)/1024;x=np.sin(2*np.pi*35*t)+.5*np.sin(2*np.pi*120*t)+rng.normal(0,.15,len(t));series=TimeSeries(x,sample_rate=1024)
curves=[series,series.notch(35),series.bandpass(80,160)];spectra=[v.asd(fftlength=2).value for v in curves];freq=curves[0].asd(fftlength=2).frequencies.value
idx35=np.argmin(abs(freq-35));idx120=np.argmin(abs(freq-120));assert spectra[1][idx35]<spectra[0][idx35]*.15;assert spectra[2][idx35]<spectra[2][idx120]*.02
frames=[];mask=(freq>=5)&(freq<=250)
for spec in spectra:
 y=np.clip((np.log10(spec[mask])+4)/4,0,1)*1.5-.75;frames.append({'paths':[{'points':np.column_stack([freq[mask]/250*1.7-.85,y]).tolist()}]})
result={'frames':frames,'frequencies_hz':freq[mask].tolist(),'spectra':[s[mask].tolist()for s in spectra]}

(out/'result.json').write_text(json.dumps(result,allow_nan=False))
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

Original synthetic input. 
