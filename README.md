# Stellarator Studio Lab

**An in-browser, physics-validated design laboratory for stellarators** — from the shape of the magnetic axis to coils, field lines and power-plant performance. Every solver runs locally in parallel Web Workers: no server, no install, no account.

```
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + 51 validation tests
npm run build      # static site in dist/ (works from any sub-path or file share)
```

## What's inside

| Module | What it does | Validated against |
|---|---|---|
| **Configuration Studio** | VMEC-convention Fourier boundaries (W7-X, NCSX, Landreman–Paul precise QA/QH, Nührenberg–Zille QHS, …): 3D view coloured by height or Gaussian/mean curvature, cross-sections, Fourier-spectrum map, live mode editor, VMEC `&INDATA` import/export, wall/winding-surface offsets | simsopt `SurfaceRZFourier` — volume, area, R, a, aspect ratio to ≤ 10⁻⁷ |
| **Near-Axis Designer** | First-order Garren–Boozer construction of quasisymmetric fields: σ-equation (Riccati) via spectral differentiation + Newton, helicity, elongation, ∇B tensor and L∇B; flux surface coloured by \|B\|; one-click conversion to a VMEC boundary | pyQSC — ι to 10⁻⁹ for 7 published configurations |
| **Coil Lab** | Real coil sets (W7-X 70 coils, NCSX, HSX) with current presets (standard / high-ι / low-ι / high-mirror), length, curvature, coil–coil & coil–plasma distances, ampere-metres, Lorentz forces, regularised Neumann inductance and stored energy; MAKEGRID export. **REGCOIL-style synthesis**: current potential on a winding surface, Tikhonov least squares, L-curve λ scan, B·n and \|K\| maps, contour cutting into discrete modular coils | simsopt `BiotSavart` < 10⁻⁴; W7-X stored energy ≈ 540 MJ (IPP: ≈ 600 MJ) |
| **Field-Line Lab** | Parallel Biot–Savart "mgrid" (tricubic), magnetic-axis Newton solver with Greene's residue and monodromy ι, RK4 field-line tracing, Poincaré sections in two planes, ι profiles with rational surfaces, 3D field lines, CSV export | W7-X standard: ι₀ = 0.857 → 5/5 edge islands; LP-QA coils → ι ≈ 0.42 |
| **Reactor Studio** | 0-D power balance (Bosch–Hale D-T, bremsstrahlung, ISS04 × f_ren, Sudo limit), POPCON maps with P_aux/Q/β/density-limit contours, Lawson diagram, profiles; presets for Stellaris, Infinity Two, Helios, HELIAS 5-B | Bosch–Hale Table VIII ≤ 0.5 %; Lawson minimum ≈ 3×10²¹ keV s m⁻³ |
| **Plasma Formulary** | Debye length, frequencies, gyro-radii, Braginskii collision times, ν\*, Alfvén speed, Spitzer resistivity, 1/ν transport estimate; reactivity plot for D-T, D-³He, D-D | NRL Plasma Formulary |
| **Device Atlas** | 19 experiments & power-plant designs (W7-X, LHD, HSX, NCSX, TJ-II, CFQS, MUSE, Stellaris, Infinity Two, Helios, GIGA, …) with sources, design-space scatter, 75-year timeline, glossary | primary/press sources linked per entry |
| **Learn** | Seven KaTeX chapters: why stellarators, geometry, Boozer coordinates & quasisymmetry, near-axis expansion, coils, field lines, reactor physics | — |

Cross-module workflow: *Near-Axis Designer → Send boundary to Studio → Coil Lab (REGCOIL) → Trace in Field Lab → Reactor Studio.* The exact same chain runs headless in `tests/pipeline.test.ts`.

Other niceties: ⌘K command palette, light/dark/system theme, project save/load (JSON), PNG/CSV export from every plot, PNG export from every 3D view, URL deep links (`#/studio?b=w7x-standard`, `#/field?c=w7x`), lazy-loaded modules, worker pool with progress and cancellation.

## Architecture

```
src/
  core/                 framework-free physics (pure TS, fully unit-tested, runs in workers)
    math/               dense linear algebra, spectral differentiation, Newton/root solvers
    geometry/surface.ts Fourier surfaces: metrics, curvature, offsets, fitting, VMEC I/O
    nearAxis/qsc.ts     pyQSC port (O(r¹) quasisymmetry)
    coils/coils.ts      Fourier curves, symmetry expansion, engineering metrics, MAKEGRID
    coils/regcoil.ts    current-potential coil synthesis + coil cutting
    field/biotSavart.ts exact polyline Biot–Savart, forces, Neumann inductance, energy
    field/grid.ts       periodic cylindrical field grid + tricubic interpolation
    field/fieldlines.ts RK4 tracer, Poincaré, axis finder, ι, rationals
    physics/            Bosch–Hale, ISS04/Sudo/power balance/POPCON/Lawson, formulary
  workers/              typed message protocol, compute worker, work-stealing pool
  data/                 library (boundaries, coil sets, near-axis presets), atlas, timeline, articles
  ui/                   React 19 shell, canvas plot engine, three.js viewer, pages
scripts/build-data.mjs  converts data/raw (VMEC inputs, simsopt coil files) → src/data/generated
tests/                  51 tests incl. parity fixtures generated with pyQSC & simsopt
```

Design notes:

* **Physics core is UI-agnostic.** Every algorithm lives in `src/core` with no DOM dependency, so the same code runs in Node (tests), the main thread (fast analytics) and Web Workers (heavy jobs).
* **Field-line tracing uses an interpolated grid**, not direct Biot–Savart: building a 41×49×36 grid for W7-X costs ~10⁹ segment evaluations once (split over all cores), after which each RK4 stage is a 64-node tricubic stencil (~10⁴× cheaper).
* **Iota is measured robustly** by tracing the axis simultaneously with every line so the poloidal angle can be unwrapped continuously; it is cross-checked against the monodromy eigenvalues of the one-period map.
* **REGCOIL exploits periodicity**: the inductance kernel is folded over field periods before projecting onto Fourier modes, cutting the cost by `nfp`.

## Data provenance & licences

* Boundaries and coil shapes in `data/raw` are unmodified files from [simsopt](https://github.com/hiddenSymmetries/simsopt) (MIT). See `data/raw/README.md`.
* The near-axis solver is a TypeScript port of [pyQSC](https://github.com/landreman/pyQSC) (MIT).
* Test fixtures in `tests/fixtures` were generated with pyQSC and simsopt (see `tests/fixtures/README.md`).
* Device parameters are nominal published values; entries flagged ≈ in the Atlas vary between sources. Full bibliography on the in-app **References** page and in `docs/PHYSICS.md`.

This project is released under the MIT licence (see `LICENSE`).

## Limitations (by design)

* The near-axis model is first order (O(r)); real designs use O(r²) and full equilibrium solves (VMEC/DESC/SPEC).
* Field-line tracing is vacuum-field only (no plasma currents or finite-β shifts).
* Coil forces exclude the self-force; inductance uses a circular-cross-section regularisation.
* The reactor model is 0-D with parabolic profiles — a scoping tool, not a systems code.
