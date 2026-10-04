/**
 * 0-D stellarator power balance ("systems code lite").
 *
 * Profiles:  n(ρ) = n0 (1 − ρ²)^αn,  T(ρ) = T0 (1 − ρ²)^αT  on a torus of
 * volume V = 2π² R a² (ρ = r/a). All volume averages are done by Gauss
 * quadrature in ρ.
 *
 * Energy confinement follows ISS04 (Yamada et al., Nucl. Fusion 45 (2005) 1684):
 *   τE = 0.134 a^2.28 R^0.64 P^−0.61 n̄e^0.54 B^0.84 ι_{2/3}^0.41   [s, m, MW, 10¹⁹ m⁻³, T]
 * times a configuration-dependent renormalisation f_ren (W7-X ≈ 1–1.5 in
 * high performance, reactor designs typically assume 1.5–2 with turbulence
 * optimisation).
 *
 * Density limit: Sudo et al. (Nucl. Fusion 30 (1990) 11):
 *   n_c = 0.25 (P B / (a² R))^0.5   [10²⁰ m⁻³, MW, T, m]
 */
import { reactivity, E_ALPHA, E_DT, KEV } from './fusion';

export interface PlasmaParams {
  R: number; // major radius [m]
  a: number; // minor radius [m]
  B: number; // on-axis field [T]
  iota23: number; // rotational transform at ρ = 2/3
  /** volume-averaged electron density [10²⁰ m⁻³] */
  nAvg: number;
  /** volume-averaged temperature (Te = Ti) [keV] */
  TAvg: number;
  alphaN: number;
  alphaT: number;
  Zeff: number;
  /** DT fuel dilution n_DT / n_e */
  dilution: number;
  /** ISS04 renormalisation factor */
  fRen: number;
  /** auxiliary heating power for the operating point [MW] (optional — if omitted it is solved for) */
  Paux?: number;
  /** fraction of alpha power absorbed */
  alphaAbsorbed?: number;
}

export interface PowerBalance {
  volume: number;
  surface: number;
  n0: number;
  T0: number;
  lineAvgDensity: number; // 10²⁰ m⁻³
  Wth: number; // MJ
  beta: number; // volume averaged ⟨β⟩
  Pfus: number; // MW
  Palpha: number;
  Pneutron: number;
  Pbrems: number;
  Paux: number;
  Pheat: number; // absorbed heating = Palpha + Paux − (nothing)
  tauE: number; // s (required by power balance)
  tauISS04: number; // s (predicted, renormalised)
  H: number; // tauE_required / tauISS04 — must be ≤ 1 for the point to be accessible
  Q: number;
  nSudo: number; // density limit [10²⁰ m⁻³]
  greenwaldLikeFraction: number; // line-avg density / Sudo
  tripleProduct: number; // n0 T0 τE [10²⁰ m⁻³ keV s] → reported as m⁻³ keV s
  neutronWallLoad: number; // MW/m²
  ignited: boolean;
}

const MU0 = 4e-7 * Math.PI;

// 16-point Gauss–Legendre on [0,1]
const GL = (() => {
  const x = [
    -0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003,
    -0.6178762444026438, -0.45801677765722737, -0.2816035507792589, -0.09501250983763744,
  ];
  const w = [
    0.027152459411754096, 0.062253523938647894, 0.09515851168249279, 0.12462897125553388,
    0.14959598881657674, 0.16915651939500254, 0.18260341504492358, 0.1894506104550685,
  ];
  const nodes: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < 8; i++) {
    nodes.push((1 + x[i]) / 2, (1 - x[i]) / 2);
    weights.push(w[i] / 2, w[i] / 2);
  }
  return { nodes, weights };
})();

/** ⟨f⟩ over the torus volume: ∫0¹ f(ρ) 2ρ dρ. */
const volAvg = (f: (rho: number) => number) => {
  let s = 0;
  for (let i = 0; i < GL.nodes.length; i++) {
    const r = GL.nodes[i];
    s += GL.weights[i] * f(r) * 2 * r;
  }
  return s;
};

