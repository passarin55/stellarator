# Raw reference data

All files in this directory are unmodified copies of open-source reference data.
`npm run data:build` converts them into `src/data/generated/*.json`.

| File | What it is | Source |
|---|---|---|
| `input.W7-X_standard_configuration` | W7-X standard-configuration VMEC boundary | simsopt `tests/test_files` |
| `input.li383_low_res` | NCSX LI383 boundary (low resolution) | simsopt `tests/test_files` |
| `input.LandremanPaul2021_QA` | Precise quasi-axisymmetry, nfp = 2, A = 6 (Landreman & Paul, PRL 128, 035001, 2022) | simsopt `tests/test_files` |
| `input.LandremanPaul2021_QH_reactorScale_lowres` | Precise quasi-helical symmetry, nfp = 4, reactor scale | simsopt `tests/test_files` |
| `input.NuhrenbergZille_1988_QHS` | First quasi-helically symmetric configuration (Nührenberg & Zille, Phys. Lett. A 129, 1988) | simsopt `tests/test_files` |
| `input.LandremanSenguptaPlunk_section5p3` | Non-stellarator-symmetric near-axis example (JPP 85, 905850103, 2019) | simsopt `tests/test_files` |
| `input.rotating_ellipse` | Classic 3-period rotating ellipse | simsopt `tests/test_files` |
| `input.circular_tokamak` | Circular tokamak boundary (reference) | simsopt `tests/test_files` |
| `W7-X.dat`, `NCSX.dat`, `HSX.dat` | Coil shapes as `CurveXYZFourier` coefficients (6 columns per coil: xs, xc, ys, yc, zs, zc) | simsopt `src/simsopt/configs` |

simsopt: https://github.com/hiddenSymmetries/simsopt — MIT License, © 2020 simsopt developers.
Coil currents and magnetic-axis initial guesses are transcribed from `simsopt/configs/zoo.py`.
