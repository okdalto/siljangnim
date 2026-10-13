---
id: open3d.gallery
version: 1
title: Voxel point-cloud sampling (Open3D)
capability: geometry point cloud voxel downsample
tier: C
kind: python
packages:
- numpy==1.26.4
- open3d==0.19.0
source:
  name: Open3D
  repo: https://github.com/isl-org/Open3D
  license: MIT
io:
  inputs: []
  outputs:
  - name: cloud.json
    media: file
verify:
  params: {}
  expect_outputs:
  - cloud.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Voxel point-cloud sampling (Open3D)

## Setup

Install the pinned packages listed above. No API key is needed.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json,numpy as np,open3d as o3d
rng=np.random.default_rng(11);u=rng.uniform(0,2*np.pi,7000);v=rng.uniform(0,2*np.pi,7000)
p=np.column_stack(((.65+.24*np.cos(v))*np.cos(u),(.65+.24*np.cos(v))*np.sin(u),.24*np.sin(v)))
p+=rng.normal(0,.008,p.shape);cloud=o3d.geometry.PointCloud(o3d.utility.Vector3dVector(p));levels=[]
for voxel in [.015,.045,.09,.16]:
 c=cloud.voxel_down_sample(voxel);c.estimate_normals();levels.append({'voxel':voxel,'points':np.asarray(c.points).round(5).tolist()})
json.dump({'levels':levels},open('out/cloud.json','w'));assert len(levels[-1]['points'])<len(levels[0]['points'])
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
