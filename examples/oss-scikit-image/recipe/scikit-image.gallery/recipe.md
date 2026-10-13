---
id: scikit-image.gallery
version: 1
title: Watershed cell regions (scikit-image)
capability: image segmentation watershed cells
tier: C
kind: python
packages:
- numpy==1.26.4
- Pillow==11.3.0
- scikit-image==0.25.2
- scipy==1.14.1
source:
  name: scikit-image
  repo: https://github.com/scikit-image/scikit-image
  license: BSD-3-Clause
io:
  inputs: []
  outputs:
  - name: source.png
    media: file
  - name: regions.png
    media: file
  - name: regions.json
    media: file
verify:
  params: {}
  expect_outputs:
  - source.png
  - regions.png
  - regions.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Watershed cell regions (scikit-image)

## Setup

Install the pinned packages listed above. No API key is needed.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json,numpy as np
from scipy import ndimage as ndi
from skimage.segmentation import watershed,find_boundaries
from skimage.feature import peak_local_max
from PIL import Image
size=384;y,x=np.mgrid[:size,:size];mask=np.zeros((size,size),bool)
for cx,cy,r in [(92,104,57),(171,107,52),(247,127,61),(111,230,67),(205,227,65),(284,265,52)]:mask|=(x-cx)**2+(y-cy)**2<r*r
distance=ndi.distance_transform_edt(mask);coords=peak_local_max(distance,min_distance=35,labels=mask)
markers=np.zeros_like(mask,dtype=int)
for i,(cy,cx) in enumerate(coords):markers[cy,cx]=i+1
labels=watershed(-distance,markers,mask=mask);colors=np.array([[8,18,29],[58,202,199],[236,119,134],[244,188,90],[131,132,229],[110,194,133],[89,163,220],[202,140,223]],dtype=np.uint8)
image=colors[labels%len(colors)];image[find_boundaries(labels)]=[245,245,220]
Image.fromarray(image).save('out/regions.png');Image.fromarray(np.uint8(mask)*210+np.uint8(~mask)*12).convert('RGB').save('out/source.png')
json.dump({'regions':int(labels.max()),'markers':coords[:,::-1].tolist()},open('out/regions.json','w'));assert labels.max()>=5
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
