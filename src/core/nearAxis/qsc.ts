/**
 * First-order near-axis expansion for quasisymmetric stellarators
 * (Garren & Boozer 1991; Landreman & Sengupta 2018; Landreman, Sengupta & Plunk 2019).
 *
 * This is a faithful TypeScript port of the O(r^1) part of pyQSC
 * (https://github.com/landreman/pyQSC, MIT licence): axis geometry, Frenet
 * frame, the Riccati "sigma equation" solved by Newton's method with a
 * spectral differentiation matrix, helicity detection, elongation, the
 * ∇B tensor and the L∇B scale length (Landreman 2021, eq. 3.12).
 *
 * Validated against pyQSC to ~1e-10 in tests/nearAxis.test.ts.
 */
import { Matrix } from '../math/linalg';
import { spectralDiffMatrix, fourierMinimum, fourierInterpolate } from '../math/spectral';
import { newton } from '../math/solvers';

export interface QscInput {
  /** Axis R cosine coefficients: R0(φ) = Σ rc[n] cos(n·nfp·φ) + rs[n] sin(n·nfp·φ) */
  rc: number[];
  zs: number[];
  rs?: number[];
  zc?: number[];
  nfp: number;
  etabar: number;
  sigma0?: number;
  B0?: number;
  I2?: number;
  sG?: 1 | -1;
  spsi?: 1 | -1;
  nphi?: number;
}

export interface QscSolution {
  input: Required<QscInput>;
  phi: Float64Array;
  R0: Float64Array;
  Z0: Float64Array;
  curvature: Float64Array;
  torsion: Float64Array;
  dlDphi: Float64Array;
  varphi: Float64Array;
  axisLength: number;
  G0: number;
  absG0OverB0: number;
  helicity: number;
  iota: number;
  iotaN: number;
  sigma: Float64Array;
  X1c: Float64Array;
  Y1s: Float64Array;
  Y1c: Float64Array;
  X1cU: Float64Array;
  X1sU: Float64Array;
  Y1cU: Float64Array;
  Y1sU: Float64Array;
  elongation: Float64Array;
  maxElongation: number;
  meanElongation: number;
  LgradB: Float64Array;
  minLgradB: number;
  minR0: number;
  rmsCurvature: number;
  tangent: Float64Array[]; // cylindrical (R, φ, Z) components per grid point
  normal: Float64Array[];
  binormal: Float64Array[];
  newtonIterations: number;
  newtonResidual: number;
  converged: boolean;
  lasym: boolean;
}

const pad = (a: number[] | undefined, n: number) => {
  const out = new Array<number>(n).fill(0);
  (a ?? []).forEach((v, i) => (out[i] = v));
  return out;
};

