---
id: rebound.disk-flyby
version: 1
title: Debris disk torn by a passing star (REBOUND)
capability: simulate n-body gravity orbits trajectories flyby tidal tails json
tier: C
kind: python
packages:
- rebound==5.2.0
source:
  name: REBOUND
  repo: https://github.com/hannorein/rebound
  license: GPL-3.0-only
io:
  inputs: []
  outputs:
  - name: orbits.json
    media: json
verify:
  params:
    particles: 20
    frames: 10
    t_end: 5
  expect_outputs:
  - orbits.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-12'
    version: 1
status: verified
origin: local
updated: '2026-10-12'
---

# Debris disk torn by a passing star (REBOUND)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, math, os, random
import rebound
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
rnd = random.Random(int(P.get('seed', 3)))
N = int(P.get('particles', 500))
frames = int(P.get('frames', 200))
t_end = float(P.get('t_end', 55))
sim = rebound.Simulation()
sim.integrator = 'ias15'
sim.add(m=1.0)
q, e = float(P.get('pericenter', 1.9)), 1.6
sim.add(m=float(P.get('perturber_mass', 0.6)), a=q / (1 - e), e=e, inc=float(P.get('inclination', 0.35)), omega=0.6, f=-2.05, primary=sim.particles[0])
radius = []
for i in range(N):
    r = 0.45 + 1.05 * math.sqrt(rnd.random())
    radius.append(round(r, 3))
    sim.add(a=r, e=0.0, inc=rnd.gauss(0, 0.01), f=rnd.uniform(0, 2 * math.pi), Omega=rnd.uniform(0, 2 * math.pi), primary=sim.particles[0])
sim.N_active = 2
sim.move_to_com()
pos, times = [], []
for k in range(frames):
    t = t_end * k / (frames - 1)
    sim.integrate(t)
    times.append(round(t, 3))
    for p in sim.particles:
        pos += [round(p.x, 3), round(p.y, 3), round(p.z, 3)]
json.dump({"frames": frames, "bodies": N + 2, "times": times, "radius": radius, "positions": pos}, open('out/orbits.json', 'w'))
print(N, "particles,", frames, "frames to t =", t_end)
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: particles (test particles in the disk), frames (saved snapshots), t_end (G = 1, star mass 1; inner orbits take about 2), seed, perturber_mass, pericenter, inclination. IAS15 integrates a star with a disk of massless particles while a second star passes on a hyperbolic orbit. orbits.json: frames, bodies (2 stars first, then particles), times, radius (initial orbit radius per particle), positions (frame-major flat [x, y, z] per body, 3 decimals).
