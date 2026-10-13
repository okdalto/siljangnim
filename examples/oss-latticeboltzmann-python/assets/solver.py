# Adapted from Philip Mocz; GPL-3.0. Pinned source and modification notes are in SOURCE.json.
import matplotlib
matplotlib.use("Agg")
import pathlib,json
from PIL import Image
out=pathlib.Path("out");out.mkdir(exist_ok=True)
snapshots=[]
import matplotlib.pyplot as plt
import numpy as np

"""
Create Your Own Lattice Boltzmann Simulation (With Python)
Philip Mocz (2020) Princeton University, @PMocz

Simulate flow past cylinder
for an isothermal fluid

"""


def main():
    """Lattice Boltzmann Simulation"""

    # Simulation parameters
    Nx = 160  # resolution x-dir
    Ny = 64  # resolution y-dir
    rho0 = 100  # average density
    tau = 0.6  # collision timescale
    Nt = 1200  # number of timesteps
    plotRealTime = True  # switch on for plotting as the simulation goes along

    # Lattice speeds / weights
    NL = 9
    idxs = np.arange(NL)
    cxs = np.array([0, 0, 1, 1, 1, 0, -1, -1, -1])
    cys = np.array([0, 1, 1, 0, -1, -1, -1, 0, 1])
    weights = np.array(
        [4 / 9, 1 / 9, 1 / 36, 1 / 9, 1 / 36, 1 / 9, 1 / 36, 1 / 9, 1 / 36]
    )  # sums to 1

    # Initial Conditions
    F = np.ones((Ny, Nx, NL))  # * rho0 / NL
    np.random.seed(42)
    F += 0.01 * np.random.randn(Ny, Nx, NL)
    X, Y = np.meshgrid(range(Nx), range(Ny))
    F[:, :, 3] += 2 * (1 + 0.2 * np.cos(2 * np.pi * X / Nx * 4))
    rho = np.sum(F, 2)
    for i in idxs:
        F[:, :, i] *= rho0 / rho

    # Cylinder boundary
    X, Y = np.meshgrid(range(Nx), range(Ny))
    cylinder = (X - Nx / 4) ** 2 + (Y - Ny / 2) ** 2 < (Ny / 4) ** 2

    initial_mass = F.sum()

    # Prep figure
    fig = plt.figure(figsize=(4, 2), dpi=80)

    # Simulation Main Loop
    for it in range(Nt):
        # Iteration logging omitted for the recipe.

        # Drift
        for i, cx, cy in zip(idxs, cxs, cys):
            F[:, :, i] = np.roll(F[:, :, i], cx, axis=1)
            F[:, :, i] = np.roll(F[:, :, i], cy, axis=0)

        # Set reflective boundaries
        bndryF = F[cylinder, :]
        bndryF = bndryF[:, [0, 5, 6, 7, 8, 1, 2, 3, 4]]

        # Calculate fluid variables
        rho = np.sum(F, 2)
        ux = np.sum(F * cxs, 2) / rho
        uy = np.sum(F * cys, 2) / rho

        # Apply Collision
        Feq = np.zeros(F.shape)
        for i, cx, cy, w in zip(idxs, cxs, cys, weights):
            Feq[:, :, i] = (
                rho
                * w
                * (
                    1
                    + 3 * (cx * ux + cy * uy)
                    + 9 * (cx * ux + cy * uy) ** 2 / 2
                    - 3 * (ux**2 + uy**2) / 2
                )
            )

        F += -(1.0 / tau) * (F - Feq)

        # Apply boundary
        F[cylinder, :] = bndryF

        if (it+1) % 400 == 0:
            assert np.all(np.isfinite(F)) and np.min(rho)>0
            assert abs(F.sum()/initial_mass-1)<1e-8
            ux[cylinder]=0;uy[cylinder]=0
            curl=(np.roll(ux,-1,axis=0)-np.roll(ux,1,axis=0))-(np.roll(uy,-1,axis=1)-np.roll(uy,1,axis=1))
            pixels=(plt.get_cmap('bwr')(np.clip((curl+.1)/.2,0,1))*255).astype(np.uint8);pixels[cylinder]=[20,30,45,255]
            Image.fromarray(pixels).resize((480,192),Image.Resampling.NEAREST).save(out/f'render-{len(snapshots)}.png')
            snapshots.append({'step':it+1,'mass':float(F.sum()),'max_abs_vorticity':float(np.max(abs(curl)))})

    assert len(snapshots)==3
    (out/'result.json').write_text(json.dumps({'snapshots':snapshots},allow_nan=False))
    plt.close('all')

    return 0


if __name__ == "__main__":
    main()