export function solveQsc(inp: QscInput): QscSolution {
  const nf = Math.max(inp.rc.length, inp.zs.length, inp.rs?.length ?? 0, inp.zc?.length ?? 0);
  const input: Required<QscInput> = {
    rc: pad(inp.rc, nf),
    zs: pad(inp.zs, nf),
    rs: pad(inp.rs, nf),
    zc: pad(inp.zc, nf),
    nfp: inp.nfp,
    etabar: inp.etabar,
    sigma0: inp.sigma0 ?? 0,
    B0: inp.B0 ?? 1,
    I2: inp.I2 ?? 0,
    sG: inp.sG ?? 1,
    spsi: inp.spsi ?? 1,
    nphi: inp.nphi ?? 61,
  };
  const { rc, zs, rs, zc, nfp, etabar, sigma0, B0, I2, sG, spsi, nphi } = input;
  if (nphi % 2 === 0) throw new Error('nphi must be odd');

  const phi = new Float64Array(nphi);
  const dphi = (2 * Math.PI) / nfp / nphi;
  for (let j = 0; j < nphi; j++) phi[j] = j * dphi;

  const R0 = new Float64Array(nphi),
    Z0 = new Float64Array(nphi),
    R0p = new Float64Array(nphi),
    Z0p = new Float64Array(nphi),
    R0pp = new Float64Array(nphi),
    Z0pp = new Float64Array(nphi),
    R0ppp = new Float64Array(nphi),
    Z0ppp = new Float64Array(nphi);
  for (let jn = 0; jn < nf; jn++) {
    const n = jn * nfp;
    for (let j = 0; j < nphi; j++) {
      const s = Math.sin(n * phi[j]);
      const c = Math.cos(n * phi[j]);
      R0[j] += rc[jn] * c + rs[jn] * s;
      Z0[j] += zc[jn] * c + zs[jn] * s;
      R0p[j] += rc[jn] * (-n * s) + rs[jn] * (n * c);
      Z0p[j] += zc[jn] * (-n * s) + zs[jn] * (n * c);
      R0pp[j] += rc[jn] * (-n * n * c) + rs[jn] * (-n * n * s);
      Z0pp[j] += zc[jn] * (-n * n * c) + zs[jn] * (-n * n * s);
      R0ppp[j] += rc[jn] * (n * n * n * s) + rs[jn] * (-n * n * n * c);
      Z0ppp[j] += zc[jn] * (n * n * n * s) + zs[jn] * (-n * n * n * c);
    }
  }

  const dlDphi = new Float64Array(nphi);
  const d2lDphi2 = new Float64Array(nphi);
  let sumDl = 0;
  for (let j = 0; j < nphi; j++) {
    dlDphi[j] = Math.sqrt(R0[j] ** 2 + R0p[j] ** 2 + Z0p[j] ** 2);
    d2lDphi2[j] = (R0[j] * R0p[j] + R0p[j] * R0pp[j] + Z0p[j] * Z0pp[j]) / dlDphi[j];
    sumDl += dlDphi[j];
  }
  const B0OverAbsG0 = nphi / sumDl;
  const absG0OverB0 = 1 / B0OverAbsG0;
  const G0 = sG * absG0OverB0 * B0;

  const tangent: Float64Array[] = [new Float64Array(nphi), new Float64Array(nphi), new Float64Array(nphi)];
  const normal: Float64Array[] = [new Float64Array(nphi), new Float64Array(nphi), new Float64Array(nphi)];
  const binormal: Float64Array[] = [new Float64Array(nphi), new Float64Array(nphi), new Float64Array(nphi)];
  const curvature = new Float64Array(nphi);
  const torsion = new Float64Array(nphi);

  for (let j = 0; j < nphi; j++) {
    const d1 = [R0p[j], R0[j], Z0p[j]];
    const d2 = [R0pp[j] - R0[j], 2 * R0p[j], Z0pp[j]];
    const d3 = [R0ppp[j] - 3 * R0p[j], 3 * R0pp[j] - R0[j], Z0ppp[j]];
    const dtdl = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      tangent[k][j] = d1[k] / dlDphi[j];
      dtdl[k] = (-d1[k] * d2lDphi2[j] / dlDphi[j] + d2[k]) / (dlDphi[j] * dlDphi[j]);
    }
    curvature[j] = Math.hypot(dtdl[0], dtdl[1], dtdl[2]);
    for (let k = 0; k < 3; k++) normal[k][j] = dtdl[k] / curvature[j];
    const t = [tangent[0][j], tangent[1][j], tangent[2][j]];
    const n = [normal[0][j], normal[1][j], normal[2][j]];
    binormal[0][j] = t[1] * n[2] - t[2] * n[1];
    binormal[1][j] = t[2] * n[0] - t[0] * n[2];
    binormal[2][j] = t[0] * n[1] - t[1] * n[0];
    const num =
      d1[0] * (d2[1] * d3[2] - d2[2] * d3[1]) +
      d1[1] * (d2[2] * d3[0] - d2[0] * d3[2]) +
      d1[2] * (d2[0] * d3[1] - d2[1] * d3[0]);
    const den =
      (d1[1] * d2[2] - d1[2] * d2[1]) ** 2 + (d1[2] * d2[0] - d1[0] * d2[2]) ** 2 + (d1[0] * d2[1] - d1[1] * d2[0]) ** 2;
    torsion[j] = num / den;
  }

  const axisLength = sumDl * dphi * nfp;
  let rmsK = 0;
  for (let j = 0; j < nphi; j++) rmsK += curvature[j] ** 2 * dlDphi[j];
  const rmsCurvature = Math.sqrt((rmsK * dphi * nfp) / axisLength);

  const helicity = determineHelicity(normal, nphi, spsi * sG);

  const etabarSqOverKSq = new Float64Array(nphi);
  for (let j = 0; j < nphi; j++) etabarSqOverKSq[j] = (etabar * etabar) / (curvature[j] * curvature[j]);

  const Dphi = spectralDiffMatrix(nphi, 0, (2 * Math.PI) / nfp);
  const dVarphiDphi = new Float64Array(nphi);
  for (let j = 0; j < nphi; j++) dVarphiDphi[j] = B0OverAbsG0 * dlDphi[j];
  const Dvarphi = new Matrix(nphi, nphi);
  for (let i = 0; i < nphi; i++) for (let j = 0; j < nphi; j++) Dvarphi.data[i * nphi + j] = Dphi.data[i * nphi + j] / dVarphiDphi[i];

  const varphi = new Float64Array(nphi);
  for (let j = 1; j < nphi; j++) varphi[j] = varphi[j - 1] + (dlDphi[j - 1] + dlDphi[j]);
  for (let j = 0; j < nphi; j++) varphi[j] *= (0.5 * dphi * 2 * Math.PI) / axisLength;

  // ---- sigma equation (Riccati) -----------------------------------------
  const hN = helicity * nfp;
  const forcing = new Float64Array(nphi);
  for (let j = 0; j < nphi; j++) forcing[j] = 2 * etabarSqOverKSq[j] * (-spsi * torsion[j] + I2 / B0) * (G0 / B0);

  const unpack = (x: Float64Array) => {
    const sigma = x.slice();
    sigma[0] = sigma0;
    return { sigma, iota: x[0] };
  };
  const residual = (x: Float64Array) => {
    const { sigma, iota } = unpack(x);
    const ds = Dvarphi.mulVec(sigma);
    const r = new Float64Array(nphi);
    for (let j = 0; j < nphi; j++)
      r[j] = ds[j] + (iota + hN) * (etabarSqOverKSq[j] * etabarSqOverKSq[j] + 1 + sigma[j] * sigma[j]) - forcing[j];
    return r;
  };
  const jacobian = (x: Float64Array) => {
    const { sigma, iota } = unpack(x);
    const J = Dvarphi.clone();
    for (let j = 0; j < nphi; j++) J.data[j * nphi + j] += (iota + hN) * 2 * sigma[j];
    for (let j = 0; j < nphi; j++) J.data[j * nphi] = etabarSqOverKSq[j] * etabarSqOverKSq[j] + 1 + sigma[j] * sigma[j];
    return J;
  };
  const x0 = new Float64Array(nphi).fill(sigma0);
  x0[0] = 0;
  const sol = newton(residual, jacobian, x0, { tol: 1e-13, maxIter: 40 });
  const iota = sol.x[0];
  const sigma = sol.x.slice();
  sigma[0] = sigma0;
  const iotaN = iota + hN;

  // ---- r1 diagnostics --------------------------------------------------
  const X1c = new Float64Array(nphi),
    Y1s = new Float64Array(nphi),
    Y1c = new Float64Array(nphi);
  for (let j = 0; j < nphi; j++) {
    X1c[j] = etabar / curvature[j];
    Y1s[j] = (sG * spsi * curvature[j]) / etabar;
    Y1c[j] = (sG * spsi * curvature[j] * sigma[j]) / etabar;
  }
  const X1cU = new Float64Array(nphi),
    X1sU = new Float64Array(nphi),
    Y1cU = new Float64Array(nphi),
    Y1sU = new Float64Array(nphi);
  for (let j = 0; j < nphi; j++) {
    const ang = -helicity * nfp * varphi[j];
    const s = Math.sin(ang);
    const c = Math.cos(ang);
    // X1s = 0 in quasisymmetry
    X1sU[j] = X1c[j] * s;
    X1cU[j] = X1c[j] * c;
    Y1sU[j] = Y1s[j] * c + Y1c[j] * s;
    Y1cU[j] = -Y1s[j] * s + Y1c[j] * c;
  }

  const elongation = new Float64Array(nphi);
  let el = 0;
  for (let j = 0; j < nphi; j++) {
    const p = X1c[j] ** 2 + Y1s[j] ** 2 + Y1c[j] ** 2;
    const q = -X1c[j] * Y1s[j];
    elongation[j] = (p + Math.sqrt(p * p - 4 * q * q)) / (2 * Math.abs(q));
    el += elongation[j] * dlDphi[j];
  }
  const meanElongation = el / sumDl;
  const maxElongation = -fourierMinimum(elongation.map((v) => -v));

  // ---- grad B tensor (Landreman 2021, eq. 3.12) --------------------------
  const dX1c = Dvarphi.mulVec(X1c);
  const dY1s = Dvarphi.mulVec(Y1s);
  const dY1c = Dvarphi.mulVec(Y1c);
  const LgradB = new Float64Array(nphi);
  const factor = (spsi * B0) / absG0OverB0;
  for (let j = 0; j < nphi; j++) {
    const tn = sG * B0 * curvature[j];
    const nt = tn;
    const bb = factor * (X1c[j] * dY1s[j] - iotaN * X1c[j] * Y1c[j]);
    const nn = factor * (dX1c[j] * Y1s[j] + iotaN * X1c[j] * Y1c[j]);
    const bn = factor * (-sG * spsi * absG0OverB0 * torsion[j] - iotaN * X1c[j] * X1c[j]);
    const nb =
      factor *
      (dY1c[j] * Y1s[j] - dY1s[j] * Y1c[j] + sG * spsi * absG0OverB0 * torsion[j] + iotaN * (Y1s[j] ** 2 + Y1c[j] ** 2));
    const gg = tn * tn + nt * nt + bb * bb + nn * nn + nb * nb + bn * bn;
    LgradB[j] = B0 * Math.sqrt(2 / gg);
  }
  const minLgradB = fourierMinimum(LgradB);

  const lasym = rs.some((v) => v !== 0) || zc.some((v) => v !== 0) || sigma0 !== 0;

  return {
    input,
    phi,
    R0,
    Z0,
    curvature,
    torsion,
    dlDphi,
    varphi,
    axisLength,
    G0,
    absG0OverB0,
    helicity,
    iota,
    iotaN,
    sigma,
    X1c,
    Y1s,
    Y1c,
    X1cU,
    X1sU,
    Y1cU,
    Y1sU,
    elongation,
    maxElongation,
    meanElongation,
    LgradB,
    minLgradB,
    minR0: fourierMinimum(R0),
    rmsCurvature,
    tangent,
    normal,
    binormal,
    newtonIterations: sol.iterations,
    newtonResidual: sol.residualNorm,
    converged: sol.converged,
    lasym,
  };
}

