import { describe, it, expect } from 'vitest';
import { expandCoils, curveGeometry, minCoilCoilDistance, polylineLength, parseSimsoptCurves, type CoilSetDefinition } from '../src/core/coils/coils';
import { packCoils, biotSavart, biotSavartCyl, storedEnergy, MU0 } from '../src/core/field/biotSavart';
import { buildFieldGrid, gridEvaluator, directEvaluator } from '../src/core/field/grid';
import { findMagneticAxis, traceFieldLines } from '../src/core/field/fieldlines';
import coilsets from '../src/data/generated/coilsets.json';
import ref from './fixtures/simsopt_ref.json';
import boundaries from '../src/data/generated/boundaries.json';
import { surfaceRZ, type FourierSurface } from '../src/core/geometry/surface';
import { readFileSync } from 'node:fs';

const sets = coilsets as unknown as Record<string, CoilSetDefinition & { axis: { rc: number[]; zs: number[] } }>;

describe('Biot–Savart', () => {
  it('circular loop: on-axis field μ0 I a² / 2(a²+z²)^{3/2}', () => {
    const n = 2000, a = 1.3, I = 1e5;
    const pts = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) { pts[3 * i] = a * Math.cos((2 * Math.PI * i) / n); pts[3 * i + 1] = a * Math.sin((2 * Math.PI * i) / n); }
    const pc = packCoils([{ points: pts, current: I }]);
    for (const z of [0, 0.4, 2]) {
      const B = biotSavart(pc, new Float64Array([0, 0, z]));
      expect(B[2]).toBeCloseTo((MU0 * I * a * a) / (2 * (a * a + z * z) ** 1.5), 6);
      expect(Math.abs(B[0]) + Math.abs(B[1])).toBeLessThan(1e-12);
    }
  });

  for (const id of ['w7x', 'ncsx', 'hsx'] as const) {
    it(`${id}: matches simsopt BiotSavart at reference points (<1e-4 rel.)`, () => {
      const coils = expandCoils(sets[id], 768);
      const pc = packCoils(coils);
      const r = (ref as any)[id];
      const B = biotSavart(pc, Float64Array.from(r.points.flat()));
      r.B.forEach((b: number[], i: number) => {
        const err = Math.hypot(B[3 * i] - b[0], B[3 * i + 1] - b[1], B[3 * i + 2] - b[2]) / Math.hypot(b[0], b[1], b[2]);
        expect(err).toBeLessThan(1e-4);
      });
    });
  }

  it('W7-X coil set: 70 coils, 50 non-planar; stored energy ≈ 600 MJ class', () => {
    const coils = expandCoils(sets.w7x, 96);
    expect(coils.length).toBe(70);
    expect(coils.filter((c) => c.baseIndex < 5).length).toBe(50);
    const L = polylineLength(coils[0].points);
    expect(L).toBeGreaterThan(8);
    expect(L).toBeLessThan(10);
    const g = curveGeometry(sets.w7x.curves[0]);
    expect(g.length).toBeCloseTo(L, 1);
    const { distance } = minCoilCoilDistance(coils);
    expect(distance).toBeGreaterThan(0.05);
    // Filament model with a 0.1 m equivalent conductor radius. The engineering
    // value quoted by IPP for the W7-X magnet system is ~600 MJ at 3 T.
    const { energy } = storedEnergy(coils.filter((c) => c.current !== 0), 0.1);
    expect(energy / 1e6).toBeGreaterThan(300);
    expect(energy / 1e6).toBeLessThan(800);
  });

  it('parses simsopt coil files', () => {
    const curves = parseSimsoptCurves(readFileSync(new URL('../data/raw/HSX.dat', import.meta.url), 'utf8'));
    expect(curves.length).toBe(6);
    expect(curves[0].xc[0]).toBeCloseTo(sets.hsx.curves[0].xc[0], 10);
  });
});

describe('field-line tracing (W7-X standard configuration)', () => {
  const coils = expandCoils(sets.w7x, 128);
  const pc = packCoils(coils);
  const spec = { nfp: 5, Rmin: 4.6, Rmax: 6.4, Zmin: -1.1, Zmax: 1.1, nR: 37, nZ: 45, nPhi: 36 };
  const grid = buildFieldGrid(pc, spec);
  const f = gridEvaluator(grid);

  it('grid interpolation agrees with direct Biot–Savart', () => {
    const out = new Float64Array(3);
    const exact = directEvaluator(pc);
    const ex = new Float64Array(3);
    // sample points inside the plasma: between the boundary centre and its outboard edge
    const w7x = (boundaries as Record<string, FourierSurface>)['w7x-standard'];
    const pts = [0.03, 0.4, 0.63, 0.9].flatMap((phi) => {
      const [Ro, Zo] = surfaceRZ(w7x, 0, phi);
      const [Ri, Zi] = surfaceRZ(w7x, Math.PI, phi);
      const Rc = 0.5 * (Ro + Ri), Zc = 0.5 * (Zo + Zi);
      return [0, 0.5, 0.8].map((s) => [Rc + s * (Ro - Rc), phi, Zc + s * (Zo - Zc)]);
    });
    for (const [R, phi, Z] of pts) {
      f(R, phi, Z, out);
      exact(R, phi, Z, ex);
      const err = Math.hypot(out[0] - ex[0], out[1] - ex[1], out[2] - ex[2]) / Math.hypot(ex[0], ex[1], ex[2]);
      expect(err).toBeLessThan(1.5e-3);
    }
  });

  it('finds the magnetic axis and measures ι in the known W7-X range', () => {
    const ax = findMagneticAxis(f, { R: 5.95, Z: 0 }, 0, 5, 72);
    expect(ax.converged).toBe(true);
    expect(ax.R).toBeGreaterThan(5.85);
    expect(ax.R).toBeLessThan(6.05);
    expect(Math.abs(ax.Z)).toBeLessThan(1e-6); // stellarator symmetry at φ = 0
    expect(ax.residue).toBeGreaterThan(0);
    expect(ax.residue).toBeLessThan(1);
    const lines = traceFieldLines(f, [{ R: ax.R + 0.15, Z: 0 }], { nfp: 5, phi0: 0, transits: 30, stepsPerPeriod: 72, axis: ax });
    const iota = Math.abs(lines[0].iota);
    // standard configuration: ι ≈ 0.86 on axis rising to 5/5 at the boundary
    expect(iota).toBeGreaterThan(0.82);
    expect(iota).toBeLessThan(1.0);
    expect(Math.abs(Math.abs(ax.iotaAxis) - iota)).toBeLessThan(0.05);
  });

  it('cylindrical B on axis ≈ 2.5–3 T (W7-X nominal 2.5 T average, 3 T max)', () => {
    const [bR, bP, bZ] = biotSavartCyl(pc, 5.95, 0, 0);
    const B = Math.hypot(bR, bP, bZ);
    expect(B).toBeGreaterThan(2.6);
    expect(B).toBeLessThan(3.1);
  });
});
