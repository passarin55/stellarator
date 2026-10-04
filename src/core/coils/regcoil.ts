/**
 * REGCOIL-style coil synthesis (Landreman, Nucl. Fusion 57 (2017) 046003).
 *
 * A sheet current K = n̂ × ∇Φ lives on a winding surface enclosing the plasma.
 * The current potential is
 *
 *   Φ(θ,ζ) = Σ_k Φ_k sin(m_k θ − n_k nfp ζ) + G ζ/2π + I θ/2π
 *
 * (stellarator-symmetric single-valued part plus secular terms; G is the net
 * poloidal current that sets the toroidal field, I the net toroidal current,
 * I = 0 for modular coils). With N = r_θ × r_ζ, the surface current is
 *
 *   K = (Φ_θ r_ζ − Φ_ζ r_θ) / |N|
 *
 * and B·n on the plasma is linear in Φ_k. We minimise the Tikhonov functional
 *
 *   χ² = ∫_plasma (B·n)² dA  +  λ ∫_coil |K|² dA
 *
 * by solving the normal equations. Contours of the full potential then give
 * discrete modular coils, each carrying G / N_coils.
 */
import { evalSurface, type FourierSurface } from '../geometry/surface';
import { Matrix, choleskySolve } from '../math/linalg';
import type { Coil } from './coils';
import { MU0, packCoils, biotSavartPoint } from '../field/biotSavart';

export interface RegcoilInput {
  plasma: FourierSurface;
  winding: FourierSurface;
  /** net poloidal current [A] — sets B_φ ≈ μ0 G / (2πR) */
  G: number;
  /** net toroidal current on the winding surface [A] (0 → modular coils) */
  I?: number;
  mpol: number;
  ntor: number;
  lambda: number;
  /** plasma grid per field period */
  nthetaPlasma?: number;
  nzetaPlasma?: number;
  /** winding grid per field period */
  nthetaCoil?: number;
  nzetaCoil?: number;
}

export interface RegcoilResult {
  modes: { m: number; n: number }[];
  phi: Float64Array;
  chi2B: number;
  chi2K: number;
  maxBn: number;
  rmsBn: number;
  maxK: number;
  rmsK: number;
  /** plasma-surface B·n map (nthetaPlasma × nzetaPlasma, row = θ) */
  BnMap: Float64Array;
  /** |K| map on the winding surface (one period) */
  KMap: Float64Array;
  grids: { ntp: number; nzp: number; ntc: number; nzc: number };
  input: RegcoilInput;
}

interface SurfGrid {
  n: number;
  theta: Float64Array;
  zeta: Float64Array;
  x: Float64Array; // positions xyz
  rt: Float64Array; // ∂r/∂θ (Cartesian)
  rz: Float64Array; // ∂r/∂ζ
  N: Float64Array; // r_θ × r_ζ
  normN: Float64Array;
}

/** Sample a surface on θ ∈ [0,2π), ζ ∈ [z0, z0 + nz·Δζ) where Δζ = (2π/nfp)/nzPerPeriod. */
function sampleGrid(s: FourierSurface, nt: number, nzPerPeriod: number, periods: number): SurfGrid {
  const nz = nzPerPeriod * periods;
  const n = nt * nz;
  const g: SurfGrid = {
    n,
    theta: new Float64Array(n),
    zeta: new Float64Array(n),
    x: new Float64Array(3 * n),
    rt: new Float64Array(3 * n),
    rz: new Float64Array(3 * n),
    N: new Float64Array(3 * n),
    normN: new Float64Array(n),
  };
  const dz = (2 * Math.PI) / s.nfp / nzPerPeriod;
  let k = 0;
  for (let iz = 0; iz < nz; iz++) {
    const z = iz * dz;
    const c = Math.cos(z);
    const sn = Math.sin(z);
    for (let it = 0; it < nt; it++) {
      const t = (2 * Math.PI * it) / nt;
      const p = evalSurface(s, t, z);
      g.theta[k] = t;
      g.zeta[k] = z;
      g.x[3 * k] = p.R * c;
      g.x[3 * k + 1] = p.R * sn;
      g.x[3 * k + 2] = p.Z;
      const rt = [p.Rt * c, p.Rt * sn, p.Zt];
      const rz = [p.Rp * c - p.R * sn, p.Rp * sn + p.R * c, p.Zp];
      g.rt.set(rt, 3 * k);
      g.rz.set(rz, 3 * k);
      const N = [rt[1] * rz[2] - rt[2] * rz[1], rt[2] * rz[0] - rt[0] * rz[2], rt[0] * rz[1] - rt[1] * rz[0]];
      g.N.set(N, 3 * k);
      g.normN[k] = Math.hypot(N[0], N[1], N[2]);
      k++;
    }
  }
  return g;
}

