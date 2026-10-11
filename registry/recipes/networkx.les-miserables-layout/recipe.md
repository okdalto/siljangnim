---
id: networkx.les-miserables-layout
version: 1
title: Character network layout and communities (NetworkX)
capability: graph-layout network nodes edges communities json
tier: C
kind: python
packages:
- networkx==3.5
- numpy
source:
  name: NetworkX
  repo: https://github.com/networkx/networkx
  license: BSD-3-Clause
io:
  inputs: []
  outputs:
  - name: graph.json
    media: json
verify:
  params:
    iterations: 20
  expect_outputs:
  - graph.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-11'
    version: 1
status: verified
origin: local
updated: '2026-10-11'
---

# Character network layout and communities (NetworkX)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, os
import networkx as nx
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
G = nx.read_weighted_edgelist('in/graph.edgelist') if os.path.exists('in/graph.edgelist') else nx.les_miserables_graph()
pos = nx.spring_layout(G, seed=int(P.get('seed', 3)), iterations=int(P.get('iterations', 200)), weight='weight')
groups = {n: i for i, c in enumerate(nx.community.greedy_modularity_communities(G, weight='weight')) for n in c}
names = list(G.nodes())
xs = [pos[n][0] for n in names]; ys = [pos[n][1] for n in names]
fit = lambda v, lo, hi: 0.08 + 0.84 * (v - lo) / ((hi - lo) or 1)
nodes = [{"name": n, "x": round(fit(pos[n][0], min(xs), max(xs)), 4), "y": round(fit(pos[n][1], min(ys), max(ys)), 4),
          "group": groups[n], "degree": G.degree(n)} for n in names]
index = {n: i for i, n in enumerate(names)}
edges = [[index[a], index[b], d.get('weight', 1)] for a, b, d in G.edges(data=True)]
json.dump({"nodes": nodes, "edges": edges}, open('out/graph.json', 'w'))
print(len(nodes), "nodes,", len(edges), "edges,", len(set(groups.values())), "communities")
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Uses the Les Misérables co-occurrence graph that ships with NetworkX (or in/graph.edgelist when given: 'a b weight' per line). Params: seed, iterations. graph.json: nodes {name, x, y (0..1), group, degree}, edges [i, j, weight].
