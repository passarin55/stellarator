/**
 * Toroidal surfaces described by a double Fourier series in VMEC convention:
 *
 *   R(θ,φ) = Σ_{m,n} RBC(m,n) cos(mθ − n·nfp·φ) + RBS(m,n) sin(mθ − n·nfp·φ)
 *   Z(θ,φ) = Σ_{m,n} ZBS(m,n) sin(mθ − n·nfp·φ) + ZBC(m,n) cos(mθ − n·nfp·φ)
 *
 * φ is the cylindrical toroidal angle, θ a poloidal angle. Stellarator
 * symmetry (lasym = false) keeps only RBC and ZBS.
 */
import type { Vec3 } from '../math/linalg';

export interface FourierMode {
  m: number;
  n: number;
  rbc: number;
  zbs: number;
  rbs?: number;
  zbc?: number;
}

export interface FourierSurface {
  nfp: number;
  lasym: boolean;
  modes: FourierMode[];
}

export interface SurfacePoint {
  R: number;
  Z: number;
  Rt: number; // ∂R/∂θ
  Rp: number; // ∂R/∂φ
  Zt: number;
  Zp: number;
  Rtt: number;
  Rtp: number;
  Rpp: number;
  Ztt: number;
  Ztp: number;
  Zpp: number;
}

export function evalSurface(s: FourierSurface, theta: number, phi: number): SurfacePoint {
  const p: SurfacePoint = { R: 0, Z: 0, Rt: 0, Rp: 0, Zt: 0, Zp: 0, Rtt: 0, Rtp: 0, Rpp: 0, Ztt: 0, Ztp: 0, Zpp: 0 };
  const nfp = s.nfp;
  for (const md of s.modes) {
    const m = md.m;
    const nn = md.n * nfp;
    const a = m * theta - nn * phi;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const rbc = md.rbc;
    const zbs = md.zbs;
    const rbs = md.rbs ?? 0;
    const zbc = md.zbc ?? 0;
    // R = rbc cos a + rbs sin a ; da/dθ = m, da/dφ = −nn
    const R0 = rbc * c + rbs * sn;
    const R1 = -rbc * sn + rbs * c; // dR/da
    const Z0 = zbs * sn + zbc * c;
    const Z1 = zbs * c - zbc * sn;
    p.R += R0;
    p.Z += Z0;
    p.Rt += m * R1;
    p.Rp += -nn * R1;
    p.Zt += m * Z1;
    p.Zp += -nn * Z1;
    // second derivatives: d²/da² = −(value)
    p.Rtt += -m * m * R0;
    p.Rtp += m * nn * R0;
    p.Rpp += -nn * nn * R0;
    p.Ztt += -m * m * Z0;
    p.Ztp += m * nn * Z0;
    p.Zpp += -nn * nn * Z0;
  }
  return p;
}

export const surfaceRZ = (s: FourierSurface, theta: number, phi: number): [number, number] => {
  let R = 0;
  let Z = 0;
  for (const md of s.modes) {
    const a = md.m * theta - md.n * s.nfp * phi;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    R += md.rbc * c + (md.rbs ?? 0) * sn;
    Z += md.zbs * sn + (md.zbc ?? 0) * c;
  }
  return [R, Z];
};

export const toCartesian = (R: number, phi: number, Z: number): Vec3 => [R * Math.cos(phi), R * Math.sin(phi), Z];

export interface SurfaceMetrics {
  volume: number;
  area: number;
  meanCrossSection: number;
  minorRadius: number;
  majorRadius: number;
  aspectRatio: number;
  /** max over φ of the cross-section elongation (ratio of principal axes of the section's inertia ellipse) */
  maxElongation: number;
  /** R_max − R_min, Z extent */
  rRange: [number, number];
  zRange: [number, number];
  /** Fraction of the surface with negative Gaussian curvature (a measure of 3D shaping) */
  saddleFraction: number;
  /** max |principal curvature| [1/m] */
  maxCurvature: number;
}

/**
 * Integral quantities. All integrands are smooth and periodic, so uniform grids
 * give spectral accuracy. Definitions follow VMEC / simsopt conventions:
 * minor radius a = sqrt(Ā/π) with Ā the φ-averaged cross-sectional area, and
 * major radius R = V / (2π Ā).
 */
