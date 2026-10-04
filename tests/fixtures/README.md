# Test fixtures (ground truth)

* `qsc_ref.json` — generated with **pyQSC** (`pip install qsc`) using `Qsc.from_paper(name, order='r1')`
  with the default `nphi = 61`: iota, helicity, max elongation, axis length and min L∇B.
* `simsopt_ref.json` — generated with **simsopt** (`simsopt.configs.get_data`, `SurfaceRZFourier.from_vmec_input`):
  Biot–Savart field of the W7-X / NCSX / HSX coil sets at reference points, and volume, area,
  major/minor radius and aspect ratio of the bundled VMEC boundaries.