function determineHelicity(normal: Float64Array[], nphi: number, sign: number): number {
  const quadrant = new Int32Array(nphi + 1);
  for (let j = 0; j < nphi; j++) {
    const nR = normal[0][j];
    const nZ = normal[2][j];
    quadrant[j] = nR >= 0 ? (nZ >= 0 ? 1 : 4) : nZ >= 0 ? 2 : 3;
  }
  quadrant[nphi] = quadrant[0];
  let counter = 0;
  for (let j = 0; j < nphi; j++) {
    if (quadrant[j] === 4 && quadrant[j + 1] === 1) counter += 1;
    else if (quadrant[j] === 1 && quadrant[j + 1] === 4) counter -= 1;
    else counter += quadrant[j + 1] - quadrant[j];
  }
  return (counter * sign) / 4;
}

/** Periodic interpolation of a per-field-period array at axis angle φ0. */
function interp(sol: QscSolution, arr: ArrayLike<number>, phi0: number): number {
  return fourierInterpolate(arr, (2 * Math.PI) / sol.input.nfp, phi0);
}

/** Precomputed Fourier series for fast evaluation of axis-attached quantities at arbitrary φ0. */
class PeriodicSeries {
  private a: Float64Array;
  private b: Float64Array;
  private w: number;
  private kmax: number;
  private even: boolean;
  constructor(samples: ArrayLike<number>, period: number) {
    const n = samples.length;
    this.kmax = Math.floor(n / 2);
    this.even = n % 2 === 0;
    this.a = new Float64Array(this.kmax + 1);
    this.b = new Float64Array(this.kmax + 1);
    for (let k = 0; k <= this.kmax; k++) {
      let sa = 0;
      let sb = 0;
      for (let j = 0; j < n; j++) {
        const x = (2 * Math.PI * k * j) / n;
        sa += samples[j] * Math.cos(x);
        sb += samples[j] * Math.sin(x);
      }
      const f = k === 0 || (this.even && k === this.kmax) ? 1 / n : 2 / n;
      this.a[k] = sa * f;
      this.b[k] = sb * f;
    }
    this.w = (2 * Math.PI) / period;
  }
  at(x: number): number {
    let s = this.a[0];
    for (let k = 1; k <= this.kmax; k++) {
      const f = this.even && k === this.kmax ? 0.5 : 1;
      s += f * (this.a[k] * Math.cos(k * this.w * x) + this.b[k] * Math.sin(k * this.w * x));
    }
    return s;
  }
}