export function surfaceMetrics(s: FourierSurface, ntheta = 64, nphi = 64): SurfaceMetrics {
  const P = (2 * Math.PI) / s.nfp; // integrate over one field period and scale
  let vol = 0;
  let area = 0;
  let meanA = 0;
  let maxEl = 1;
  let rmin = Infinity,
    rmax = -Infinity,
    zmin = Infinity,
    zmax = -Infinity;
  let neg = 0;
  let maxK = 0;
  const dth = (2 * Math.PI) / ntheta;
  const dph = P / nphi;
  for (let j = 0; j < nphi; j++) {
    const phi = j * dph;
    let secA = 0;
    // second moments of the cross-section (for elongation)
    let cx = 0,
      cz = 0,
      ixx = 0,
      izz = 0,
      ixz = 0;
    const pts: [number, number][] = [];
    for (let i = 0; i < ntheta; i++) {
      const th = i * dth;
      const p = evalSurface(s, th, phi);
      pts.push([p.R, p.Z]);
      vol += 0.5 * p.R * p.R * p.Zt;
      secA += p.R * p.Zt;
      // area element |r_θ × r_φ| with r = (R cosφ, R sinφ, Z)
      // in local (e_R, e_φ, e_Z): r_θ = (Rt, 0, Zt), r_φ = (Rp, R, Zp)
      const nx = -p.Zt * p.R; // (r_θ × r_φ)_R = 0*Zp - Zt*R
      const ny = p.Zt * p.Rp - p.Rt * p.Zp; // φ comp
      const nz = p.Rt * p.R; // Z comp
      const J = Math.hypot(nx, ny, nz);
      area += J;
      // principal curvatures via fundamental forms
      const rt: Vec3 = [p.Rt, 0, p.Zt];
      const rp: Vec3 = [p.Rp, p.R, p.Zp];
      // second derivatives in the rotating basis (account for e_R' = e_φ, e_φ' = −e_R)
      const rtt: Vec3 = [p.Rtt, 0, p.Ztt];
      const rtp: Vec3 = [p.Rtp, p.Rt, p.Ztp];
      const rpp: Vec3 = [p.Rpp - p.R, 2 * p.Rp, p.Zpp];
      const nrm: Vec3 = [nx / J, ny / J, nz / J];
      const E = rt[0] ** 2 + rt[2] ** 2;
      const F = rt[0] * rp[0] + rt[2] * rp[2];
      const G = rp[0] ** 2 + rp[1] ** 2 + rp[2] ** 2;
      const L = rtt[0] * nrm[0] + rtt[1] * nrm[1] + rtt[2] * nrm[2];
      const M = rtp[0] * nrm[0] + rtp[1] * nrm[1] + rtp[2] * nrm[2];
      const N = rpp[0] * nrm[0] + rpp[1] * nrm[1] + rpp[2] * nrm[2];
      const den = E * G - F * F;
      const K = (L * N - M * M) / den;
      const H = (E * N - 2 * F * M + G * L) / (2 * den);
      const disc = Math.sqrt(Math.max(0, H * H - K));
      maxK = Math.max(maxK, Math.abs(H) + disc);
      if (K < 0) neg++;
      rmin = Math.min(rmin, p.R);
      rmax = Math.max(rmax, p.R);
      zmin = Math.min(zmin, p.Z);
      zmax = Math.max(zmax, p.Z);
    }
    // polygon centroid & second moments (Green's theorem on the closed section)
    let A = 0;
    for (let i = 0; i < ntheta; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % ntheta];
      const c = x0 * y1 - x1 * y0;
      A += c;
      cx += (x0 + x1) * c;
      cz += (y0 + y1) * c;
      ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c;
      izz += (x0 * x0 + x0 * x1 + x1 * x1) * c;
      ixz += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
    }
    A /= 2;
    cx /= 6 * A;
    cz /= 6 * A;
    // central moments
    const Iyy = ixx / 12 - A * cz * cz; // ∫ z² dA
    const Ixx = izz / 12 - A * cx * cx; // ∫ x² dA
    const Ixz = ixz / 24 - A * cx * cz;
    const tr = Ixx + Iyy;
    const d = Math.sqrt(((Ixx - Iyy) / 2) ** 2 + Ixz * Ixz);
    const l1 = tr / 2 + d;
    const l2 = tr / 2 - d;
    if (l2 > 0) maxEl = Math.max(maxEl, Math.sqrt(l1 / l2));
    meanA += Math.abs(secA * dth);
  }
  const volume = Math.abs(vol * dth * dph * s.nfp);
  const surfaceArea = area * dth * dph * s.nfp;
  const meanCrossSection = meanA / nphi;
  const minorRadius = Math.sqrt(meanCrossSection / Math.PI);
  const majorRadius = volume / (2 * Math.PI * meanCrossSection);
  return {
    volume,
    area: surfaceArea,
    meanCrossSection,
    minorRadius,
    majorRadius,
    aspectRatio: majorRadius / minorRadius,
    maxElongation: maxEl,
    rRange: [rmin, rmax],
    zRange: [zmin, zmax],
    saddleFraction: neg / (ntheta * nphi),
    maxCurvature: maxK,
  };
}

