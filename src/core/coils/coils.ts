/**
 * Filamentary coils: Fourier curve representation (simsopt CurveXYZFourier
 * file format), symmetry expansion, discretisation and engineering metrics.
 */
import type { FourierSurface } from '../geometry/surface';
import { surfaceRZ } from '../geometry/surface';

/** x(t) = xc[0] + Σ_{k≥1} xs[k] sin(2πkt) + xc[k] cos(2πkt), t ∈ [0,1). */
export interface FourierCurve {
  xs: number[];
  xc: number[];
  ys: number[];
  yc: number[];
  zs: number[];
  zc: number[];
}

export interface CoilSetDefinition {
  nfp: number;
  stellsym: boolean;
  curves: FourierCurve[];
  currents: number[];
  labels?: string[];
}

export interface Coil {
  /** closed polyline, xyz interleaved, last point != first point (closure implicit) */
  points: Float64Array;
  current: number;
  baseIndex: number;
  label: string;
  flipped: boolean;
  period: number;
}

export function evalCurve(c: FourierCurve, t: number): [number, number, number] {
  let x = c.xc[0];
  let y = c.yc[0];
  let z = c.zc[0];
  const order = c.xc.length;
  for (let k = 1; k < order; k++) {
    const a = 2 * Math.PI * k * t;
    const s = Math.sin(a);
    const co = Math.cos(a);
    x += c.xs[k] * s + c.xc[k] * co;
    y += c.ys[k] * s + c.yc[k] * co;
    z += c.zs[k] * s + c.zc[k] * co;
  }
  return [x, y, z];
}

export function discretizeCurve(c: FourierCurve, n: number): Float64Array {
  const out = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = evalCurve(c, i / n);
    out[3 * i] = x;
    out[3 * i + 1] = y;
    out[3 * i + 2] = z;
  }
  return out;
}

/** Parse simsopt's comma separated CurveXYZFourier format (6 columns per coil). */
export function parseSimsoptCurves(text: string): FourierCurve[] {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length)
    .map((l) => l.split(/[,\s]+/).filter(Boolean).map(Number));
  if (!rows.length || rows[0].length % 6 !== 0) throw new Error('Expected 6 columns per coil (xs,xc,ys,yc,zs,zc)');
  const n = rows[0].length / 6;
  const curves: FourierCurve[] = [];
  for (let c = 0; c < n; c++) {
    const col = (k: number) => rows.map((r) => r[6 * c + k]);
    curves.push({ xs: col(0), xc: col(1), ys: col(2), yc: col(3), zs: col(4), zc: col(5) });
  }
  return curves;
}

/**
 * Apply field-period and stellarator symmetry (as simsopt.coils_via_symmetries):
 * every base coil is rotated by 2πk/nfp, and with stellarator symmetry also
 * reflected by (x,y,z) → (x,−y,−z), which reverses its orientation and hence
 * flips the sign of the current.
 */
export function expandCoils(def: CoilSetDefinition, segments = 96): Coil[] {
  const coils: Coil[] = [];
  const base = def.curves.map((c) => discretizeCurve(c, segments));
  const flips = def.stellsym ? [false, true] : [false];
  for (let k = 0; k < def.nfp; k++) {
    const a = (2 * Math.PI * k) / def.nfp;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const flip of flips) {
      base.forEach((pts, i) => {
        const out = new Float64Array(pts.length);
        for (let p = 0; p < pts.length; p += 3) {
          const x = pts[p];
          const y = pts[p + 1];
          const z = pts[p + 2];
          const xr = ca * x - sa * y;
          let yr = sa * x + ca * y;
          let zr = z;
          if (flip) {
            yr = -yr;
            zr = -zr;
          }
          out[p] = xr;
          out[p + 1] = yr;
          out[p + 2] = zr;
        }
        coils.push({
          points: out,
          current: flip ? -def.currents[i] : def.currents[i],
          baseIndex: i,
          label: `${def.labels?.[i] ?? `C${i + 1}`} · p${k + 1}${flip ? '′' : ''}`,
          flipped: flip,
          period: k,
        });
      });
    }
  }
  return coils;
}

