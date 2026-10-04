import { describe, it, expect } from 'vitest';
import { solveQsc, nearAxisToCylindrical } from '../src/core/nearAxis/qsc';
import ref from './fixtures/qsc_ref.json';

// Reference values generated with pyQSC (landreman/pyQSC) at nphi = 61, order r1.
describe('near-axis expansion (pyQSC parity)', () => {
  for (const [name, r] of Object.entries(ref as Record<string, any>)) {
    it(`${name}: iota, helicity, elongation, axis length, L∇B`, () => {
      const s = solveQsc({ rc: r.rc, zs: r.zs, rs: r.rs, zc: r.zc, nfp: r.nfp, etabar: r.etabar, sigma0: r.sigma0, I2: r.I2 });
      expect(s.converged).toBe(true);
      expect(s.helicity).toBe(r.helicity);
      expect(s.iota).toBeCloseTo(r.iota, 9);
      expect(s.axisLength).toBeCloseTo(r.axis_length, 10);
      expect(s.maxElongation).toBeCloseTo(r.max_elongation, 5);
      expect(s.minLgradB).toBeCloseTo(r.min_L_grad_B, 5);
    });
  }

  it('cylindrical conversion lands every point in the requested φ-plane', () => {
    const r = (ref as any)['precise QA'];
    const s = solveQsc({ rc: r.rc, zs: r.zs, nfp: r.nfp, etabar: r.etabar });
    const { R, Z } = nearAxisToCylindrical(s, 0.1, 12, 8);
    expect(R.every(Number.isFinite)).toBe(true);
    expect(Z.every(Number.isFinite)).toBe(true);
    // stellarator symmetry: at φ = 0 the cross-section is up–down symmetric about θ -> -θ
    const n = 8;
    for (let i = 1; i < 6; i++) {
      expect(R[i * n]).toBeCloseTo(R[(12 - i) * n], 8);
      expect(Z[i * n]).toBeCloseTo(-Z[(12 - i) * n], 8);
    }
  });
});