/** Cross-section polyline at cylindrical angle φ. */
export function crossSection(s: FourierSurface, phi: number, n = 128): { R: Float64Array; Z: Float64Array } {
  const R = new Float64Array(n + 1);
  const Z = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const [r, z] = surfaceRZ(s, (2 * Math.PI * i) / n, phi);
    R[i] = r;
    Z[i] = z;
  }
  return { R, Z };
}

/** Uniform scaling of the whole configuration (all lengths ×k). */
export function scaleSurface(s: FourierSurface, k: number): FourierSurface {
  return {
    ...s,
    modes: s.modes.map((m) => ({ ...m, rbc: m.rbc * k, zbs: m.zbs * k, rbs: (m.rbs ?? 0) * k, zbc: (m.zbc ?? 0) * k })),
  };
}

/** Keep modes with |m| ≤ mpol, |n| ≤ ntor. */
export function truncateSurface(s: FourierSurface, mpol: number, ntor: number): FourierSurface {
  return { ...s, modes: s.modes.filter((m) => m.m <= mpol && Math.abs(m.n) <= ntor) };
}

/**
 * Offset a surface along its outward normal by distance d and refit it as a
 * Fourier surface (used to build coil winding surfaces / first-wall proxies).
 */
export function offsetSurface(s: FourierSurface, d: number, mpol = 10, ntor = 10, ntheta = 48, nphi = 48): FourierSurface {
  const P = (2 * Math.PI) / s.nfp;
  const Rg = new Float64Array(ntheta * nphi);
  const Zg = new Float64Array(ntheta * nphi);
  // r_θ × r_φ points inward when θ circulates counter-clockwise in the (R,Z)
  // plane (∮R dZ > 0); flip so that d > 0 always grows the surface.
  d *= -orientation(s);
  for (let j = 0; j < nphi; j++) {
    const phi = (j * P) / nphi;
    for (let i = 0; i < ntheta; i++) {
      const th = (2 * Math.PI * i) / ntheta;
      // The offset point leaves the φ-plane (normal has a toroidal component),
      // so iterate on the source angle φ' until the displaced point lands in plane φ.
      let phiSrc = phi;
      let R = 0;
      let Z = 0;
      for (let it = 0; it < 20; it++) {
        const p = evalSurface(s, th, phiSrc);
        const nR = -p.Zt * p.R;
        const nP = p.Zt * p.Rp - p.Rt * p.Zp;
        const nZ = p.Rt * p.R;
        const J = Math.hypot(nR, nP, nZ);
        const xR = p.R + (d * nR) / J;
        const xP = (d * nP) / J;
        const shift = Math.atan2(xP, xR);
        R = Math.hypot(xR, xP);
        Z = p.Z + (d * nZ) / J;
        const next = phi - shift;
        if (Math.abs(next - phiSrc) < 1e-14) break;
        phiSrc = next;
      }
      Rg[i * nphi + j] = R;
      Zg[i * nphi + j] = Z;
    }
  }
  return fitFourierSurface(Rg, Zg, ntheta, nphi, s.nfp, mpol, ntor, s.lasym);
}

/** +1 if θ circulates counter-clockwise in the (R, Z) plane, −1 otherwise. */
export function orientation(s: FourierSurface): 1 | -1 {
  let acc = 0;
  const n = 32;
  for (let i = 0; i < n; i++) {
    const p = evalSurface(s, (2 * Math.PI * i) / n, 0);
    acc += p.R * p.Zt;
  }
  return acc >= 0 ? 1 : -1;
}

