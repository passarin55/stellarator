/**
 * Magnetic field-line tracing in cylindrical coordinates using φ as the
 * independent variable:
 *
 *   dR/dφ = R B_R / B_φ,   dZ/dφ = R B_Z / B_φ
 *
 * integrated with classical RK4. Provides Poincaré sections, magnetic-axis
 * location (Newton iteration on the one-period map, with Greene's residue),
 * rotational-transform profiles and connection lengths.
 */
import type { FieldEvaluator } from './grid';

export interface TraceOptions {
  nfp: number;
  /** starting toroidal angle (also the primary Poincaré plane) */
  phi0: number;
  /** number of full toroidal transits */
  transits: number;
  /** RK4 steps per field period */
  stepsPerPeriod: number;
  /** Poincaré plane offsets within a period, as fractions of the period (e.g. [0, 0.5]) */
  sectionFractions?: number[];
  /** magnetic axis at phi0 (enables iota measurement) */
  axis?: { R: number; Z: number };
}

export interface TracedLine {
  start: { R: number; Z: number };
  /** per section: interleaved R,Z pairs of puncture points */
  sections: Float64Array[];
  iota: number;
  lost: boolean;
  /** field-line length travelled before being lost (or total length) [m] */
  length: number;
  transitsCompleted: number;
}

const tmp = new Float64Array(3);

/** RHS of the field-line ODE. Returns false if the evaluator leaves its domain. */
function rhs(f: FieldEvaluator, R: number, phi: number, Z: number, d: Float64Array): boolean {
  if (!f(R, phi, Z, tmp)) return false;
  const bp = tmp[1];
  if (Math.abs(bp) < 1e-14) return false;
  d[0] = (R * tmp[0]) / bp;
  d[1] = (R * tmp[2]) / bp;
  // dl/dφ = R |B| / |B_φ|
  d[2] = (R * Math.hypot(tmp[0], tmp[1], tmp[2])) / Math.abs(bp);
  return true;
}

const k1 = new Float64Array(3),
  k2 = new Float64Array(3),
  k3 = new Float64Array(3),
  k4 = new Float64Array(3);

/** One RK4 step; state = [R, Z, length]. */
export function rk4Step(f: FieldEvaluator, s: Float64Array, phi: number, h: number): boolean {
  const R = s[0];
  const Z = s[1];
  if (!rhs(f, R, phi, Z, k1)) return false;
  if (!rhs(f, R + 0.5 * h * k1[0], phi + 0.5 * h, Z + 0.5 * h * k1[1], k2)) return false;
  if (!rhs(f, R + 0.5 * h * k2[0], phi + 0.5 * h, Z + 0.5 * h * k2[1], k3)) return false;
  if (!rhs(f, R + h * k3[0], phi + h, Z + h * k3[1], k4)) return false;
  s[0] = R + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  s[1] = Z + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  s[2] += Math.abs((h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]));
  return true;
}

/** Map a point once around one field period. Returns null if lost. */
export function periodMap(f: FieldEvaluator, R: number, Z: number, phi0: number, nfp: number, steps: number): [number, number] | null {
  const s = new Float64Array([R, Z, 0]);
  const h = (2 * Math.PI) / nfp / steps;
  for (let i = 0; i < steps; i++) if (!rk4Step(f, s, phi0 + i * h, h)) return null;
  return [s[0], s[1]];
}

export interface AxisResult {
  R: number;
  Z: number;
  converged: boolean;
  iterations: number;
  /** Greene's residue (2 − tr M)/4 of the one-period map: 0 < Res < 1 ⇒ elliptic (stable) axis */
  residue: number;
  /** on-axis rotational transform per toroidal transit, from the eigenvalues of M (mod nfp/2) */
  iotaAxis: number;
  monodromy: [number, number, number, number];
}

/** Locate the magnetic axis as the fixed point of the one-period map. */
export function findMagneticAxis(
  f: FieldEvaluator,
  guess: { R: number; Z: number },
  phi0: number,
  nfp: number,
  steps = 60,
  tol = 1e-10,
): AxisResult {
  let R = guess.R;
  let Z = guess.Z;
  const h = 1e-5 * Math.max(1, Math.abs(R));
  let it = 0;
  let M: [number, number, number, number] = [1, 0, 0, 1];
  let converged = false;
  for (; it < 40; it++) {
    const p = periodMap(f, R, Z, phi0, nfp, steps);
    if (!p) break;
    const FR = p[0] - R;
    const FZ = p[1] - Z;
    const pR = periodMap(f, R + h, Z, phi0, nfp, steps);
    const pRm = periodMap(f, R - h, Z, phi0, nfp, steps);
    const pZ = periodMap(f, R, Z + h, phi0, nfp, steps);
    const pZm = periodMap(f, R, Z - h, phi0, nfp, steps);
    if (!pR || !pZ || !pRm || !pZm) break;
    M = [(pR[0] - pRm[0]) / (2 * h), (pZ[0] - pZm[0]) / (2 * h), (pR[1] - pRm[1]) / (2 * h), (pZ[1] - pZm[1]) / (2 * h)];
    if (Math.hypot(FR, FZ) < tol) {
      converged = true;
      break;
    }
    // J = M − I
    const a = M[0] - 1,
      b = M[1],
      c = M[2],
      d = M[3] - 1;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-300) break;
    let dR = (d * FR - b * FZ) / det;
    let dZ = (-c * FR + a * FZ) / det;
    const step = Math.hypot(dR, dZ);
    const lim = 0.05 * Math.abs(R);
    if (step > lim) {
      dR *= lim / step;
      dZ *= lim / step;
    }
    R -= dR;
    Z -= dZ;
  }
  const tr = M[0] + M[3];
  const residue = (2 - tr) / 4;
  const cosA = Math.max(-1, Math.min(1, tr / 2));
  const iotaAxis = (nfp * Math.acos(cosA)) / (2 * Math.PI);
  return { R, Z, converged, iterations: it, residue, iotaAxis, monodromy: M };
}