/** Line average across a diameter: ∫0¹ f(ρ) dρ. */
const lineAvg = (f: (rho: number) => number) => {
  let s = 0;
  for (let i = 0; i < GL.nodes.length; i++) s += GL.weights[i] * f(GL.nodes[i]);
  return s;
};

export function iss04(a: number, R: number, P: number, nLine19: number, B: number, iota23: number): number {
  return 0.134 * a ** 2.28 * R ** 0.64 * P ** -0.61 * nLine19 ** 0.54 * B ** 0.84 * iota23 ** 0.41;
}

export function sudoLimit(P: number, B: number, a: number, R: number): number {
  return 0.25 * Math.sqrt((P * B) / (a * a * R));
}

/** Bremsstrahlung power density [W/m³] for n [m⁻³], T [keV]. */
export const bremsstrahlung = (ne: number, T: number, Zeff: number) => 5.355e-37 * Zeff * ne * ne * Math.sqrt(T);

export function powerBalance(p: PlasmaParams): PowerBalance {
  const { R, a, B, alphaN, alphaT, Zeff, dilution, fRen } = p;
  const fa = p.alphaAbsorbed ?? 1;
  const volume = 2 * Math.PI ** 2 * R * a * a;
  const surface = 4 * Math.PI ** 2 * R * a;
  // peak values from averages: ⟨(1−ρ²)^α⟩ = 1/(1+α)
  const n0 = p.nAvg * (1 + alphaN);
  const T0 = p.TAvg * (1 + alphaT);
  const n = (rho: number) => n0 * 1e20 * (1 - rho * rho) ** alphaN;
  const T = (rho: number) => T0 * (1 - rho * rho) ** alphaT;

  const nLine = lineAvg((r) => n(r)) / 1e20;
  // thermal energy: 3/2 (ne Te + ni Ti) with ni = ne (dilution + impurities ~ 1)
  const ionFrac = dilution + (1 - dilution) / Math.max(1, Zeff); // crude: impurities contribute fewer ions
  const pAvg = volAvg((r) => n(r) * T(r) * KEV * (1 + ionFrac)); // Pa
  const Wth = 1.5 * pAvg * volume; // J
  const beta = (2 * MU0 * pAvg) / (B * B);

  const pfusDens = volAvg((r) => {
    const nDT = n(r) * dilution;
    return 0.25 * nDT * nDT * reactivity(T(r), 'DT') * E_DT;
  });
  const Pfus = (pfusDens * volume) / 1e6;
  const Palpha = Pfus * (E_ALPHA / E_DT);
  const Pneutron = Pfus - Palpha;
  const Pbrems = (volAvg((r) => bremsstrahlung(n(r), T(r), Zeff)) * volume) / 1e6;

  // Steady state: Palpha·fa + Paux = W/τE + Pbrems
  let Paux = p.Paux ?? NaN;
  let tauE: number;
  const P_absorbed = (paux: number) => fa * Palpha + paux;
  if (Number.isNaN(Paux)) {
    // Solve for Paux such that the required τE equals the ISS04 prediction (H = 1).
    // f(Paux) = W/(Pabs − Pbrems) − fRen·τISS04(Pabs); monotone in practice
    const g = (paux: number) => {
      const Pabs = P_absorbed(paux);
      const Ploss = Pabs - Pbrems;
      if (Ploss <= 0) return -1e9;
      const tReq = Wth / 1e6 / Ploss;
      return tReq - fRen * iss04(a, R, Pabs, nLine * 10, B, p.iota23);
    };
    // ignition check (Paux = 0)
    if (g(0) <= 0 && P_absorbed(0) > Pbrems) Paux = 0;
    else {
      let lo = 0;
      let hi = 10;
      while (g(hi) > 0 && hi < 1e6) hi *= 2;
      for (let i = 0; i < 100; i++) {
        const mid = 0.5 * (lo + hi);
        if (g(mid) > 0) lo = mid;
        else hi = mid;
      }
      Paux = hi;
    }
  }
  const Pabs = P_absorbed(Paux);
  tauE = Wth / 1e6 / Math.max(1e-9, Pabs - Pbrems);
  const tauISS = fRen * iss04(a, R, Pabs, nLine * 10, B, p.iota23);
  const nSudo = sudoLimit(Pabs, B, a, R);
  if (!Number.isFinite(tauE)) tauE = 0;
  return {
    volume,
    surface,
    n0,
    T0,
    lineAvgDensity: nLine,
    Wth: Wth / 1e6,
    beta,
    Pfus,
    Palpha,
    Pneutron,
    Pbrems,
    Paux,
    Pheat: Pabs,
    tauE,
    tauISS04: tauISS,
    H: tauE / tauISS,
    Q: Paux > 0 ? Pfus / Paux : Infinity,
    nSudo,
    greenwaldLikeFraction: nLine / nSudo,
    tripleProduct: n0 * 1e20 * T0 * tauE,
    neutronWallLoad: Pneutron / surface,
    ignited: Paux === 0,
  };
}

