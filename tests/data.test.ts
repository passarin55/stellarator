import { describe, it, expect } from 'vitest';
import { BOUNDARIES, COILSETS, NEAR_AXIS_PRESETS } from '../src/data/library';
import { DEVICES } from '../src/data/devices';
import { TIMELINE, GLOSSARY } from '../src/data/history';
import { REFERENCES } from '../src/data/references';
import { ARTICLES } from '../src/data/learn';
import { solveQsc } from '../src/core/nearAxis/qsc';
import { surfaceMetrics } from '../src/core/geometry/surface';
import { scaledCurrents } from '../src/ui/state/coils';
import ref from './fixtures/qsc_ref.json';

describe('bundled library integrity', () => {
  it('every boundary is a valid torus with positive volume', () => {
    for (const b of BOUNDARIES) {
      const m = surfaceMetrics(b.surface, 32, 16);
      expect(m.volume, b.id).toBeGreaterThan(0);
      expect(m.aspectRatio, b.id).toBeGreaterThan(1.5);
    }
  });

  it('near-axis presets reproduce the pyQSC rotational transform', () => {
    const map: Record<string, string> = { 'r1-5.1': 'r1 section 5.1', 'r1-5.2': 'r1 section 5.2', 'r1-5.3': 'r1 section 5.3', 'precise-qa': 'precise QA', 'precise-qh': 'precise QH', '2022-qa': '2022 QA', '2022-qh2': '2022 QH nfp2' };
    for (const p of NEAR_AXIS_PRESETS) {
      const s = solveQsc(p.input);
      expect(s.iota, p.id).toBeCloseTo((ref as Record<string, { iota: number }>)[map[p.id]].iota, 8);
    }
  });

  it('coil sets reference existing boundaries and have one label/current per curve', () => {
    for (const c of COILSETS) {
      expect(c.curves.length).toBe(c.currents.length);
      expect(c.labels?.length ?? c.curves.length).toBe(c.curves.length);
      if (c.boundaryId) expect(BOUNDARIES.some((b) => b.id === c.boundaryId)).toBe(true);
      for (const p of c.presets) expect(p.scale.length).toBe(c.curves.length);
    }
  });

  it('zero-current coils (W7-X planar) scale relative to the main coils', () => {
    expect(scaledCurrents([1.62e6, 0], [1, -0.25])).toEqual([1.62e6, -0.405e6]);
  });

  it('every device lists at least one https source and sane parameters', () => {
    const ids = new Set<string>();
    for (const d of DEVICES) {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      expect(d.sources.length, d.id).toBeGreaterThan(0);
      for (const s of d.sources) expect(s.url.startsWith('https://'), d.id).toBe(true);
      if (d.R && d.a) expect(d.R / d.a, d.id).toBeGreaterThan(2);
    }
  });

  it('content collections are populated', () => {
    expect(TIMELINE.length).toBeGreaterThan(15);
    expect(GLOSSARY.length).toBeGreaterThan(15);
    expect(REFERENCES.every((r) => r.url.startsWith('https://'))).toBe(true);
    expect(ARTICLES.length).toBe(7);
    // balanced $ delimiters in every article paragraph
    for (const a of ARTICLES) for (const s of a.sections) for (const p of s.body) expect(((p.match(/\$/g) ?? []).length) % 2, `${a.id}/${s.h}`).toBe(0);
  });
});
