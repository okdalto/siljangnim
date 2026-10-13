---
id: vpype.gallery
version: 1
title: Plotter travel optimization (vpype)
capability: plotter svg linesort pen travel
tier: C
kind: python
packages:
- numpy==1.26.4
- vpype==1.15.0
source:
  name: vpype
  repo: https://github.com/abey79/vpype
  license: MIT
io:
  inputs: []
  outputs:
  - name: paths.json
    media: file
  - name: plot.svg
    media: file
verify:
  params: {}
  expect_outputs:
  - paths.json
  - plot.svg
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-13'
    version: 1
status: verified
origin: local
updated: '2026-10-13'
---

# Plotter travel optimization (vpype)

## Setup

Install the pinned packages listed above. No API key is needed.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, math, numpy as np, vpype, vpype_cli
rng=np.random.default_rng(17)
lines=[]
for row in range(20):
 x=np.linspace(0,100,90);y=5+row*4+6*np.sin(x*.07+row*.3)
 lines.append(x+1j*y)
rng.shuffle(lines)
doc=vpype.Document(vpype.LineCollection(lines));ordered=vpype_cli.execute('linesort',doc)
def export(layer):return [[[round(z.real/100-.5,5),round(z.imag/100-.45,5)] for z in line] for line in layer]
def travel(layer):return sum(abs(a[-1]-b[0]) for a,b in zip(list(layer),list(layer)[1:]))
before=doc.layers[1];after=ordered.layers[1]
json.dump({'before':export(before),'after':export(after),'travelBefore':travel(before),'travelAfter':travel(after)},open('out/paths.json','w'))
with open('out/plot.svg','w') as f:vpype.write_svg(f,ordered)
assert travel(after)<travel(before)
print('Pen-up travel:',travel(before),'->',travel(after))
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Original procedural input. Output assets are bundled so viewing does not require local tools.
