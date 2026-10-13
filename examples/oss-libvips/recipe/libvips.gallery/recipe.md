---
id: libvips.gallery
version: 1
title: A streamed blur pipeline
capability: libvips image audio rendering
tier: C
kind: python
packages:
- pyvips==3.2.0
- pyvips-binary==8.18.7
- numpy==2.2.6
- Pillow==11.3.0
source:
  name: "libvips"
  repo: https://github.com/libvips/libvips
  license: "LGPL-2.1-or-later"
io:
  inputs:
  - name: input.png
    media: file
  outputs:
  - name: blur-0.png
    media: file
  - name: blur-1.png
    media: file
  - name: blur-2.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["blur-0.png","blur-1.png","blur-2.png","result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# A streamed blur pipeline

libvips blurs an original raster image at three scales. The viewer compares saved pixels; change the recipe to run another image operation.

libvips로 직접 만든 래스터 그림을 세 단계로 흐렸어요. 화면에서는 저장된 픽셀을 비교하며 다른 영상 연산은 레시피에서 실행해요.

## Setup

Install the pinned packages above and map any listed input from the example assets to in/. No GPU or API key is needed.

## Run

```python
import pathlib,json,numpy as np
from PIL import Image,ImageDraw,features
import pyvips
root=pathlib.Path.cwd();source=pathlib.Path('in/input.png');out=pathlib.Path('out');out.mkdir(parents=True,exist_ok=True)
image=pyvips.Image.new_from_file(str(source),access='sequential');source_data=np.asarray(Image.open(source),np.float32);errors=[]
for i,sigma in enumerate([.5,2,6]):
 # Each pipeline gets its own sequential source because libvips streams pixels.
 result=pyvips.Image.new_from_file(str(source),access='sequential').gaussblur(sigma);result.write_to_file(str(out/f'blur-{i}.png'));array=np.asarray(Image.open(out/f'blur-{i}.png'),np.float32);errors.append(float(np.mean(np.abs(array-source_data))));assert result.width==400 and result.height==400
assert errors[0]<errors[-1];(out/'result.json').write_text(json.dumps({'sigma':[.5,2,6],'mean_absolute_change':errors,'libvips':'.'.join(str(pyvips.version(i)) for i in range(3))},indent=2));print('libvips',errors)

```

## Verify

The script checks finite output and numerical properties before saving results. The gallery reads saved files; its controls do not rerun the computation.
