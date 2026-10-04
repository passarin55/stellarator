/**
 * Biot–Savart law for closed polygonal filaments.
 *
 * Each straight segment a→b carrying current I contributes exactly
 * (Hanson & Hirshman, Phys. Plasmas 9, 4410 (2002)):
 *
 *   B = μ0 I / 4π · (|Ri| + |Rf|) / (|Ri||Rf| (|Ri||Rf| + Ri·Rf)) · (Ri × Rf)
 *
 * with Ri = x − a, Rf = x − b. The formula is exact for the polyline and
 * numerically robust (no catastrophic cancellation away from the wire).
 */
import type { Coil } from '../coils/coils';

export const MU0 = 4e-7 * Math.PI;

/** Packed, cache-friendly representation of all segments of a coil set. */
export interface PackedCoils {
  /** start points, xyz interleaved */
  a: Float64Array;
  /** end points */
  b: Float64Array;
  /** μ0 I / 4π per segment */
  k: Float64Array;
  nseg: number;
}

export function packCoils(coils: Pick<Coil, 'points' | 'current'>[]): PackedCoils {
  let nseg = 0;
  for (const c of coils) if (c.current !== 0) nseg += c.points.length / 3;
  const a = new Float64Array(3 * nseg);
  const b = new Float64Array(3 * nseg);
  const k = new Float64Array(nseg);
  let s = 0;
  for (const c of coils) {
    if (c.current === 0) continue;
    const P = c.points;
    const n = P.length / 3;
    const kk = (MU0 * c.current) / (4 * Math.PI);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a[3 * s] = P[3 * i];
      a[3 * s + 1] = P[3 * i + 1];
      a[3 * s + 2] = P[3 * i + 2];
      b[3 * s] = P[3 * j];
      b[3 * s + 1] = P[3 * j + 1];
      b[3 * s + 2] = P[3 * j + 2];
      k[s] = kk;
      s++;
    }
  }
  return { a, b, k, nseg };
}

/** Field at a single Cartesian point; writes into out[off..off+2]. */
export function biotSavartPoint(pc: PackedCoils, x: number, y: number, z: number, out: Float64Array | number[], off = 0): void {
  const { a, b, k, nseg } = pc;
  let Bx = 0;
  let By = 0;
  let Bz = 0;
  for (let s = 0; s < nseg; s++) {
    const i3 = 3 * s;
    const rix = x - a[i3];
    const riy = y - a[i3 + 1];
    const riz = z - a[i3 + 2];
    const rfx = x - b[i3];
    const rfy = y - b[i3 + 1];
    const rfz = z - b[i3 + 2];
    const ri = Math.sqrt(rix * rix + riy * riy + riz * riz);
    const rf = Math.sqrt(rfx * rfx + rfy * rfy + rfz * rfz);
    const rr = ri * rf;
    const den = rr * (rr + rix * rfx + riy * rfy + riz * rfz);
    if (den < 1e-30) continue; // on the wire
    const f = (k[s] * (ri + rf)) / den;
    Bx += f * (riy * rfz - riz * rfy);
    By += f * (riz * rfx - rix * rfz);
    Bz += f * (rix * rfy - riy * rfx);
  }
  out[off] = Bx;
  out[off + 1] = By;
  out[off + 2] = Bz;
}

/** Field at many points (xyz interleaved). */
export function biotSavart(pc: PackedCoils, points: Float64Array): Float64Array {
  const out = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 3) biotSavartPoint(pc, points[i], points[i + 1], points[i + 2], out, i);
  return out;
}

/** Cylindrical components (B_R, B_φ, B_Z) at (R, φ, Z). */
export function biotSavartCyl(pc: PackedCoils, R: number, phi: number, Z: number): [number, number, number] {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const o = [0, 0, 0];
  biotSavartPoint(pc, R * c, R * s, Z, o);
  return [o[0] * c + o[1] * s, -o[0] * s + o[1] * c, o[2]];
}

/**
 * Lorentz force per unit length on each segment midpoint of coil `idx` due to
 * the field of all *other* coils (self-force needs a finite-build model and is
 * omitted). Returns max |dF/dl| [N/m] and the net force vector [N].
 */