export interface NearAxisSurfaceEvaluator {
  /** Cartesian point on the surface of minor radius r at untwisted poloidal angle θ and axis angle φ0. */
  point(r: number, theta: number, phi0: number): [number, number, number];
  /** |B| on the surface (first order). */
  modB(r: number, theta: number, phi0: number): number;
}

export function nearAxisEvaluator(sol: QscSolution): NearAxisSurfaceEvaluator {
  const { nfp, rc, rs, zc, zs, B0, etabar } = sol.input;
  const P = (2 * Math.PI) / nfp;
  const series = (a: ArrayLike<number>) => new PeriodicSeries(a, P);
  const X1c = series(sol.X1cU),
    X1s = series(sol.X1sU),
    Y1c = series(sol.Y1cU),
    Y1s = series(sol.Y1sU),
    nR = series(sol.normal[0]),
    nP = series(sol.normal[1]),
    nZ = series(sol.normal[2]),
    bR = series(sol.binormal[0]),
    bP = series(sol.binormal[1]),
    bZ = series(sol.binormal[2]),
    nu = series(Array.from(sol.varphi, (v, j) => v - sol.phi[j]));
  const axis = (p: number): [number, number] => {
    let R = 0;
    let Z = 0;
    for (let n = 0; n < rc.length; n++) {
      const c = Math.cos(n * nfp * p);
      const s = Math.sin(n * nfp * p);
      R += rc[n] * c + rs[n] * s;
      Z += zc[n] * c + zs[n] * s;
    }
    return [R, Z];
  };
  const hN = sol.helicity * nfp;
  return {
    point(r, theta, phi0) {
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const X = r * (X1c.at(phi0) * ct + X1s.at(phi0) * st);
      const Y = r * (Y1c.at(phi0) * ct + Y1s.at(phi0) * st);
      const [R0, Z0] = axis(phi0);
      // position in local cylindrical basis at phi0
      const dR = X * nR.at(phi0) + Y * bR.at(phi0);
      const dP = X * nP.at(phi0) + Y * bP.at(phi0);
      const dZ = X * nZ.at(phi0) + Y * bZ.at(phi0);
      const R = R0 + dR;
      const c = Math.cos(phi0);
      const s = Math.sin(phi0);
      return [R * c - dP * s, R * s + dP * c, Z0 + dZ];
    },
    modB(r, theta, phi0) {
      const varphi = phi0 + nu.at(phi0);
      return B0 * (1 + r * etabar * Math.cos(theta + hN * varphi));
    },
  };
}

