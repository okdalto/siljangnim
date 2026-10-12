---
id: meanderpy.migration
version: 1
title: River meander migration with oxbow cutoffs (meanderpy)
capability: simulate river meander channel migration centerlines oxbow geomorphology
  json
tier: C
kind: python
packages:
- h5py
- meanderpy==0.2.0
source:
  name: meanderpy
  repo: https://github.com/zsylvester/meanderpy
  license: Apache-2.0
io:
  inputs: []
  outputs:
  - name: river.json
    media: json
verify:
  params:
    iterations: 60
    save_every: 20
    bends: 6
  expect_outputs:
  - river.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-12'
    version: 1
status: verified
origin: local
updated: '2026-10-12'
---

# River meander migration with oxbow cutoffs (meanderpy)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os
import numpy as np
import meanderpy as mp
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
np.random.seed(int(P.get('seed', 5)))
nit = int(P.get('iterations', 2000))
saved_ts = int(P.get('save_every', 20))
W = float(P.get('width', 200.0)); D = float(P.get('depth', 6.0))
pad, deltas, Cf = 100, 50.0, 0.022
crdist = 1.5 * W
year = 365 * 24 * 60 * 60.0
kl = float(P.get('kl', 60.0)) / year
kv = 1.0e-12
dt = 0.1 * year
ch = mp.generate_initial_channel(W, D, 0.0, deltas, pad, int(P.get('bends', 30)))
chb = mp.ChannelBelt(channels=[ch], cutoffs=[], cl_times=[0.0], cutoff_times=[])
chb.migrate(nit, saved_ts, deltas, pad, crdist, D * np.ones(nit), Cf * np.ones(nit), kl, kv, dt, 1000.0,
            autoaggradation=False, t1=0, t2=0, t3=nit + 1, aggr_factor=0.0)
def line(x, y, every=2):
    pts = np.stack([x[::every], y[::every]], 1) / 1000.0
    return [round(float(v), 3) for v in pts.ravel()]
channels = [{"age": round(float(t), 2), "points": line(c.x, c.y)} for c, t in zip(chb.channels, chb.cl_times)]
cutoffs = []
for c, t in zip(chb.cutoffs, chb.cutoff_times):
    # One time step can cut off several bends; each comes as its own array.
    xs, ys = (c.x, c.y) if np.ndim(c.x[0]) else ([c.x], [c.y])
    for x, y in zip(xs, ys):
        cutoffs.append({"age": round(float(t), 2), "points": line(np.asarray(x), np.asarray(y), 1)})
allx = np.concatenate([c.x for c in chb.channels]) / 1000.0
ally = np.concatenate([c.y for c in chb.channels]) / 1000.0
json.dump({"width": W, "extent": [float(allx.min()), float(allx.max()), float(ally.min()), float(ally.max())],
           "channels": channels, "cutoffs": cutoffs}, open('out/river.json', 'w'))
print(len(channels), "centerlines,", len(cutoffs), "cutoffs over", round(nit * 0.1), "years")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: iterations (time steps of 0.1 year), save_every, bends (initial bends), seed, width (m), depth (m), kl (migration rate constant, m/year). Uses meanderpy's Howard & Knutson migration from its README setup, with fixed-elevation (no aggradation) mode. meanderpy imports h5py without declaring it, hence the extra package. river.json: width, extent [xmin, xmax, ymin, ymax] in km, channels as {age (years), points: flat [x, y] km}, cutoffs as {age, points} (oxbow lakes).