export function regcoilModes(mpol: number, ntor: number): { m: number; n: number }[] {
  const modes: { m: number; n: number }[] = [];
  for (let m = 0; m <= mpol; m++)
    for (let n = -ntor; n <= ntor; n++) {
      if (m === 0 && n <= 0) continue;
      modes.push({ m, n });
    }
  return modes;
}

export function solveRegcoil(inp: RegcoilInput, onProgress?: (stage: string, f: number) => void): RegcoilResult {
  const nfp = inp.plasma.nfp;
  if (inp.winding.nfp !== nfp) throw new Error('plasma and winding surface must share nfp');
  const ntp = inp.nthetaPlasma ?? 32;
  const nzp = inp.nzetaPlasma ?? 32;
  const ntc = inp.nthetaCoil ?? 48;
  const nzc = inp.nzetaCoil ?? 48;
  const G = inp.G;
  const I = inp.I ?? 0;
  const modes = regcoilModes(inp.mpol, inp.ntor);
  const nb = modes.length;

  const pg = sampleGrid(inp.plasma, ntp, nzp, 1);
  const cg = sampleGrid(inp.winding, ntc, nzc, nfp); // full torus
  const npPer = ntc * nzc;
  const dA_c = ((2 * Math.PI) / ntc) * ((2 * Math.PI) / nfp / nzc); // dθ dζ
  const dA_p = ((2 * Math.PI) / ntp) * ((2 * Math.PI) / nfp / nzp);
  const pref = (MU0 / (4 * Math.PI)) * dA_c;

  // Unit normals on the plasma.
  const nhat = new Float64Array(3 * pg.n);
  for (let i = 0; i < pg.n; i++) for (let q = 0; q < 3; q++) nhat[3 * i + q] = pg.N[3 * i + q] / pg.normN[i];

  // a_ij = r_ζ'·W_ij, b_ij = r_θ'·W_ij with W = (r × n̂)/|r|³, folded over field periods.
  const a = new Float64Array(pg.n * npPer);
  const b = new Float64Array(pg.n * npPer);
  for (let i = 0; i < pg.n; i++) {
    const xi = pg.x[3 * i],
      yi = pg.x[3 * i + 1],
      zi = pg.x[3 * i + 2];
    const nx = nhat[3 * i],
      ny = nhat[3 * i + 1],
      nz = nhat[3 * i + 2];
    const row = i * npPer;
    for (let j = 0; j < cg.n; j++) {
      const rx = xi - cg.x[3 * j];
      const ry = yi - cg.x[3 * j + 1];
      const rz = zi - cg.x[3 * j + 2];
      const r2 = rx * rx + ry * ry + rz * rz;
      const inv = 1 / (r2 * Math.sqrt(r2));
      const wx = (ry * nz - rz * ny) * inv;
      const wy = (rz * nx - rx * nz) * inv;
      const wz = (rx * ny - ry * nx) * inv;
      const jj = row + (j % npPer);
      a[jj] += cg.rz[3 * j] * wx + cg.rz[3 * j + 1] * wy + cg.rz[3 * j + 2] * wz;
      b[jj] += cg.rt[3 * j] * wx + cg.rt[3 * j + 1] * wy + cg.rt[3 * j + 2] * wz;
    }
    if (i % 64 === 0) onProgress?.('inductance', i / pg.n);
  }

  // Basis values on one period of the winding grid: Φ_θ = m cos(·), Φ_ζ = −n·nfp cos(·)
  const cosB = new Float64Array(nb * npPer);
  for (let k = 0; k < nb; k++) {
    const { m, n } = modes[k];
    for (let j = 0; j < npPer; j++) cosB[k * npPer + j] = Math.cos(m * cg.theta[j] - n * nfp * cg.zeta[j]);
  }

  // A[i,k] = B·n response of mode k; bvec[i] = B·n from the secular terms.
  const A = new Matrix(pg.n, nb);
  const bvec = new Float64Array(pg.n);
  for (let i = 0; i < pg.n; i++) {
    const row = i * npPer;
    let sec = 0;
    for (let j = 0; j < npPer; j++) sec += (I / (2 * Math.PI)) * a[row + j] - (G / (2 * Math.PI)) * b[row + j];
    bvec[i] = pref * sec;
    for (let k = 0; k < nb; k++) {
      const { m, n } = modes[k];
      let s = 0;
      const cb = k * npPer;
      for (let j = 0; j < npPer; j++) s += cosB[cb + j] * (m * a[row + j] + n * nfp * b[row + j]);
      A.data[i * nb + k] = pref * s;
    }
    if (i % 64 === 0) onProgress?.('basis', i / pg.n);
  }

  // Plasma area weights (one period) and K-matrix on the winding surface.
  const wP = new Float64Array(pg.n);
  for (let i = 0; i < pg.n; i++) wP[i] = pg.normN[i] * dA_p;

  // f_k(j) = cos_k(j)(m r_ζ + n·nfp r_θ)/√|N|,   d(j) = (I/2π r_ζ − G/2π r_θ)/√|N|
  const NtN = new Matrix(nb, nb);
  const Ntd = new Float64Array(nb);
  const fk = new Float64Array(nb * 3);
  for (let j = 0; j < npPer; j++) {
    const sq = 1 / Math.sqrt(cg.normN[j]);
    const rt = [cg.rt[3 * j], cg.rt[3 * j + 1], cg.rt[3 * j + 2]];
    const rz = [cg.rz[3 * j], cg.rz[3 * j + 1], cg.rz[3 * j + 2]];
    const d = [0, 1, 2].map((q) => ((I / (2 * Math.PI)) * rz[q] - (G / (2 * Math.PI)) * rt[q]) * sq);
    for (let k = 0; k < nb; k++) {
      const { m, n } = modes[k];
      const c = cosB[k * npPer + j] * sq;
      for (let q = 0; q < 3; q++) fk[3 * k + q] = c * (m * rz[q] + n * nfp * rt[q]);
    }
    for (let k = 0; k < nb; k++) {
      Ntd[k] += fk[3 * k] * d[0] + fk[3 * k + 1] * d[1] + fk[3 * k + 2] * d[2];
      for (let l = k; l < nb; l++) NtN.data[k * nb + l] += fk[3 * k] * fk[3 * l] + fk[3 * k + 1] * fk[3 * l + 1] + fk[3 * k + 2] * fk[3 * l + 2];
    }
  }
  for (let k = 0; k < nb; k++) for (let l = 0; l < k; l++) NtN.data[k * nb + l] = NtN.data[l * nb + k];
  const kScale = dA_c * nfp;

  // Normal equations: (Aᵀ W A + λ F) Φ = −Aᵀ W b − λ Ntd
  const M = new Matrix(nb, nb);
  const rhs = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    for (let l = k; l < nb; l++) {
      let s = 0;
      for (let i = 0; i < pg.n; i++) s += A.data[i * nb + k] * wP[i] * A.data[i * nb + l];
      M.data[k * nb + l] = s * nfp + inp.lambda * kScale * NtN.data[k * nb + l];
      M.data[l * nb + k] = M.data[k * nb + l];
    }
    let s = 0;
    for (let i = 0; i < pg.n; i++) s += A.data[i * nb + k] * wP[i] * bvec[i];
    rhs[k] = -s * nfp - inp.lambda * kScale * Ntd[k];
  }
  // tiny ridge for numerical safety
  for (let k = 0; k < nb; k++) M.data[k * nb + k] *= 1 + 1e-12;
  onProgress?.('solve', 1);
  const phi = choleskySolve(M, rhs);

  // Diagnostics
  const Bn = A.mulVec(phi);
  let chi2B = 0,
    maxBn = 0,
    areaP = 0;
  for (let i = 0; i < pg.n; i++) {
    Bn[i] += bvec[i];
    chi2B += Bn[i] * Bn[i] * wP[i];
    areaP += wP[i];
    maxBn = Math.max(maxBn, Math.abs(Bn[i]));
  }
  const KMap = new Float64Array(npPer);
  let chi2K = 0,
    maxK = 0,
    areaC = 0;
  for (let j = 0; j < npPer; j++) {
    let Kx = 0,
      Ky = 0,
      Kz = 0;
    let phiT = I / (2 * Math.PI);
    let phiZ = G / (2 * Math.PI);
    for (let k = 0; k < nb; k++) {
      const c = cosB[k * npPer + j] * phi[k];
      phiT += modes[k].m * c;
      phiZ += -modes[k].n * nfp * c;
    }
    const inv = 1 / cg.normN[j];
    Kx = (phiT * cg.rz[3 * j] - phiZ * cg.rt[3 * j]) * inv;
    Ky = (phiT * cg.rz[3 * j + 1] - phiZ * cg.rt[3 * j + 1]) * inv;
    Kz = (phiT * cg.rz[3 * j + 2] - phiZ * cg.rt[3 * j + 2]) * inv;
    const K = Math.hypot(Kx, Ky, Kz);
    KMap[j] = K;
    chi2K += K * K * cg.normN[j] * dA_c;
    areaC += cg.normN[j] * dA_c;
    maxK = Math.max(maxK, K);
  }
  // reorder maps to θ-major for plotting: grid stored zeta-major (iz * nt + it)
  const BnMap = new Float64Array(pg.n);
  for (let iz = 0; iz < nzp; iz++) for (let it = 0; it < ntp; it++) BnMap[it * nzp + iz] = Bn[iz * ntp + it];
  const KMapT = new Float64Array(npPer);
  for (let iz = 0; iz < nzc; iz++) for (let it = 0; it < ntc; it++) KMapT[it * nzc + iz] = KMap[iz * ntc + it];

  return {
    modes,
    phi,
    chi2B: chi2B * nfp,
    chi2K: chi2K * nfp,
    maxBn,
    rmsBn: Math.sqrt(chi2B / areaP),
    maxK,
    rmsK: Math.sqrt(chi2K / areaC),
    BnMap,
    KMap: KMapT,
    grids: { ntp, nzp, ntc, nzc },
    input: inp,
  };
}

