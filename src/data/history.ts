/** Milestones of stellarator research (sources in REFERENCES). */
export interface Milestone {
  year: string;
  title: string;
  text: string;
  tag: 'history' | 'theory' | 'experiment' | 'industry';
}

export const TIMELINE: Milestone[] = [
  { year: '1951', tag: 'history', title: 'Spitzer invents the stellarator', text: 'On a ski trip to Aspen in March 1951 Lyman Spitzer conceives a figure-eight shaped magnetic bottle; Project Matterhorn starts at Princeton on 1 July 1951.' },
  { year: '1953', tag: 'experiment', title: 'Model A operates', text: 'The tabletop Model A figure-8 stellarator shows that external shaping produces rotational transform; Models B and C follow, Model C demonstrating nested magnetic surfaces.' },
  { year: '1958', tag: 'history', title: 'Declassification', text: 'Fusion research is declassified at the second Atoms for Peace conference in Geneva; stellarators are presented publicly.' },
  { year: '1969', tag: 'history', title: 'The tokamak era begins', text: 'After the Soviet T-3 results, Princeton converts the Model C stellarator into the Symmetric Tokamak; stellarator research continues mainly in Germany, Japan and the USSR.' },
  { year: '1980', tag: 'experiment', title: 'W7-A: current-free plasma', text: 'Wendelstein 7-A shows that a stellarator can confine a hot plasma without any net toroidal current — the key advantage over the tokamak.' },
  { year: '1981', tag: 'theory', title: 'Boozer coordinates', text: 'Allen Boozer introduces magnetic coordinates in which field lines are straight and guiding-centre motion depends only on |B|(ψ, θ, φ).' },
  { year: '1988', tag: 'theory', title: 'Quasi-helical symmetry', text: 'Nührenberg & Zille discover numerically a 3D field whose |B| is helically symmetric in Boozer coordinates — the birth of quasisymmetry.' },
  { year: '1988', tag: 'experiment', title: 'W7-AS starts', text: 'Wendelstein 7-AS, the first stellarator with modular non-planar coils and partial optimisation, begins operation at Garching.' },
  { year: '1991', tag: 'theory', title: 'Garren–Boozer near-axis expansion', text: 'Garren & Boozer show that quasisymmetry can be satisfied exactly to first order near the magnetic axis, but generally not beyond second order.' },
  { year: '1998', tag: 'experiment', title: 'LHD and TJ-II first plasmas', text: 'Japan’s superconducting Large Helical Device and Spain’s TJ-II flexible heliac start operation.' },
  { year: '1999', tag: 'experiment', title: 'HSX first plasma', text: 'The Helically Symmetric eXperiment (Wisconsin) becomes the first quasi-symmetric stellarator to operate.' },
  { year: '2008', tag: 'history', title: 'NCSX cancelled', text: 'The partially built National Compact Stellarator Experiment is cancelled after cost growth driven by tight coil and vessel tolerances — a lesson that shaped modern “simpler coils” research.' },
  { year: '2015', tag: 'experiment', title: 'W7-X first plasma', text: 'Wendelstein 7-X produces its first (helium) plasma on 10 December 2015; first hydrogen plasma follows in February 2016.' },
  { year: '2017', tag: 'theory', title: 'REGCOIL', text: 'Landreman publishes REGCOIL, a regularised current-potential method that computes coil-winding surfaces currents by linear least squares.' },
  { year: '2018', tag: 'experiment', title: 'W7-X validates optimisation', text: 'W7-X reaches stellarator records for the fusion triple product with the island divertor installed, confirming reduced neoclassical transport from optimisation.' },
  { year: '2022', tag: 'theory', title: 'Precise quasisymmetry', text: 'Landreman & Paul find vacuum fields with quasi-axisymmetry and quasi-helical symmetry orders of magnitude more precise than before, overturning the belief that good QS was impossible.' },
  { year: '2023', tag: 'experiment', title: 'W7-X gigajoule discharge; MUSE', text: 'W7-X reaches a 1.3 GJ energy turnover in an 8-minute plasma. PPPL’s MUSE demonstrates a permanent-magnet stellarator.' },
  { year: '2025', tag: 'industry', title: 'Power-plant designs published', text: 'Proxima Fusion publishes Stellaris (QI, 9 T, HTS) and Type One Energy publishes Infinity Two (QI, 800 MW) in peer-reviewed journals; Thea Energy completes the Helios planar-coil preconceptual design.' },
  { year: '2025', tag: 'experiment', title: 'W7-X long-pulse triple-product record', text: 'On 22 May 2025 W7-X sustains a record triple product for 43 s, beating tokamak long-pulse values, and raises the energy turnover to 1.8 GJ over 6 minutes.' },
];

