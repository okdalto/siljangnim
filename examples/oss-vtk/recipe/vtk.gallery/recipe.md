---
id: vtk.gallery
version: 1
title: Isosurfaces of a scalar field
capability: vtk prepared geometry simulation
tier: C
kind: python
packages:
- vtk==9.7.1
- numpy==2.2.6
source:
  name: "VTK"
  repo: https://github.com/kitware/vtk
  license: "BSD-3-Clause"
io:
  inputs: []
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs:
  - result.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Isosurfaces of a scalar field

VTK Flying Edges extracts three isosurfaces from a sampled gyroid field. The geometry was computed locally with VTK.

VTK Flying Edges로 자이로이드 스칼라장의 등위면 세 개를 직접 추출했어요.

## Setup

Install the pinned packages above. No API key or model weights are required.

## Run

Writes the prepared data to out/result.json. The scene controls select or rotate stored results; they do not rerun this computation.

```python
import json,numpy as np
from pathlib import Path
Path('out').mkdir(exist_ok=True)
def save(frames):
 assert len(frames)>0
 text=json.dumps({'frames':frames},allow_nan=False,separators=(',',':'))
 Path('out/result.json').write_text(text)
import vtk
from vtk.util.numpy_support import numpy_to_vtk,vtk_to_numpy
n=24;x,y,z=np.meshgrid(*([np.linspace(-2.5,2.5,n)]*3),indexing='ij');field=np.sin(x)*np.cos(y)+np.sin(y)*np.cos(z)+np.sin(z)*np.cos(x)
image=vtk.vtkImageData();image.SetDimensions(n,n,n);image.SetSpacing(2/(n-1),2/(n-1),2/(n-1));image.SetOrigin(-1,-1,-1);image.GetPointData().SetScalars(numpy_to_vtk(field.ravel(order='F'),deep=True));frames=[]
for level in [-.5,0,.5]:
 contour=vtk.vtkFlyingEdges3D();contour.SetInputData(image);contour.SetValue(0,level);contour.Update();out=contour.GetOutput();pts=vtk_to_numpy(out.GetPoints().GetData());faces=vtk_to_numpy(out.GetPolys().GetData()).reshape(-1,4)[:,1:];assert len(faces)>100 and np.isfinite(pts).all()
 frames.append({'mesh':{'vertices':pts.tolist(),'faces':faces.tolist()}})
save(frames)
```

## Verify

The script checks numerical invariants before writing its result. Executed on macOS arm64 with Python 3.11.15.

## Notes

Original synthetic inputs. Recompute through the runtime recipe when changing inputs. Viewing downloads only the prepared example files.
