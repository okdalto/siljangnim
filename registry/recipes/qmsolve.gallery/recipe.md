---
id: qmsolve.gallery
version: 1
title: Bound states in a quantum well
capability: qmsolve simulation science
tier: C
kind: python
packages:
- qmsolve==2.0.0
- numpy==2.2.6
source:
  name: "QMsolve"
  repo: https://github.com/quantum-visualizations/qmsolve
  license: "BSD-3-Clause"
io:
  inputs: []
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Bound states in a quantum well

QMsolve diagonalizes a one-dimensional harmonic Hamiltonian. Compare the first three normalized probability densities and computed energies.

QMsolve로 1차원 조화 진동자의 해밀토니안을 대각화했어요. 처음 세 상태의 정규화된 확률 밀도와 계산 에너지를 비교하세요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU, API key or observation download is required. 

## Run

```python
import pathlib,json,numpy as np
out=pathlib.Path('out');out.mkdir(exist_ok=True)

from qmsolve import Hamiltonian,SingleParticle,eV,Å
H=Hamiltonian(particles=SingleParticle(),potential=lambda p:.5*5*eV/Å**2*p.x**2,spatial_ndim=1,N=256,extent=12*Å)
states=H.solve(max_states=3);energies=np.asarray(states.energies);psi=np.asarray(states.array);assert np.all(np.diff(energies)>0)
spacings=np.diff(energies);assert np.max(spacings)/np.min(spacings)<1.02
frames=[]
for state in psi:
 density=np.abs(state)**2;density/=np.trapezoid(density,dx=12/255);assert abs(np.trapezoid(density,dx=12/255)-1)<1e-6
 points=np.column_stack([np.linspace(-.85,.85,256),density/density.max()*1.4-.7]).tolist();frames.append({'paths':[{'points':points}]})
result={'frames':frames,'energies_eV':energies.tolist()}

(out/'result.json').write_text(json.dumps(result,allow_nan=False))
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

Original synthetic input. Each probability-density curve is scaled to its own peak for shape comparison; energies are in eV.
