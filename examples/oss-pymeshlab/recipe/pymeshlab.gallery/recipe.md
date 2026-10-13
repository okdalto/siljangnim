---
id: pymeshlab.gallery
version: 1
title: Mesh simplification levels (PyMeshLab)
capability: geometry mesh decimate quadric
tier: C
kind: python
packages:
- numpy==1.26.4
- pymeshlab==2023.12.post3
source:
  name: PyMeshLab
  repo: https://github.com/cnr-isti-vclab/PyMeshLab
  license: GPL-3.0
io:
  inputs: []
  outputs:
  - name: mesh.json
    media: file
verify:
  params: {}
  expect_outputs:
  - mesh.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Mesh simplification levels (PyMeshLab)

## Setup

Install the pinned packages listed above. No API key is needed.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json,numpy as np,pymeshlab
n,m=64,24;vertices=[];faces=[]
for i in range(n):
 for j in range(m):
  u=i/n*2*np.pi;v=j/m*2*np.pi;r=.23*(1+.22*np.sin(u*5));vertices.append([(.65+r*np.cos(v))*np.cos(u),(.65+r*np.cos(v))*np.sin(u),r*np.sin(v)])
for i in range(n):
 for j in range(m):
  a=i*m+j;b=((i+1)%n)*m+j;c=((i+1)%n)*m+(j+1)%m;d=i*m+(j+1)%m;faces.extend([[a,b,c],[a,c,d]])
levels=[]
for target in [3072,1200,400,120]:
 ms=pymeshlab.MeshSet();ms.add_mesh(pymeshlab.Mesh(np.array(vertices),np.array(faces)))
 if target<len(faces):ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target,preservenormal=True)
 mesh=ms.current_mesh();levels.append({'vertices':mesh.vertex_matrix().round(5).tolist(),'faces':mesh.face_matrix().tolist()})
json.dump({'levels':levels},open('out/mesh.json','w'));assert len(levels[-1]['faces'])<=120
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