/**
 * Least-squares (here: exact DFT, since the grid is uniform) projection of a
 * sampled surface R(θ_i, φ_j), Z(θ_i, φ_j) — one field period, φ_j = j·P/nphi —
 * onto VMEC Fourier modes.
 */
export function fitFourierSurface(
  R: ArrayLike<number>,
  Z: ArrayLike<number>,
  ntheta: number,
  nphi: number,
  nfp: number,
  mpol: number,
  ntor: number,
  lasym = false,
): FourierSurface {
  const modes: FourierMode[] = [];
  const P = (2 * Math.PI) / nfp;
  const N = ntheta * nphi;
  for (let m = 0; m <= mpol; m++) {
    for (let n = -ntor; n <= ntor; n++) {
      if (m === 0 && n < 0) continue;
      let rc = 0,
        rs = 0,
        zc = 0,
        zs = 0;
      for (let i = 0; i < ntheta; i++) {
        const th = (2 * Math.PI * i) / ntheta;
        for (let j = 0; j < nphi; j++) {
          const phi = (j * P) / nphi;
          const a = m * th - n * nfp * phi;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          const r = R[i * nphi + j];
          const z = Z[i * nphi + j];
          rc += r * c;
          rs += r * sn;
          zc += z * c;
          zs += z * sn;
        }
      }
      const f = m === 0 && n === 0 ? 1 / N : 2 / N;
      const mode: FourierMode = { m, n, rbc: rc * f, zbs: zs * f };
      if (lasym) {
        mode.rbs = rs * f;
        mode.zbc = zc * f;
      }
      if (m === 0 && n === 0) mode.zbs = 0;
      const mag = Math.abs(mode.rbc) + Math.abs(mode.zbs) + Math.abs(mode.rbs ?? 0) + Math.abs(mode.zbc ?? 0);
      if (mag > 1e-12) modes.push(mode);
    }
  }
  return { nfp, lasym, modes };
}

/** Render a VMEC &INDATA namelist (fixed-boundary, vacuum defaults) for the surface. */
export function toVmecInput(s: FourierSurface, opts: { phiedge?: number; title?: string; mpol?: number; ntor?: number } = {}): string {
  const mpol = opts.mpol ?? Math.max(8, ...s.modes.map((m) => m.m + 1));
  const ntor = opts.ntor ?? Math.max(6, ...s.modes.map((m) => Math.abs(m.n)));
  const f = (x: number) => x.toExponential(15).replace('e', 'E');
  const lines = [
    `! ${opts.title ?? 'Generated by Stellarator Studio Lab'}`,
    `! ${new Date().toISOString()}`,
    '&INDATA',
    '  DELT = 0.9,  NITER = 10000,  NSTEP = 200,  TCON0 = 2.0',
    '  NS_ARRAY    = 16 51 101',
    '  NITER_ARRAY = 2000 5000 20000',
    '  FTOL_ARRAY  = 1E-12 1E-13 1E-14',
    `  LASYM = ${s.lasym ? 'T' : 'F'}`,
    `  NFP = ${s.nfp}`,
    `  MPOL = ${mpol}`,
    `  NTOR = ${ntor}`,
    `  PHIEDGE = ${f(opts.phiedge ?? 1)}`,
    '  LFREEB = F',
    "  PMASS_TYPE = 'power_series'",
    '  AM = 0',
    '  NCURR = 1',
    '  CURTOR = 0',
    "  PCURR_TYPE = 'power_series'",
    '  AC = 0',
    '! ----- Boundary (VMEC order: n before m) -----',
  ];
  for (const m of s.modes) {
    let l = `  RBC(${String(m.n).padStart(3)},${String(m.m).padStart(3)}) = ${f(m.rbc)},  ZBS(${String(m.n).padStart(3)},${String(m.m).padStart(3)}) = ${f(m.zbs)}`;
    if (s.lasym)
      l += `,  RBS(${String(m.n).padStart(3)},${String(m.m).padStart(3)}) = ${f(m.rbs ?? 0)},  ZBC(${String(m.n).padStart(3)},${String(m.m).padStart(3)}) = ${f(m.zbc ?? 0)}`;
    lines.push(l);
  }
  lines.push('/');
  return lines.join('\n') + '\n';
}

