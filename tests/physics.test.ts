import { describe, it, expect } from 'vitest';
import { reactivity } from '../src/core/physics/fusion';
import { iss04, sudoLimit, powerBalance, lawsonIgnition, popcon } from '../src/core/physics/reactor';
import { formulary } from '../src/core/physics/formulary';

describe('Bosch–Hale reactivities', () => {
  // Table VIII of Bosch & Hale (1992), ⟨σv⟩ in cm³/s
  const table: [number, number][] = [[1, 6.857e-21], [10, 1.136e-16], [20, 4.330e-16], [50, 8.649e-16]];
  for (const [T, sv] of table)
    it(`DT @ ${T} keV = ${sv} cm³/s (±0.5 %)`, () => expect((reactivity(T, 'DT') * 1e6) / sv).toBeCloseTo(1, 2));
  it('D-D branches are nearly equal at 10 keV; D-³He beats D-D at 100 keV', () => {
    const r = reactivity(10, 'DDn') / reactivity(10, 'DDp');
    expect(r).toBeGreaterThan(0.9); expect(r).toBeLessThan(1.1);
    expect(reactivity(100, 'DHe3')).toBeGreaterThan(reactivity(100, 'DDn') + reactivity(100, 'DDp'));
  });
  it('DT peaks near 64 keV', () => {
    let best = 0, Tb = 0;
    for (let T = 10; T < 150; T += 0.5) { const s = reactivity(T); if (s > best) { best = s; Tb = T; } }
    expect(Tb).toBeGreaterThan(60); expect(Tb).toBeLessThan(70);
  });
});

describe('stellarator scalings', () => {
  it('ISS04 for W7-X-like parameters gives ~0.1–0.3 s', () => {
    const t = iss04(0.53, 5.5, 5, 7, 2.5, 0.9);
    expect(t).toBeGreaterThan(0.1); expect(t).toBeLessThan(0.4);
  });
  it('Sudo limit for W7-X ~1e20 m⁻³ at 5 MW', () => {
    const n = sudoLimit(5, 2.5, 0.53, 5.5);
    expect(n).toBeGreaterThan(0.5); expect(n).toBeLessThan(1.0);
  });
  it('Lawson ignition minimum ~3e21 keV s m⁻³ near 14 keV', () => {
    let best = Infinity, Tb = 0;
    for (let T = 4; T < 40; T += 0.25) { const v = lawsonIgnition(T); if (v < best) { best = v; Tb = T; } }
    expect(best).toBeGreaterThan(2.5e21); expect(best).toBeLessThan(3.6e21);
    expect(Tb).toBeGreaterThan(11); expect(Tb).toBeLessThan(17);
  });
});

describe('0-D power balance', () => {
  it('Stellaris-like point produces GW-class fusion power at a few % beta', () => {
    const pb = powerBalance({ R: 12.7, a: 1.3, B: 9, iota23: 0.95, nAvg: 2.5, TAvg: 7, alphaN: 0.5, alphaT: 1, Zeff: 1.5, dilution: 0.85, fRen: 1.5 });
    expect(pb.Pfus).toBeGreaterThan(500);
    expect(pb.Pfus).toBeLessThan(5000);
    expect(pb.beta).toBeGreaterThan(0.01); expect(pb.beta).toBeLessThan(0.06);
    expect(pb.volume).toBeCloseTo(2 * Math.PI ** 2 * 12.7 * 1.69, 6);
    // either driven at H = 1 or ignited with confinement to spare (H < 1)
    expect(pb.H).toBeLessThanOrEqual(1 + 1e-6);
    if (!pb.ignited) expect(pb.H).toBeCloseTo(1, 4);
  });
  it('popcon fills a grid', () => {
    const g = popcon({ R: 12.7, a: 1.3, B: 9, iota23: 0.95, alphaN: 0.5, alphaT: 1, Zeff: 1.5, dilution: 0.85, fRen: 1.5 }, [0.5, 4], [2, 20], 8, 8);
    expect(g.Pfus.length).toBe(64);
    expect(g.Pfus[63]).toBeGreaterThan(g.Pfus[0]);
  });
});

describe('formulary', () => {
  it('electron cyclotron frequency at 2.5 T ≈ 70 GHz (W7-X 140 GHz = 2nd harmonic)', () => {
    const f = formulary({ ne: 1e20, Te: 5000, Ti: 5000, B: 2.5, A: 1, Zi: 1, R: 5.5, iota: 0.9, epsEff: 0.01, eps: 0.05 });
    expect(f.fce.value / 1e9).toBeCloseTo(70, 0);
    expect(f.debye.value).toBeGreaterThan(1e-5); expect(f.debye.value).toBeLessThan(1e-4);
  });
});
