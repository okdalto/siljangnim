---
id: circlify.stdlib-packing
version: 1
title: Circle packing of the Python standard library by lines of code (circlify)
capability: layout circle packing hierarchy treemap bubble chart json
tier: C
kind: python
packages:
- circlify==0.15.1
source:
  name: circlify
  repo: https://github.com/elmotec/circlify
  license: MIT
io:
  inputs: []
  outputs:
  - name: circles.json
    media: json
verify:
  params:
    max_depth: 1
  expect_outputs:
  - circles.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-12'
    version: 1
status: verified
origin: local
updated: '2026-10-12'
---

# Circle packing of the Python standard library by lines of code (circlify)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os, sysconfig
import circlify
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
max_depth = int(P.get('max_depth', 3))
min_lines = int(P.get('min_lines', 40))
root = sysconfig.get_paths()['stdlib']
skip = {'test', 'tests', 'idle_test', 'site-packages', '__pycache__', 'lib2to3', 'turtledemo'}
def lines(path):
    try:
        with open(path, 'rb') as fh:
            return sum(1 for _ in fh)
    except OSError:
        return 0
def walk(folder, rel, depth):
    items = []
    for name in sorted(os.listdir(folder)):
        full = os.path.join(folder, name)
        if name in skip or name.startswith('.'):
            continue
        if os.path.isdir(full):
            kids = walk(full, rel + [name], depth + 1)
            total = sum(c['datum'] for c in kids)
            if total < min_lines:
                continue
            if depth >= max_depth:
                items.append({'id': '/'.join(rel + [name]), 'datum': total})
            else:
                items.append({'id': '/'.join(rel + [name]), 'datum': total, 'children': kids})
        elif name.endswith('.py'):
            n = lines(full)
            if n >= min_lines:
                items.append({'id': '/'.join(rel + [name]), 'datum': n})
    return items
tree = walk(root, [], 1)
circles = circlify.circlify(tree, show_enclosure=False, target_enclosure=circlify.Circle(x=0, y=0, r=1))
out = []
for c in circles:
    path = c.ex['id']
    out.append({'x': round(c.x, 5), 'y': round(c.y, 5), 'r': round(c.r, 5), 'level': c.level,
                'name': path.split('/')[-1], 'path': path, 'lines': c.ex['datum'], 'leaf': 'children' not in c.ex})
total = sum(c['datum'] for c in tree)
json.dump({'total_lines': total, 'circles': out}, open('out/circles.json', 'w'))
print(len(out), 'circles,', total, 'lines from', root)
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: max_depth (folder levels kept; deeper files are folded into their folder), min_lines (smaller modules are dropped). Walks the runtime's own Python standard library (tests and site-packages left out), sizes each .py file by its line count and packs the tree with circlify. To pack your own hierarchy, replace walk() with a nested {id, datum, children} list. circles.json: total_lines, circles as {x, y, r (in -1..1), level (1 = top), name, path, lines, leaf}.