export interface PopconGrid {
  n: Float64Array; // ⟨n⟩ axis [10²⁰]
  T: Float64Array; // ⟨T⟩ axis [keV]
  Paux: Float64Array; // [iT * nn + in]
  Pfus: Float64Array;
  Q: Float64Array;
  beta: Float64Array;
  sudoFrac: Float64Array;
  wallLoad: Float64Array;
}

/** Plasma OPerating CONtours: solve the power balance on an (⟨n⟩, ⟨T⟩) grid. */
export function popcon(base: Omit<PlasmaParams, 'nAvg' | 'TAvg' | 'Paux'>, nRange: [number, number], TRange: [number, number], nn = 60, nT = 60): PopconGrid {
  const n = new Float64Array(nn);
  const T = new Float64Array(nT);
  for (let i = 0; i < nn; i++) n[i] = nRange[0] + ((nRange[1] - nRange[0]) * i) / (nn - 1);
  for (let j = 0; j < nT; j++) T[j] = TRange[0] + ((TRange[1] - TRange[0]) * j) / (nT - 1);
  const size = nn * nT;
  const out: PopconGrid = {
    n,
    T,
    Paux: new Float64Array(size),
    Pfus: new Float64Array(size),
    Q: new Float64Array(size),
    beta: new Float64Array(size),
    sudoFrac: new Float64Array(size),
    wallLoad: new Float64Array(size),
  };
  for (let j = 0; j < nT; j++)
    for (let i = 0; i < nn; i++) {
      const pb = powerBalance({ ...base, nAvg: n[i], TAvg: T[j] });
      const k = j * nn + i;
      out.Paux[k] = pb.Paux;
      out.Pfus[k] = pb.Pfus;
      out.Q[k] = Math.min(pb.Q, 1e4);
      out.beta[k] = pb.beta;
      out.sudoFrac[k] = pb.greenwaldLikeFraction;
      out.wallLoad[k] = pb.neutronWallLoad;
    }
  return out;
}

/** Lawson ignition requirement n T τE for DT at temperature T (keV), with Bremsstrahlung, flat profiles. */
export function lawsonIgnition(T: number, Zeff = 1): number {
  // ignition: n²/4 ⟨σv⟩ Eα ≥ 3 n T/τE + Cb Zeff n² √T  →  n τE ≥ 3T / (⟨σv⟩Eα/4 − Cb Zeff √T)
  const sv = reactivity(T, 'DT');
  const denom = (sv * E_ALPHA) / 4 - 5.355e-37 * Zeff * Math.sqrt(T);
  if (denom <= 0) return Infinity;
  const nTau = (3 * T * KEV) / denom;
  return nTau * T; // m⁻³ keV s
}

/** Lawson breakeven-type requirement for a given Q (flat profiles, no radiation). */
export function lawsonQ(T: number, Q: number): number {
  const sv = reactivity(T, 'DT');
  // Q = Pfus/Paux, Paux = 3nT/τ − Pα;  Pfus = n²/4 sv Efus  ⇒ nτ = 3T / (sv/4 (Efus/Q + Eα))
  const nTau = (3 * T * KEV) / ((sv / 4) * (E_DT / Q + E_ALPHA));
  return nTau * T;
}
