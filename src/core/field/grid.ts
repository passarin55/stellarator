/**
 * Field-period-periodic cylindrical grid of (B_R, B_φ, B_Z) — the browser
 * analogue of a VMEC/MAKEGRID "mgrid" file — with tricubic Lagrange
 * interpolation. Building the grid once and interpolating is ~10^4× cheaper
 * than direct Biot–Savart evaluation inside a field-line integrator.
 */
import { biotSavartCyl, type PackedCoils } from './biotSavart';

export interface GridSpec {
  nfp: number;
  Rmin: number;
  Rmax: number;
  Zmin: number;
  Zmax: number;
  nR: number;
  nZ: number;
  /** points per field period (periodic, endpoint excluded) */
  nPhi: number;
}

export interface FieldGrid {
  spec: GridSpec;
  /** layout: ((iphi * nZ + iz) * nR + ir) * 3 + component */
  data: Float64Array;
}

export const gridIndex = (s: GridSpec, ip: number, iz: number, ir: number) => ((ip * s.nZ + iz) * s.nR + ir) * 3;

/** Compute grid planes [p0, p1) — used to split work across Web Workers. */
export function computeGridPlanes(pc: PackedCoils, spec: GridSpec, p0: number, p1: number, onProgress?: (f: number) => void): Float64Array {
  const { nR, nZ, nPhi, nfp, Rmin, Rmax, Zmin, Zmax } = spec;
  const out = new Float64Array((p1 - p0) * nZ * nR * 3);
  const dR = (Rmax - Rmin) / (nR - 1);
  const dZ = (Zmax - Zmin) / (nZ - 1);
  const P = (2 * Math.PI) / nfp;
  let k = 0;
  for (let ip = p0; ip < p1; ip++) {
    const phi = (ip * P) / nPhi;
    for (let iz = 0; iz < nZ; iz++) {
      const Z = Zmin + iz * dZ;
      for (let ir = 0; ir < nR; ir++) {
        const [bR, bP, bZ] = biotSavartCyl(pc, Rmin + ir * dR, phi, Z);
        out[k++] = bR;
        out[k++] = bP;
        out[k++] = bZ;
      }
    }
    onProgress?.((ip - p0 + 1) / (p1 - p0));
  }
  return out;
}

export function buildFieldGrid(pc: PackedCoils, spec: GridSpec): FieldGrid {
  return { spec, data: computeGridPlanes(pc, spec, 0, spec.nPhi) };
}

/** Cubic Lagrange weights for 4 nodes at offsets −1,0,1,2 and fractional position t ∈ [0,1). */
function lagrange4(t: number, w: Float64Array): void {
  const tm1 = t - 1;
  const tm2 = t - 2;
  const tp1 = t + 1;
  w[0] = (-t * tm1 * tm2) / 6;
  w[1] = (tp1 * tm1 * tm2) / 2;
  w[2] = (-tp1 * t * tm2) / 2;
  w[3] = (tp1 * t * tm1) / 6;
}

export type FieldEvaluator = (R: number, phi: number, Z: number, out: Float64Array) => boolean;

/** Create an interpolating evaluator. Returns false outside the grid. */
export function gridEvaluator(g: FieldGrid): FieldEvaluator {
  const { spec, data } = g;
  const { nR, nZ, nPhi, nfp, Rmin, Rmax, Zmin, Zmax } = spec;
  const dR = (Rmax - Rmin) / (nR - 1);
  const dZ = (Zmax - Zmin) / (nZ - 1);
  const P = (2 * Math.PI) / nfp;
  const wr = new Float64Array(4);
  const wz = new Float64Array(4);
  const wp = new Float64Array(4);
  const ips = new Int32Array(4);
  return (R, phi, Z, out) => {
    if (R < Rmin || R > Rmax || Z < Zmin || Z > Zmax) return false;
    const xr = (R - Rmin) / dR;
    const xz = (Z - Zmin) / dZ;
    let ir = Math.floor(xr);
    let iz = Math.floor(xz);
    // keep the 4-point stencil inside the grid
    ir = Math.min(Math.max(ir, 1), nR - 3);
    iz = Math.min(Math.max(iz, 1), nZ - 3);
    lagrange4(xr - ir, wr);
    lagrange4(xz - iz, wz);
    let fp = ((phi % P) + P) % P;
    fp = (fp / P) * nPhi;
    const ip = Math.floor(fp);
    lagrange4(fp - ip, wp);
    for (let a = 0; a < 4; a++) ips[a] = (((ip - 1 + a) % nPhi) + nPhi) % nPhi;
    let bR = 0;
    let bP = 0;
    let bZ = 0;
    for (let a = 0; a < 4; a++) {
      const wa = wp[a];
      const pBase = ips[a] * nZ;
      for (let b = 0; b < 4; b++) {
        const wab = wa * wz[b];
        const rowBase = ((pBase + iz - 1 + b) * nR + ir - 1) * 3;
        for (let c = 0; c < 4; c++) {
          const w = wab * wr[c];
          const o = rowBase + 3 * c;
          bR += w * data[o];
          bP += w * data[o + 1];
          bZ += w * data[o + 2];
        }
      }
    }
    out[0] = bR;
    out[1] = bP;
    out[2] = bZ;
    return true;
  };
}

/** Direct (exact, slow) evaluator — used for validation and for small coil sets. */
export function directEvaluator(pc: PackedCoils): FieldEvaluator {
  return (R, phi, Z, out) => {
    const [a, b, c] = biotSavartCyl(pc, R, phi, Z);
    out[0] = a;
    out[1] = b;
    out[2] = c;
    return true;
  };
}