export const GLOSSARY: { term: string; def: string }[] = [
  { term: 'Rotational transform ι', def: 'Average number of poloidal turns a field line makes per toroidal turn (ι = 1/q). In stellarators it is produced by 3D shaping rather than plasma current.' },
  { term: 'Field period (nfp)', def: 'Number of identical toroidal segments of the device (W7-X: 5, LHD: 10, HSX: 4).' },
  { term: 'Stellarator symmetry', def: 'Invariance under (R, φ, Z) → (R, −φ, −Z). Halves the number of independent Fourier coefficients and coil shapes.' },
  { term: 'Flux surface', def: 'Toroidal surface on which field lines lie; nested flux surfaces confine the plasma.' },
  { term: 'Boozer coordinates', def: 'Straight-field-line coordinates in which guiding-centre drifts depend only on |B|(ψ, θ, φ), not on the 3D shape.' },
  { term: 'Quasisymmetry (QA/QH)', def: '|B| depends on a single linear combination Mθ − Nφ in Boozer coordinates; QA: N = 0 (tokamak-like), QH: M = 1, N = nfp.' },
  { term: 'Omnigeneity', def: 'The bounce-averaged radial drift of every trapped particle vanishes; a broader condition than quasisymmetry.' },
  { term: 'Quasi-isodynamic (QI)', def: 'Omnigeneous with poloidally closed |B| contours; allows vanishing bootstrap current. W7-X, Stellaris and Infinity Two follow this route.' },
  { term: 'ε_eff (effective ripple)', def: 'Figure of merit for 1/ν neoclassical transport: χ ∝ ε_eff^{3/2}. Optimised stellarators reach ε_eff ≲ 1 %.' },
  { term: 'Magnetic island', def: 'Chain of nested tubes formed where ι is rational (ι = n/m) and resonant field perturbations exist.' },
  { term: 'Island divertor', def: 'Uses a large edge island chain intersected by target plates to exhaust heat and particles (W7-X: 5/5 standard configuration).' },
  { term: 'Poincaré section', def: 'Puncture points of field lines through a fixed toroidal plane; reveals surfaces, islands and chaos.' },
  { term: 'Greene’s residue', def: 'R = (2 − Tr M)/4 of the linearised one-period map M around a periodic orbit: 0 < R < 1 elliptic (O-point/axis), R < 0 or > 1 hyperbolic (X-point).' },
  { term: 'Near-axis expansion', def: 'Asymptotic expansion of the field in distance from the magnetic axis; gives instant QS designs (Garren & Boozer 1991, pyQSC).' },
  { term: 'Current potential', def: 'Scalar Φ on a winding surface with K = n̂ × ∇Φ; contours of Φ are coil paths (NESCOIL, REGCOIL).' },
  { term: 'ISS04', def: 'International Stellarator Scaling 2004 for the energy confinement time.' },
  { term: 'Sudo limit', def: 'Empirical radiative density limit in stellarators, n_c ∝ (P B / a²R)^{1/2}; unlike tokamaks no disruption follows.' },
  { term: 'Triple product', def: 'n T τ_E; D-T ignition requires ≈ 3×10²¹ keV s m⁻³ near 14 keV.' },
  { term: 'HTS', def: 'High-temperature superconductor (REBCO) tape enabling ~9 T on axis / ~20 T on coil (Stellaris, Infinity Two, Helios).' },
];
