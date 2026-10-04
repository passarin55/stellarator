import { describe, it, expect } from 'vitest';
import { solveRegcoil, cutModularCoils, normalFieldError, poloidalCurrentFor } from '../src/core/coils/regcoil';
import { offsetSurface, surfaceMetrics, type FourierSurface } from '../src/core/geometry/surface';
import boundaries from '../src/data/generated/boundaries.json';

const lib = boundaries as Record<string, FourierSurface>;

describe('REGCOIL-style coil synthesis', () => {
  it('axisymmetric torus: pure G current gives B·n ≡ 0 and Φ_sv ≈ 0', () => {
    const plasma: FourierSurface = { nfp: 2, lasym: false, modes: [{ m: 0, n: 0, rbc: 3, zbs: 0 }, { m: 1, n: 0, rbc: 0.5, zbs: 0.5 }] };
    const winding = offsetSurface(plasma, 0.5, 4, 2, 32, 8);
    const r = solveRegcoil({ plasma, winding, G: poloidalCurrentFor(1, 3), mpol: 3, ntor: 2, lambda: 1e-16, nthetaPlasma: 16, nzetaPlasma: 8, nthetaCoil: 24, nzetaCoil: 16 });
    expect(r.rmsBn).toBeLessThan(1e-8);
    expect(Math.max(...Array.from(r.phi, Math.abs))).toBeLessThan(1);
  });

  it('Landreman–Paul QA: low B·n residual and cut coils reproduce the boundary', () => {
    const plasma = lib['landreman-paul-qa'];
    const winding = offsetSurface(plasma, 0.25, 8, 8, 40, 40);
    const R0 = surfaceMetrics(plasma).majorRadius;
    const G = poloidalCurrentFor(1, R0);
    const r = solveRegcoil({ plasma, winding, G, mpol: 8, ntor: 8, lambda: 1e-15, nthetaPlasma: 24, nzetaPlasma: 24, nthetaCoil: 40, nzetaCoil: 40 });
    // normalised residual well below 1 % of B0
    expect(r.rmsBn).toBeLessThan(5e-3);
    const coils = cutModularCoils(r, 4, 96);
    expect(coils.length).toBe(16);
    const err = normalFieldError(coils, plasma);
    expect(err.mean).toBeLessThan(0.03);
  });

  it('regularisation trades B·n accuracy for smaller currents', () => {
    const plasma = lib['landreman-paul-qa'];
    const winding = offsetSurface(plasma, 0.25, 6, 6, 32, 32);
    const G = poloidalCurrentFor(1, 1);
    const base = { plasma, winding, G, mpol: 6, ntor: 6, nthetaPlasma: 16, nzetaPlasma: 16, nthetaCoil: 32, nzetaCoil: 32 };
    const lo = solveRegcoil({ ...base, lambda: 1e-18 });
    const hi = solveRegcoil({ ...base, lambda: 1e-12 });
    expect(hi.chi2B).toBeGreaterThan(lo.chi2B);
    expect(hi.chi2K).toBeLessThan(lo.chi2K);
  });
});
