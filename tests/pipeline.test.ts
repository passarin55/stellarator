import { describe, it, expect } from 'vitest';
import { solveRegcoil, cutModularCoils, normalFieldError, poloidalCurrentFor } from '../src/core/coils/regcoil';
import { offsetSurface, surfaceMetrics, surfaceRZ, type FourierSurface } from '../src/core/geometry/surface';
import { packCoils } from '../src/core/field/biotSavart';
import { buildFieldGrid, gridEvaluator } from '../src/core/field/grid';
import { findMagneticAxis, traceFieldLines } from '../src/core/field/fieldlines';
import boundaries from '../src/data/generated/boundaries.json';

const lib = boundaries as Record<string, FourierSurface>;

// End-to-end: boundary → REGCOIL → discrete coils → Biot–Savart grid → axis → ι.
// Landreman & Paul (PRL 2022) report ι ≈ 0.42 for their precise-QA configuration.
describe('design pipeline (Landreman–Paul precise QA)', () => {
  it('coils synthesised from the boundary recover nested surfaces with ι ≈ 0.42', () => {
    const plasma = lib['landreman-paul-qa'];
    const m = surfaceMetrics(plasma);
    const winding = offsetSurface(plasma, 0.3, 8, 8, 40, 40);
    const r = solveRegcoil({ plasma, winding, G: poloidalCurrentFor(1, m.majorRadius), mpol: 10, ntor: 10, lambda: 1e-16, nthetaPlasma: 32, nzetaPlasma: 32, nthetaCoil: 48, nzetaCoil: 48 });
    const coils = cutModularCoils(r, 6, 128);
    const err = normalFieldError(coils, plasma);
    const [Rmin, Rmax] = m.rRange;
    const [Zmin, Zmax] = m.zRange;
    const grid = buildFieldGrid(packCoils(coils), { nfp: 2, Rmin: Rmin - 0.05, Rmax: Rmax + 0.05, Zmin: Zmin - 0.05, Zmax: Zmax + 0.05, nR: 41, nZ: 41, nPhi: 48 });
    const f = gridEvaluator(grid);
    const [R0] = surfaceRZ(plasma, 0, 0);
    const [Rin] = surfaceRZ(plasma, Math.PI, 0);
    const ax = findMagneticAxis(f, { R: 0.5 * (R0 + Rin), Z: 0 }, 0, 2, 96);
    const lines = traceFieldLines(f, [0.3, 0.6, 0.9].map((s) => ({ R: ax.R + s * (R0 - ax.R), Z: 0 })), { nfp: 2, phi0: 0, transits: 20, stepsPerPeriod: 96, axis: ax });
    const iotas = lines.map((l) => Math.abs(l.iota));
    expect(ax.converged).toBe(true);
    expect(err.mean).toBeLessThan(0.02);
    expect(lines.every((l) => !l.lost)).toBe(true);
    for (const i of iotas) {
      expect(i).toBeGreaterThan(0.38);
      expect(i).toBeLessThan(0.46);
    }
    // ι nearly flat (low shear) — hallmark of this configuration
    expect(Math.max(...iotas) - Math.min(...iotas)).toBeLessThan(0.03);
  });
});