/** Evaluate the single-valued current potential. */
export function currentPotential(res: RegcoilResult, theta: number, zeta: number): number {
  const nfp = res.input.plasma.nfp;
  let s = 0;
  for (let k = 0; k < res.modes.length; k++) s += res.phi[k] * Math.sin(res.modes[k].m * theta - res.modes[k].n * nfp * zeta);
  return s;
}

/**
 * Cut modular coils from contours of the total potential
 * Φ_tot = Φ_sv + G ζ / 2π. Each coil is the contour Φ_tot = G (k + ½)/N_total
 * found by root-solving in ζ along every θ (valid while ∂Φ_tot/∂ζ keeps the
 * sign of G, i.e. coils don't fold back on themselves).
 */
export function cutModularCoils(res: RegcoilResult, coilsPerHalfPeriod: number, pointsPerCoil = 128): Coil[] {
  const { winding, plasma } = res.input;
  const nfp = plasma.nfp;
  const G = res.input.G;
  const total = coilsPerHalfPeriod * 2 * nfp;
  const current = G / total;
  const coils: Coil[] = [];
  const phiTot = (t: number, z: number) => currentPotential(res, t, z) + (G * z) / (2 * Math.PI);
  for (let k = 0; k < total; k++) {
    const level = (G * (k + 0.5)) / total;
    const z0 = (2 * Math.PI * (k + 0.5)) / total;
    const pts = new Float64Array(3 * pointsPerCoil);
    for (let i = 0; i < pointsPerCoil; i++) {
      const t = (2 * Math.PI * i) / pointsPerCoil;
      // bracket around the unperturbed position (Φ_sv bounded ⇒ shift bounded)
      const f = (z: number) => phiTot(t, z) - level;
      let lo = z0 - Math.PI / nfp;
      let hi = z0 + Math.PI / nfp;
      let flo = f(lo);
      const fhi = f(hi);
      if (flo * fhi > 0) {
        // fall back to a wider bracket
        lo = z0 - Math.PI;
        hi = z0 + Math.PI;
        flo = f(lo);
      }
      for (let it = 0; it < 60; it++) {
        const mid = 0.5 * (lo + hi);
        const fm = f(mid);
        if (fm * flo > 0) {
          lo = mid;
          flo = fm;
        } else hi = mid;
      }
      const z = 0.5 * (lo + hi);
      const p = evalSurface(winding, t, z);
      pts[3 * i] = p.R * Math.cos(z);
      pts[3 * i + 1] = p.R * Math.sin(z);
      pts[3 * i + 2] = p.Z;
    }
    const period = Math.floor(k / (2 * coilsPerHalfPeriod));
    const within = k % (2 * coilsPerHalfPeriod);
    coils.push({
      points: pts,
      current,
      baseIndex: within < coilsPerHalfPeriod ? within : 2 * coilsPerHalfPeriod - 1 - within,
      label: `RC${k + 1}`,
      flipped: within >= coilsPerHalfPeriod,
      period,
    });
  }
  return coils;
}

/** Normalised field error ⟨|B·n|/|B|⟩ of a filament coil set on the plasma surface. */
export function normalFieldError(coils: Coil[], plasma: FourierSurface, nt = 24, nz = 24): { mean: number; max: number } {
  const pc = packCoils(coils);
  const g = sampleGrid(plasma, nt, nz, 1);
  let sum = 0;
  let wsum = 0;
  let mx = 0;
  const B = [0, 0, 0];
  for (let i = 0; i < g.n; i++) {
    biotSavartPoint(pc, g.x[3 * i], g.x[3 * i + 1], g.x[3 * i + 2], B);
    const bn = (B[0] * g.N[3 * i] + B[1] * g.N[3 * i + 1] + B[2] * g.N[3 * i + 2]) / g.normN[i];
    const r = Math.abs(bn) / Math.hypot(B[0], B[1], B[2]);
    sum += r * g.normN[i];
    wsum += g.normN[i];
    mx = Math.max(mx, r);
  }
  return { mean: sum / wsum, max: mx };
}

/** Net poloidal current that produces B0 at major radius R0: G = 2π R0 B0 / μ0. */
export const poloidalCurrentFor = (B0: number, R0: number) => (2 * Math.PI * R0 * B0) / MU0;