export function coilForces(coils: Coil[], idx: number): { maxForcePerLength: number; netForce: [number, number, number] } {
  const others = packCoils(coils.filter((_, i) => i !== idx));
  const c = coils[idx];
  const P = c.points;
  const n = P.length / 3;
  let maxF = 0;
  const net: [number, number, number] = [0, 0, 0];
  const B = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = P[3 * j] - P[3 * i];
    const dy = P[3 * j + 1] - P[3 * i + 1];
    const dz = P[3 * j + 2] - P[3 * i + 2];
    const mx = 0.5 * (P[3 * j] + P[3 * i]);
    const my = 0.5 * (P[3 * j + 1] + P[3 * i + 1]);
    const mz = 0.5 * (P[3 * j + 2] + P[3 * i + 2]);
    biotSavartPoint(others, mx, my, mz, B);
    const fx = c.current * (dy * B[2] - dz * B[1]);
    const fy = c.current * (dz * B[0] - dx * B[2]);
    const fz = c.current * (dx * B[1] - dy * B[0]);
    const dl = Math.hypot(dx, dy, dz);
    maxF = Math.max(maxF, Math.hypot(fx, fy, fz) / dl);
    net[0] += fx;
    net[1] += fy;
    net[2] += fz;
  }
  return { maxForcePerLength: maxF, netForce: net };
}

/**
 * Mutual inductance between two closed polylines by the Neumann formula,
 * M = μ0/4π ∮∮ dl·dl' / sqrt(|r−r'|² + δ). With δ = a²/√e and the same curve
 * on both sides this yields the regularised self-inductance of a filament of
 * circular cross-section radius a (Hurwitz, Landreman & Antonsen 2024).
 */
export function neumannInductance(p: Float64Array, q: Float64Array, delta = 0): number {
  const n = p.length / 3;
  const m = q.length / 3;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    const dlx = p[3 * i1] - p[3 * i];
    const dly = p[3 * i1 + 1] - p[3 * i + 1];
    const dlz = p[3 * i1 + 2] - p[3 * i + 2];
    const cx = 0.5 * (p[3 * i1] + p[3 * i]);
    const cy = 0.5 * (p[3 * i1 + 1] + p[3 * i + 1]);
    const cz = 0.5 * (p[3 * i1 + 2] + p[3 * i + 2]);
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m;
      const ex = q[3 * j1] - q[3 * j];
      const ey = q[3 * j1 + 1] - q[3 * j + 1];
      const ez = q[3 * j1 + 2] - q[3 * j + 2];
      const dx = cx - 0.5 * (q[3 * j1] + q[3 * j]);
      const dy = cy - 0.5 * (q[3 * j1 + 1] + q[3 * j + 1]);
      const dz = cz - 0.5 * (q[3 * j1 + 2] + q[3 * j + 2]);
      sum += (dlx * ex + dly * ey + dlz * ez) / Math.sqrt(dx * dx + dy * dy + dz * dz + delta);
    }
  }
  return 1e-7 * sum;
}

/**
 * Total magnetic energy W = ½ Σ_ij I_i I_j M_ij of a symmetric coil set.
 * Uses the symmetry of the set: every coil is an isometric image of a base
 * coil, so only rows belonging to base coils (period 0, unflipped) are summed.
 */
export function storedEnergy(coils: Coil[], conductorRadius: number): { energy: number; selfInductance: number[] } {
  const delta = (conductorRadius * conductorRadius) / Math.sqrt(Math.E);
  const baseRows = coils.map((c, i) => [c, i] as const).filter(([c]) => c.period === 0 && !c.flipped);
  const images = coils.length / baseRows.length;
  let W = 0;
  const selfL: number[] = [];
  for (const [c, i] of baseRows) {
    let row = 0;
    coils.forEach((d, j) => {
      if (c.current === 0 || d.current === 0) return;
      const M = neumannInductance(c.points, d.points, i === j ? delta : 0);
      if (i === j) selfL.push(M);
      row += c.current * d.current * M;
    });
    if (c.current === 0) selfL.push(neumannInductance(c.points, c.points, delta));
    W += 0.5 * images * row;
  }
  return { energy: W, selfInductance: selfL };
}
