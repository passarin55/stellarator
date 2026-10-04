import { describe, it, expect } from 'vitest';
import {
  surfaceMetrics,
  parseVmecInput,
  toVmecInput,
  fitFourierSurface,
  surfaceRZ,
  offsetSurface,
  evalSurface,
  type FourierSurface,
} from '../src/core/geometry/surface';
import boundaries from '../src/data/generated/boundaries.json';
import ref from './fixtures/simsopt_ref.json';
import { readFileSync } from 'node:fs';

const lib = boundaries as Record<string, FourierSurface & { source: string }>;
const sref = ref as Record<string, any>;

describe('Fourier surface metrics (simsopt parity)', () => {
  const cases: [string, string][] = [
    ['w7x-standard', 'input.W7-X_standard_configuration'],
    ['ncsx-li383', 'input.li383_low_res'],
    ['landreman-paul-qa', 'input.LandremanPaul2021_QA'],
    ['landreman-paul-qh-reactor', 'input.LandremanPaul2021_QH_reactorScale_lowres'],
    ['nuhrenberg-zille-qhs', 'input.NuhrenbergZille_1988_QHS'],
    ['rotating-ellipse', 'input.rotating_ellipse'],
  ];
  for (const [id, file] of cases) {
    it(`${id}: volume, area, R, a, aspect ratio`, () => {
      const m = surfaceMetrics(lib[id], 96, 96);
      const r = sref[file];
      expect(m.volume).toBeCloseTo(r.volume, 6);
      expect(m.area / r.area).toBeCloseTo(1, 7);
      expect(m.majorRadius).toBeCloseTo(r.major, 7);
      expect(m.minorRadius).toBeCloseTo(r.minor, 7);
      expect(m.aspectRatio).toBeCloseTo(r.aspect, 6);
    });
  }

  it('analytic torus: V = 2π²Ra², A = 4π²Ra', () => {
    const s: FourierSurface = { nfp: 1, lasym: false, modes: [{ m: 0, n: 0, rbc: 3, zbs: 0 }, { m: 1, n: 0, rbc: 0.5, zbs: 0.5 }] };
    const m = surfaceMetrics(s, 32, 8);
    expect(m.volume).toBeCloseTo(2 * Math.PI ** 2 * 3 * 0.25, 10);
    expect(m.area).toBeCloseTo(4 * Math.PI ** 2 * 3 * 0.5, 10);
    expect(m.maxElongation).toBeCloseTo(1, 6);
    expect(m.saddleFraction).toBeGreaterThan(0.3); // inboard half of a torus has K < 0
  });
});

describe('VMEC namelist I/O', () => {
  it('parser matches the generated JSON (build-data.mjs parity)', () => {
    const txt = readFileSync(new URL('../data/raw/input.W7-X_standard_configuration', import.meta.url), 'utf8');
    const p = parseVmecInput(txt);
    expect(p.nfp).toBe(5);
    expect(p.modes.length).toBe(lib['w7x-standard'].modes.length);
    expect(p.modes[3].rbc).toBeCloseTo(lib['w7x-standard'].modes[3].rbc, 10);
  });
  it('round-trips through toVmecInput', () => {
    const s = lib['landreman-paul-qa'];
    const back = parseVmecInput(toVmecInput(s, { phiedge: 0.0838 }));
    expect(back.nfp).toBe(2);
    expect(back.phiedge).toBeCloseTo(0.0838, 12);
    for (const th of [0.1, 1.3, 4]) for (const ph of [0, 0.7, 2.1]) {
      const a = surfaceRZ(s, th, ph);
      const b = surfaceRZ(back, th, ph);
      expect(b[0]).toBeCloseTo(a[0], 12);
      expect(b[1]).toBeCloseTo(a[1], 12);
    }
  });
  it('handles non-stellarator-symmetric (LASYM) boundaries', () => {
    const s = lib['lsp-section-5p3'];
    expect(s.lasym).toBe(true);
    expect(s.modes.some((m) => (m.rbs ?? 0) !== 0 || (m.zbc ?? 0) !== 0)).toBe(true);
  });
});

describe('fitting and offsetting', () => {
  it('fitFourierSurface reproduces a sampled boundary', () => {
    const s = lib['ncsx-li383'];
    const nt = 40, np = 40, P = (2 * Math.PI) / s.nfp;
    const R = new Float64Array(nt * np), Z = new Float64Array(nt * np);
    for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) {
      const [r, z] = surfaceRZ(s, (2 * Math.PI * i) / nt, (j * P) / np);
      R[i * np + j] = r; Z[i * np + j] = z;
    }
    const f = fitFourierSurface(R, Z, nt, np, s.nfp, 12, 12);
    const [r1, z1] = surfaceRZ(f, 0.77, 0.31);
    const [r0, z0] = surfaceRZ(s, 0.77, 0.31);
    expect(r1).toBeCloseTo(r0, 6);
    expect(z1).toBeCloseTo(z0, 6);
  });
  it('offset of a circular torus is a fatter circular torus', () => {
    const s: FourierSurface = { nfp: 1, lasym: false, modes: [{ m: 0, n: 0, rbc: 3, zbs: 0 }, { m: 1, n: 0, rbc: 0.5, zbs: 0.5 }] };
    const o = offsetSurface(s, 0.2, 4, 2, 32, 8);
    const p = evalSurface(o, 0, 0);
    expect(p.R).toBeCloseTo(3.7, 8);
    expect(surfaceMetrics(o, 32, 8).minorRadius).toBeCloseTo(0.7, 8);
  });
});
