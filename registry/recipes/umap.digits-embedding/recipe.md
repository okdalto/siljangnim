---
id: umap.digits-embedding
version: 1
title: UMAP embedding of handwritten digits (umap-learn)
capability: data-embed dimensionality reduction umap scatter clusters points json
tier: C
kind: python
packages:
- scikit-learn==1.9.1
- umap-learn==0.5.12
source:
  name: UMAP
  repo: https://github.com/lmcinnes/umap
  license: BSD-3-Clause
io:
  inputs: []
  outputs:
  - name: digits.json
    media: json
verify:
  params:
    n_neighbors: 10
    limit: 300
  expect_outputs:
  - digits.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-12'
    version: 1
status: verified
origin: local
updated: '2026-10-12'
---

# UMAP embedding of handwritten digits (umap-learn)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os
import numpy as np, umap
from sklearn.datasets import load_digits
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
d = load_digits()
n = int(P.get('limit', len(d.data)))
X, y = d.data[:n], d.target[:n]
emb = umap.UMAP(n_neighbors=int(P.get('n_neighbors', 15)), min_dist=float(P.get('min_dist', 0.1)),
                random_state=int(P.get('seed', 42))).fit_transform(X)
emb = emb - (emb.max(0) + emb.min(0)) / 2
emb = emb / np.abs(emb).max()
out = {"count": int(n), "points": [round(float(v), 4) for v in emb.ravel()],
       "labels": [int(v) for v in y], "pixels": [int(v) for v in X.ravel()]}
json.dump(out, open('out/digits.json', 'w'))
print(n, "digits embedded")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: n_neighbors, min_dist, seed, limit (use only the first N digits). Embeds scikit-learn's bundled 8x8 digits dataset (1797 images, 64 features) into 2D. digits.json: count, points (flat [x, y, …] in -1..1, aspect kept), labels (0-9), pixels (64 values 0-16 per digit, row by row, top first). The first run compiles numba code and takes about a minute.
