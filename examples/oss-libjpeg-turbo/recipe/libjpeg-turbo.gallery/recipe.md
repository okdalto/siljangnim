---
id: libjpeg-turbo.gallery
version: 1
title: Quality versus compressed size
capability: libjpeg-turbo image audio rendering
tier: C
kind: python
packages:
- Pillow==11.3.0
- numpy==2.2.6
source:
  name: "libjpeg-turbo"
  repo: https://github.com/libjpeg-turbo/libjpeg-turbo
  license: "IJG / BSD-3-Clause"
io:
  inputs:
  - name: input.png
    media: file
  outputs:
  - name: compressed-0.jpg
    media: file
  - name: compressed-1.jpg
    media: file
  - name: compressed-2.jpg
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["compressed-0.jpg","compressed-1.jpg","compressed-2.jpg","result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Quality versus compressed size

Pillow’s verified libjpeg-turbo backend encodes an original image at three JPEG qualities. Compare artifacts and actual file sizes.

Pillow의 libjpeg-turbo 백엔드를 확인하고 직접 만든 그림을 세 JPEG 품질로 저장했어요. 압축 흔적과 실제 파일 크기를 비교하세요.

## Setup

Install the pinned packages above and map any listed input from the example assets to in/. No GPU or API key is needed.

## Run

```python
import pathlib,json,numpy as np
from PIL import Image,features
source=pathlib.Path('in/input.png');source_data=np.asarray(Image.open(source),np.float32)
out=pathlib.Path('out');out.mkdir(parents=True,exist_ok=True);assert features.check_feature('libjpeg_turbo');image=Image.open(source);errors=[];sizes=[]
for i,quality in enumerate([8,35,90]):
 filename=out/f'compressed-{i}.jpg';image.save(filename,quality=quality,subsampling=2);array=np.asarray(Image.open(filename),np.float32);errors.append(float(np.mean((array-source_data)**2)));sizes.append(filename.stat().st_size)
assert sizes[0]<sizes[-1] and errors[0]>errors[-1];(out/'result.json').write_text(json.dumps({'qualities':[8,35,90],'mse':errors,'bytes':sizes,'libjpeg_turbo':features.version_feature('libjpeg_turbo')},indent=2));print('libjpeg-turbo',sizes)

```

## Verify

The script checks finite output and numerical properties before saving results. The gallery reads saved files; its controls do not rerun the computation.
