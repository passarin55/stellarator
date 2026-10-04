/**
 * Plasma formulary (SI units unless stated). Expressions follow the NRL
 * Plasma Formulary (2019 edition) and Wesson, "Tokamaks" (4th ed.), adapted
 * to stellarator usage (ν* uses the helical ripple / 1/ν regime notation).
 */

export const C = {
  e: 1.602176634e-19,
  me: 9.1093837015e-31,
  mp: 1.67262192369e-27,
  eps0: 8.8541878128e-12,
  mu0: 4e-7 * Math.PI,
  kB: 1.380649e-23,
  c: 299792458,
};

export interface FormularyInput {
  ne: number; // m⁻³
  Te: number; // eV
  Ti: number; // eV
  B: number; // T
  /** ion mass number (2.5 for DT) */
  A: number;
  /** ion charge number */
  Zi: number;
  /** major radius [m] (for collisionality) */
  R: number;
  /** rotational transform ι (for connection length) */
  iota: number;
  /** effective helical ripple ε_eff (for the 1/ν regime) */
  epsEff: number;
  /** inverse aspect ratio ε = r/R at the surface of interest */
  eps: number;
}

export interface FormularyOutput {
  [key: string]: { value: number; unit: string; label: string; note?: string };
}

export function coulombLogElectron(ne: number, Te: number): number {
  // NRL: Te < 10 Z² eV vs. above
  return Te < 10 ? 23 - Math.log(Math.sqrt(ne * 1e-6) * Te ** -1.5) : 24 - Math.log(Math.sqrt(ne * 1e-6) / Te);
}

export function formulary(p: FormularyInput): FormularyOutput {
  const { ne, Te, Ti, B, A, Zi, R, iota, epsEff, eps } = p;
  const mi = A * C.mp;
  const ni = ne / Zi;
  const lnL = coulombLogElectron(ne, Te);
  const vte = Math.sqrt((2 * Te * C.e) / C.me);
  const vti = Math.sqrt((2 * Ti * C.e) / mi);
  const wpe = Math.sqrt((ne * C.e * C.e) / (C.eps0 * C.me));
  const wpi = Math.sqrt((ni * (Zi * C.e) ** 2) / (C.eps0 * mi));
  const wce = (C.e * B) / C.me;
  const wci = (Zi * C.e * B) / mi;
  const debye = Math.sqrt((C.eps0 * Te * C.e) / (ne * C.e * C.e));
  const rhoe = (C.me * vte) / (C.e * B) / Math.SQRT2;
  const rhoi = (mi * vti) / (Zi * C.e * B) / Math.SQRT2;
  // Braginskii collision times
  const tauE = (6 * Math.sqrt(2) * Math.PI ** 1.5 * C.eps0 ** 2 * Math.sqrt(C.me) * (Te * C.e) ** 1.5) / (lnL * C.e ** 4 * ni * Zi * Zi);
  const tauI = (12 * Math.PI ** 1.5 * C.eps0 ** 2 * Math.sqrt(mi) * (Ti * C.e) ** 1.5) / (lnL * C.e ** 4 * ni * Zi ** 4);
  const nuEI = 1 / tauE;
  const mfp = vte * tauE;
  const Lc = (2 * Math.PI * R) / Math.max(1e-6, Math.abs(iota));
  // stellarator collisionality: ν* = ν_ei R / (ι v_te ε^{3/2}) (banana-like) and the 1/ν-regime parameter
  const nuStar = (nuEI * R) / (Math.max(1e-6, Math.abs(iota)) * vte * eps ** 1.5);
  const beta = (2 * C.mu0 * (ne * Te + ni * Ti) * C.e) / (B * B);
  const vA = B / Math.sqrt(C.mu0 * ni * mi);
  const spitzerEta = (1.03e-4 * Zi * lnL) / Te ** 1.5; // Ω m (parallel ≈ ⊥/1.96)
  // 1/ν neoclassical electron heat diffusivity (Wakatani / Beidler): χ ≈ (64/9π) (2ε_eff)^{3/2} (T/eB R)² ... /ν
  const vdE = (Te * C.e) / (C.e * B * R); // ∇B drift velocity scale
  const chi1nu = (64 / (9 * Math.PI)) * (2 * epsEff) ** 1.5 * (vdE * vdE) / nuEI;
  return {
    lnL: { value: lnL, unit: '', label: 'Coulomb logarithm ln Λ' },
    debye: { value: debye, unit: 'm', label: 'Debye length λ_D' },
    ND: { value: (4 / 3) * Math.PI * ne * debye ** 3, unit: '', label: 'Particles per Debye sphere N_D' },
    fpe: { value: wpe / (2 * Math.PI), unit: 'Hz', label: 'Electron plasma frequency f_pe' },
    fpi: { value: wpi / (2 * Math.PI), unit: 'Hz', label: 'Ion plasma frequency f_pi' },
    fce: { value: wce / (2 * Math.PI), unit: 'Hz', label: 'Electron cyclotron frequency f_ce', note: 'ECRH: W7-X uses 140 GHz (2nd harmonic X-mode at 2.5 T)' },
    fci: { value: wci / (2 * Math.PI), unit: 'Hz', label: 'Ion cyclotron frequency f_ci' },
    vte: { value: vte, unit: 'm/s', label: 'Electron thermal speed v_te = √(2T/m)' },
    vti: { value: vti, unit: 'm/s', label: 'Ion thermal speed v_ti' },
    rhoe: { value: rhoe, unit: 'm', label: 'Electron Larmor radius ρ_e' },
    rhoi: { value: rhoi, unit: 'm', label: 'Ion Larmor radius ρ_i' },
    vA: { value: vA, unit: 'm/s', label: 'Alfvén speed v_A' },
    tauE: { value: tauE, unit: 's', label: 'Electron collision time τ_e (Braginskii)' },
    tauI: { value: tauI, unit: 's', label: 'Ion collision time τ_i (Braginskii)' },
    mfp: { value: mfp, unit: 'm', label: 'Electron mean free path λ_mfp' },
    Lc: { value: Lc, unit: 'm', label: 'Connection length 2πR/ι' },
    nuStar: { value: nuStar, unit: '', label: 'Collisionality ν* = ν_ei R/(ι v_te ε^{3/2})', note: 'ν* ≪ 1: long-mean-free-path regime where 3D neoclassical transport (1/ν) matters' },
    beta: { value: beta, unit: '', label: 'Plasma beta β = 2μ0 p / B²' },
    eta: { value: spitzerEta, unit: 'Ω·m', label: 'Spitzer resistivity η_⊥' },
    chi1nu: { value: chi1nu, unit: 'm²/s', label: '1/ν-regime electron heat diffusivity χ_e^{1/ν}', note: '∝ ε_eff^{3/2} T^{7/2}: why stellarators must be optimised (ε_eff ≲ 1%)' },
  };
}