/**
 * Trace a set of field lines simultaneously with the axis (when given) so
 * that the poloidal angle around the axis can be unwrapped continuously,
 * yielding ι = Δθ / Δφ for each line.
 */
export function traceFieldLines(
  f: FieldEvaluator,
  starts: { R: number; Z: number }[],
  opts: TraceOptions,
  onProgress?: (fraction: number) => void,
): TracedLine[] {
  const { nfp, phi0, transits, stepsPerPeriod, axis } = opts;
  const fractions = opts.sectionFractions ?? [0];
  const P = (2 * Math.PI) / nfp;
  const h = P / stepsPerPeriod;
  const totalPeriods = Math.round(transits * nfp);
  const sectionSteps = fractions.map((fr) => Math.round(fr * stepsPerPeriod) % stepsPerPeriod);

  const nl = starts.length;
  const states = starts.map((s) => new Float64Array([s.R, s.Z, 0]));
  const alive = starts.map(() => true);
  const sections: number[][][] = starts.map(() => fractions.map(() => []));
  const theta = new Float64Array(nl);
  const thetaPrev = new Float64Array(nl);
  const ax = axis ? new Float64Array([axis.R, axis.Z, 0]) : null;
  let axisAlive = !!ax;
  if (ax) {
    for (let l = 0; l < nl; l++) thetaPrev[l] = Math.atan2(states[l][1] - ax[1], states[l][0] - ax[0]);
  }
  const done = new Float64Array(nl);
  const phiDone = new Float64Array(nl);

  for (let p = 0; p < totalPeriods; p++) {
    for (let st = 0; st < stepsPerPeriod; st++) {
      const phi = phi0 + (p * stepsPerPeriod + st) * h;
      const sIdx = sectionSteps.indexOf(st);
      if (sIdx >= 0) {
        for (let l = 0; l < nl; l++) if (alive[l]) sections[l][sIdx].push(states[l][0], states[l][1]);
      }
      if (axisAlive && ax) axisAlive = rk4Step(f, ax, phi, h);
      for (let l = 0; l < nl; l++) {
        if (!alive[l]) continue;
        if (!rk4Step(f, states[l], phi, h)) {
          alive[l] = false;
          continue;
        }
        phiDone[l] += h;
        if (axisAlive && ax) {
          const th = Math.atan2(states[l][1] - ax[1], states[l][0] - ax[0]);
          let d = th - thetaPrev[l];
          if (d > Math.PI) d -= 2 * Math.PI;
          else if (d < -Math.PI) d += 2 * Math.PI;
          theta[l] += d;
          thetaPrev[l] = th;
        }
      }
    }
    for (let l = 0; l < nl; l++) if (alive[l]) done[l] = (p + 1) / nfp;
    onProgress?.((p + 1) / totalPeriods);
  }

  return starts.map((s, l) => ({
    start: s,
    sections: sections[l].map((a) => Float64Array.from(a)),
    iota: ax && phiDone[l] > 0 ? theta[l] / phiDone[l] : NaN,
    lost: !alive[l],
    length: states[l][2],
    transitsCompleted: done[l],
  }));
}

/** Low-order rationals n/m (m ≤ maxM) within [lo, hi] — for marking resonances on ι profiles. */
export function rationalsInRange(lo: number, hi: number, maxM = 8, nfp?: number): { n: number; m: number; value: number }[] {
  const out: { n: number; m: number; value: number }[] = [];
  const seen = new Set<string>();
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  for (let m = 1; m <= maxM; m++)
    for (let n = Math.ceil(a * m); n <= Math.floor(b * m); n++) {
      const g = gcd(Math.abs(n), m);
      const key = `${n / g}/${m / g}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // in an nfp-periodic device, resonances with n divisible by nfp are the "natural" (strong) ones
      if (nfp && n % nfp !== 0 && m > 4) continue;
      out.push({ n: n / g, m: m / g, value: n / m });
    }
  return out.sort((x, y) => x.value - y.value);
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