export function polylineLength(p: Float64Array): number {
  const n = p.length / 3;
  let L = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    L += Math.hypot(p[3 * j] - p[3 * i], p[3 * j + 1] - p[3 * i + 1], p[3 * j + 2] - p[3 * i + 2]);
  }
  return L;
}

/** Analytic curve length and curvature statistics using the Fourier derivatives. */
export function curveGeometry(c: FourierCurve, n = 512): { length: number; maxCurvature: number; meanSquaredCurvature: number } {
  const order = c.xc.length;
  let L = 0;
  let kmax = 0;
  let msc = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const d1 = [0, 0, 0];
    const d2 = [0, 0, 0];
    for (let k = 1; k < order; k++) {
      const w = 2 * Math.PI * k;
      const s = Math.sin(w * t);
      const co = Math.cos(w * t);
      const coeffs = [
        [c.xs[k], c.xc[k]],
        [c.ys[k], c.yc[k]],
        [c.zs[k], c.zc[k]],
      ];
      for (let q = 0; q < 3; q++) {
        const [as, ac] = coeffs[q];
        d1[q] += w * (as * co - ac * s);
        d2[q] += -w * w * (as * s + ac * co);
      }
    }
    const sp = Math.hypot(d1[0], d1[1], d1[2]);
    const cr = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
    const kappa = Math.hypot(cr[0], cr[1], cr[2]) / sp ** 3;
    L += sp / n;
    kmax = Math.max(kmax, kappa);
    msc += (kappa * kappa * sp) / n;
  }
  return { length: L, maxCurvature: kmax, meanSquaredCurvature: msc / L };
}

/** Minimum distance between distinct coils (sampled). */
export function minCoilCoilDistance(coils: Coil[]): { distance: number; pair: [number, number] } {
  let best = Infinity;
  let pair: [number, number] = [0, 0];
  for (let a = 0; a < coils.length; a++)
    for (let b = a + 1; b < coils.length; b++) {
      const A = coils[a].points;
      const B = coils[b].points;
      for (let i = 0; i < A.length; i += 3)
        for (let j = 0; j < B.length; j += 3) {
          const d = (A[i] - B[j]) ** 2 + (A[i + 1] - B[j + 1]) ** 2 + (A[i + 2] - B[j + 2]) ** 2;
          if (d < best) {
            best = d;
            pair = [a, b];
          }
        }
    }
  return { distance: Math.sqrt(best), pair };
}

/** Minimum distance between any coil and the plasma boundary (sampled surface). */
export function minCoilSurfaceDistance(coils: Coil[], s: FourierSurface, ntheta = 48, nphi = 96): number {
  const pts: number[] = [];
  for (let j = 0; j < nphi; j++) {
    const phi = (2 * Math.PI * j) / nphi;
    for (let i = 0; i < ntheta; i++) {
      const [R, Z] = surfaceRZ(s, (2 * Math.PI * i) / ntheta, phi);
      pts.push(R * Math.cos(phi), R * Math.sin(phi), Z);
    }
  }
  let best = Infinity;
  for (const c of coils) {
    const P = c.points;
    for (let i = 0; i < P.length; i += 3)
      for (let j = 0; j < pts.length; j += 3) {
        const d = (P[i] - pts[j]) ** 2 + (P[i + 1] - pts[j + 1]) ** 2 + (P[i + 2] - pts[j + 2]) ** 2;
        if (d < best) best = d;
      }
  }
  return Math.sqrt(best);
}

/** Write coils in the MAKEGRID "coils." format understood by VMEC/FOCUS/simsopt. */
export function toMakegridCoils(coils: Coil[], nfp: number): string {
  const lines = [`periods ${nfp}`, 'begin filament', 'mirror NIL'];
  coils.forEach((c, idx) => {
    const P = c.points;
    const n = P.length / 3;
    for (let i = 0; i < n; i++) lines.push(`${P[3 * i].toExponential(12)} ${P[3 * i + 1].toExponential(12)} ${P[3 * i + 2].toExponential(12)} ${c.current.toExponential(12)}`);
    lines.push(`${P[0].toExponential(12)} ${P[1].toExponential(12)} ${P[2].toExponential(12)} ${(0).toExponential(12)} ${c.baseIndex + 1} ${c.label.replace(/\s+/g, '_')}_${idx}`);
  });
  lines.push('end');
  return lines.join('\n') + '\n';
}
