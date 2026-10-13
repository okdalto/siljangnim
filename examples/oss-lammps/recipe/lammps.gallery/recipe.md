---
id: lammps.gallery
version: 1
title: Particles in a periodic Lennard-Jones box
capability: lammps simulation science
tier: C
kind: python
packages:
- lammps==2025.7.22.4.0
- mpich==5.0.1.post1
- numpy==2.2.6
source:
  name: "LAMMPS"
  repo: https://github.com/lammps/lammps
  license: "GPL-2.0"
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

# Particles in a periodic Lennard-Jones box

LAMMPS integrates 256 particles with Lennard-Jones interactions in a periodic box. Compare three computed time steps; colors indicate particle speeds.

LAMMPS로 주기 경계 상자 안의 입자 256개를 레너드존스 상호작용으로 적분했어요. 계산한 세 시간 단계를 비교하고 속도별 색을 살펴보세요.

## Setup

Install the pinned packages with Python 3.12. Map any listed input asset into in/. No GPU, API key or observation download is required. The LAMMPS wheel uses the MPICH runtime supplied by the pinned mpich package.

## Run

```python
import pathlib,json,numpy as np
out=pathlib.Path('out');out.mkdir(exist_ok=True)

from lammps import lammps
lmp=lammps(cmdargs=['-screen','none','-log','none'])
try:
 lmp.commands_string('''
units lj
atom_style atomic
boundary p p p
lattice fcc 0.5
region box block 0 4 0 4 0 4
create_box 1 box
create_atoms 1 box
mass 1 1.0
pair_style lj/cut 2.5
pair_coeff 1 1 1.0 1.0 2.5
pair_modify shift yes
velocity all create 1.0 87493 mom yes rot yes dist gaussian
neighbor 0.3 bin
neigh_modify every 1 delay 0 check yes
fix integrate all nve
timestep 0.003
thermo 50
run 0
''')
 count=lmp.get_natoms();assert count==256;frames=[];energies=[]
 for steps in [0,150,450]:
  if steps:lmp.command(f'run {steps}')
  coordinates=np.ctypeslib.as_array(lmp.gather_atoms('x',1,3),shape=(count*3,)).reshape(-1,3).copy();velocity=np.ctypeslib.as_array(lmp.gather_atoms('v',1,3),shape=(count*3,)).reshape(-1,3).copy()
  low,high,*_=lmp.extract_box();coords=np.mod(coordinates-np.asarray(low),np.asarray(high)-low)/(np.asarray(high)-low)*1.6-.8;speed=np.linalg.norm(velocity,axis=1);assert np.all(np.isfinite(coords)) and np.max(abs(coords))<=.80001
  frames.append({'points':coords.tolist(),'values':np.clip(speed/2-1,-1,1).tolist(),'radius':.024});energies.append(lmp.get_thermo('etotal'))
 assert max(energies)-min(energies)<.02
 result={'frames':frames,'energy_per_atom_lj_units':energies,'count':count,'timestep_lj':.003}
finally:lmp.close()

(out/'result.json').write_text(json.dumps(result,allow_nan=False))
```

## Verify

Executed locally on macOS arm64. The computation checks numerical properties and finite output. The scene selects saved results; rerun this recipe to change inputs.

## Notes

Original synthetic input. Coordinates wrap into the periodic box for display; energy and time use reduced Lennard-Jones units.