/**
 * Convert the near-axis surface at radius r to a VMEC-style boundary in
 * cylindrical (R, φ, Z) coordinates, i.e. R(θ,φ) and Z(θ,φ) at fixed
 * cylindrical φ. For each (θ, φ) we solve for the axis angle φ0 whose
 * surface point lies in the plane φ (cf. pyQSC Frenet_to_cylindrical).
 */
export function nearAxisToCylindrical(
  sol: QscSolution,
  r: number,
  ntheta = 24,
  nphiPerPeriod = 32,
): { R: Float64Array; Z: Float64Array; ntheta: number; nphi: number } {
  const ev = nearAxisEvaluator(sol);
  const nfp = sol.input.nfp;
  const R = new Float64Array(ntheta * nphiPerPeriod);
  const Z = new Float64Array(ntheta * nphiPerPeriod);
  for (let i = 0; i < ntheta; i++) {
    const th = (2 * Math.PI * i) / ntheta;
    for (let j = 0; j < nphiPerPeriod; j++) {
      const phiT = (2 * Math.PI * j) / nphiPerPeriod / nfp;
      let p0 = phiT;
      for (let it = 0; it < 30; it++) {
        const f = (pp: number) => {
          const [x, y] = ev.point(r, th, pp);
          let d = Math.atan2(y, x) - phiT;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          return d;
        };
        const fv = f(p0);
        if (Math.abs(fv) < 1e-13) break;
        const h = 1e-6;
        const d = (f(p0 + h) - f(p0 - h)) / (2 * h);
        p0 -= fv / d;
      }
      const [x, y, z] = ev.point(r, th, p0);
      R[i * nphiPerPeriod + j] = Math.hypot(x, y);
      Z[i * nphiPerPeriod + j] = z;
    }
  }
  return { R, Z, ntheta, nphi: nphiPerPeriod };
}

export { interp as nearAxisInterp };