/** Parse the boundary + NFP/LASYM/PHIEDGE from a VMEC &INDATA namelist. */
export function parseVmecInput(text: string): FourierSurface & { phiedge: number } {
  const clean = text
    .split('\n')
    .map((l) => l.replace(/!.*$/, ''))
    .join('\n');
  const num = (s: string) => Number(s.replace(/[dD]/, 'e'));
  const scalar = (name: string) => {
    const m = clean.match(new RegExp(`\\b${name}\\s*=\\s*([-+0-9.eEdD]+)`, 'i'));
    return m ? num(m[1]) : undefined;
  };
  const lasymM = clean.match(/\bLASYM\s*=\s*([.]?[TtFf][A-Za-z]*[.]?)/i);
  const lasym = lasymM ? /^[.]?t/i.test(lasymM[1]) : false;
  const map = new Map<string, FourierMode>();
  const re = /\b(RBC|ZBS|RBS|ZBC)\s*\(\s*([-+]?\d+)\s*,\s*([-+]?\d+)\s*\)\s*=\s*([-+0-9.eEdD]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const kind = m[1].toLowerCase() as 'rbc' | 'zbs' | 'rbs' | 'zbc';
    const n = Number(m[2]);
    const mm = Number(m[3]);
    const key = `${mm},${n}`;
    if (!map.has(key)) map.set(key, { m: mm, n, rbc: 0, zbs: 0, rbs: 0, zbc: 0 });
    map.get(key)![kind] = num(m[4]);
  }
  const modes = [...map.values()]
    .filter((x) => x.rbc || x.zbs || x.rbs || x.zbc)
    .sort((a, b) => a.m - b.m || a.n - b.n);
  if (!modes.length) throw new Error('No RBC/ZBS boundary coefficients found');
  return { nfp: scalar('NFP') ?? 1, lasym, phiedge: scalar('PHIEDGE') ?? 0, modes };
}

/** Sample the surface on a full-torus grid (for rendering). Returns positions and the (θ,φ) of each vertex. */
export function sampleSurfaceGrid(
  s: FourierSurface,
  ntheta: number,
  nphi: number,
  phiStart = 0,
  phiEnd = 2 * Math.PI,
): { positions: Float32Array; theta: Float32Array; phi: Float32Array; ntheta: number; nphi: number } {
  const positions = new Float32Array((ntheta + 1) * (nphi + 1) * 3);
  const theta = new Float32Array((ntheta + 1) * (nphi + 1));
  const phiA = new Float32Array((ntheta + 1) * (nphi + 1));
  let k = 0;
  for (let j = 0; j <= nphi; j++) {
    const phi = phiStart + ((phiEnd - phiStart) * j) / nphi;
    for (let i = 0; i <= ntheta; i++) {
      const th = (2 * Math.PI * i) / ntheta;
      const [R, Z] = surfaceRZ(s, th, phi);
      positions[3 * k] = R * Math.cos(phi);
      positions[3 * k + 1] = R * Math.sin(phi);
      positions[3 * k + 2] = Z;
      theta[k] = th;
      phiA[k] = phi;
      k++;
    }
  }
  return { positions, theta, phi: phiA, ntheta, nphi };
}

/** Principal curvature quantities at a point (for colour maps). */
export function surfaceCurvatures(s: FourierSurface, theta: number, phi: number): { gaussian: number; mean: number } {
  const p = evalSurface(s, theta, phi);
  const nx = -p.Zt * p.R;
  const ny = p.Zt * p.Rp - p.Rt * p.Zp;
  const nz = p.Rt * p.R;
  const J = Math.hypot(nx, ny, nz);
  const nrm = [nx / J, ny / J, nz / J];
  const rt = [p.Rt, 0, p.Zt];
  const rp = [p.Rp, p.R, p.Zp];
  const rtt = [p.Rtt, 0, p.Ztt];
  const rtp = [p.Rtp, p.Rt, p.Ztp];
  const rpp = [p.Rpp - p.R, 2 * p.Rp, p.Zpp];
  const d = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const E = d(rt, rt),
    F = d(rt, rp),
    G = d(rp, rp),
    L = d(rtt, nrm),
    M = d(rtp, nrm),
    N = d(rpp, nrm);
  const den = E * G - F * F;
  return { gaussian: (L * N - M * M) / den, mean: (E * N - 2 * F * M + G * L) / (2 * den) };
}
