/**
 * Learn articles. Strings use $…$ (inline) and $$…$$ (display) KaTeX math.
 * Each article links to the lab module that computes what it describes.
 */
export interface Article {
  id: string;
  title: string;
  summary: string;
  lab?: { label: string; href: string };
  sections: { h: string; body: string[] }[];
}

export const ARTICLES: Article[] = [
  {
    id: 'why',
    title: '1 · Why stellarators?',
    summary: 'Confining a plasma with a twisted 3D field instead of a plasma current.',
    lab: { label: 'Open the Configuration Studio', href: '#/studio' },
    sections: [
      {
        h: 'The confinement problem',
        body: [
          'A purely toroidal field $\\mathbf B = B_0 R_0/R\\,\\hat{\\boldsymbol\\phi}$ cannot confine a plasma: its gradient and curvature cause vertical drifts of opposite sign for ions and electrons, the resulting charge separation creates an electric field, and the $\\mathbf E\\times\\mathbf B$ drift pushes the whole plasma outward.',
          'The cure is to twist the field lines so that each line samples the top and bottom of the torus. The amount of twist is the rotational transform $\\iota$ — the number of poloidal turns per toroidal turn (tokamak physicists use $q = 1/\\iota$).',
        ],
      },
      {
        h: 'Two ways to twist',
        body: [
          'A tokamak drives a large toroidal plasma current (MA-level) whose poloidal field supplies $\\iota$. This is simple and axisymmetric, but the current is a source of free energy for disruptions, needs continuous current drive for steady state, and couples the magnetic geometry to the plasma state.',
          'A stellarator produces $\\iota$ with external coils by making the magnetic axis non-planar (torsion $\\tau$), rotating an elongated cross-section, or both. Mercier (1964) showed that exactly three ingredients generate the on-axis transform: axis torsion, rotation of the elongated flux-surface ellipse, and the on-axis current density. Stellarators use the first two; the near-axis article gives the exact relation (the $\\sigma$-equation) that the Near-Axis Designer solves.',
          'The price is genuinely three-dimensional geometry: 3D plasma shapes, non-planar coils and — without care — poor confinement of trapped particles. Modern optimisation addresses exactly this.',
        ],
      },
      {
        h: 'What you gain',
        body: [
          'No disruptions from a current quench, inherently steady-state operation, no need for current drive (low recirculating power), and density limits that are soft (radiative) rather than disruptive. W7-X’s 43-second record triple product in 2025 and its 1.8 GJ, 6-minute discharge show these advantages experimentally.',
        ],
      },
    ],
  },
  {
    id: 'geometry',
    title: '2 · Magnetic geometry & Fourier boundaries',
    summary: 'Flux surfaces, field periods, stellarator symmetry and the VMEC representation.',
    lab: { label: 'Edit Fourier modes in the Studio', href: '#/studio' },
    sections: [
      {
        h: 'Flux surfaces and field periods',
        body: [
          'In a good stellarator field lines trace out nested toroidal flux surfaces labelled by the toroidal flux $\\psi$ (or $s = \\psi/\\psi_{edge}$). The geometry repeats $n_{fp}$ times around the torus (W7-X $n_{fp}=5$, LHD $10$, HSX $4$).',
          'Stellarator symmetry is the extra invariance $(R,\\phi,Z)\\to(R,-\\phi,-Z)$; it halves the number of distinct coils (W7-X: 70 coils, 7 distinct shapes) and the number of Fourier coefficients.',
        ],
      },
      {
        h: 'The VMEC boundary representation',
        body: [
          'The plasma boundary is written as a double Fourier series in a poloidal angle $\\theta$ and the cylindrical angle $\\phi$:',
          '$$R(\\theta,\\phi)=\\sum_{m,n} R^{c}_{mn}\\cos(m\\theta-n\\,n_{fp}\\phi),\\qquad Z(\\theta,\\phi)=\\sum_{m,n} Z^{s}_{mn}\\sin(m\\theta-n\\,n_{fp}\\phi).$$',
          '$R_{00}$ is the major radius; $R_{10}, Z_{10}$ set the minor radius; $(m,n)=(1,1)$ terms rotate an elongated section with the field period; $(0,1)$ terms move the axis and give it torsion. Non-stellarator-symmetric shapes add $R^s_{mn}$, $Z^c_{mn}$ (VMEC’s LASYM).',
          'The Studio computes the volume by the divergence theorem, $V = \\int d\\phi\\oint \\tfrac12 R^2\\,dZ$, the area from $|\\mathbf r_\\theta\\times\\mathbf r_\\phi|$, the effective minor radius $a=\\sqrt{\\bar A/\\pi}$ from the mean cross-section $\\bar A$, and $R = V/(2\\pi\\bar A)$ — the same definitions as VMEC and simsopt (the test-suite checks agreement to 7 digits for W7-X, NCSX and the Landreman–Paul fields).',
        ],
      },
      {
        h: 'Curvature and 3D shaping',
        body: [
          'Principal curvatures follow from the first and second fundamental forms $(E,F,G)$ and $(L,M,N)$: Gaussian curvature $K=(LN-M^2)/(EG-F^2)$, mean curvature $H=(EN-2FM+GL)/2(EG-F^2)$. Strongly negative-$K$ regions (saddles) and high $|\\kappa|$ are hard to reach with coils — a useful proxy for engineering difficulty.',
        ],
      },
    ],
  },
  {
    id: 'symmetry',
    title: '3 · Boozer coordinates, quasisymmetry & omnigeneity',
    summary: 'Why only |B| matters for guiding-centre confinement, and the three optimisation families QA, QH and QI.',
    lab: { label: 'Design a QS field in the Near-Axis Designer', href: '#/near-axis' },
    sections: [
      {
        h: 'Boozer coordinates',
        body: [
          'In Boozer coordinates $(\\psi,\\theta_B,\\varphi_B)$ field lines are straight, $\\theta_B - \\iota\\varphi_B = $ const, and the covariant field takes the simple form $\\mathbf B = G(\\psi)\\nabla\\varphi_B + I(\\psi)\\nabla\\theta_B + K\\nabla\\psi$.',
          'Boozer’s key observation: the guiding-centre drift equations depend on the geometry only through $B(\\psi,\\theta_B,\\varphi_B)$. Two fields with the same $|B|$ spectrum confine particles identically, regardless of how different their 3D shapes look.',
        ],
      },
      {
        h: 'Quasisymmetry',
        body: [
          'A field is quasisymmetric if $$B = B(\\psi,\\; M\\theta_B - N\\varphi_B).$$ Then there is a conserved canonical momentum, just like toroidal angular momentum in a tokamak, and collisionless orbits are confined. $N=0$ is quasi-axisymmetry (QA; NCSX, CFQS, MUSE, Helios); $M=1, N=n_{fp}$ is quasi-helical symmetry (QH; HSX).',
          'Garren & Boozer (1991) showed that QS can be imposed exactly only to second order near the axis in general, which long suggested it was approximate at best. Landreman & Paul (2022) nevertheless found vacuum fields with QS errors of order $10^{-5}$ over the whole volume.',
        ],
      },
      {
        h: 'Omnigeneity and quasi-isodynamicity',
        body: [
          'A weaker requirement is omnigeneity: the bounce-averaged radial drift vanishes for all trapped particles, $\\langle \\mathbf v_d\\cdot\\nabla\\psi\\rangle_b = 0$. Quasi-isodynamic (QI) fields are omnigeneous with $|B|$ contours that close poloidally; they can have zero bootstrap current, so $\\iota$ is unaffected by the plasma pressure — ideal for an island divertor.',
          'W7-X approximates QI; Stellaris and Infinity Two are QI power-plant designs.',
        ],
      },
      {
        h: 'Why it matters: the 1/ν regime',
        body: [
          'In a non-optimised 3D field, ripple-trapped particles drift radially between collisions, giving a heat diffusivity that *increases* as collisions decrease: $$\\chi^{1/\\nu} \\propto \\epsilon_{\\mathrm{eff}}^{3/2}\\,\\frac{v_d^2}{\\nu} \\propto \\epsilon_{\\mathrm{eff}}^{3/2}\\frac{T^{7/2}}{n\\,B^2R^2}.$$ At reactor temperatures this would be catastrophic unless the effective ripple $\\epsilon_{\\mathrm{eff}}$ is ≲ 1 %. The Formulary page evaluates this estimate.',
        ],
      },
    ],
  },
  {
    id: 'near-axis',
    title: '4 · The near-axis expansion',
    summary: 'Instant quasisymmetric designs from the shape of the magnetic axis.',
    lab: { label: 'Open the Near-Axis Designer', href: '#/near-axis' },
    sections: [
      {
        h: 'Expansion about the axis',
        body: [
          'Expand position and field in the distance $r$ from the magnetic axis $\\mathbf r_0(\\varphi)$ using the Frenet frame $(\\mathbf t,\\mathbf n,\\mathbf b)$ with curvature $\\kappa$ and torsion $\\tau$: $$\\mathbf r = \\mathbf r_0 + r\\,[X_1\\mathbf n + Y_1\\mathbf b] + O(r^2),\\qquad B = B_0\\,[1 + r\\bar\\eta\\cos(\\theta - N\\varphi)] + O(r^2).$$ Quasisymmetry at first order requires $X_1 = (\\bar\\eta/\\kappa)\\cos\\vartheta$ and $Y_1 = (s_G s_\\psi\\kappa/\\bar\\eta)[\\sin\\vartheta + \\sigma(\\varphi)\\cos\\vartheta]$.',
        ],
      },
      {
        h: 'The σ-equation',
        body: [
          'Self-consistency gives a Riccati equation for $\\sigma(\\varphi)$ and the on-axis transform $\\iota_0$ (Landreman & Sengupta 2018): $$\\frac{d\\sigma}{d\\varphi} + (\\iota_0 - N)\\left[\\frac{\\bar\\eta^4}{\\kappa^4} + 1 + \\sigma^2\\right] - \\frac{2\\bar\\eta^2}{\\kappa^2}\\left[\\frac{I_2}{B_0} - s_\\psi\\tau\\right]\\frac{G_0}{B_0} = 0,$$ with periodic $\\sigma$ and $\\sigma(0)=\\sigma_0$ ($=0$ for stellarator symmetry). The lab solves it with a spectral differentiation matrix and Newton’s method — a port of pyQSC that reproduces its $\\iota$ to 10⁻⁹.',
          'The integer $N$ (helicity) counts how many times the normal vector $\\mathbf n$ rotates poloidally around the axis per field period: $N=0$ gives QA, $N\\neq 0$ QH. Torsion and a rotating normal both drive $\\iota$.',
        ],
      },
      {
        h: 'Figures of merit',
        body: [
          'The first-order cross-section is an ellipse whose elongation the lab reports (large elongation ⇒ hard-to-build coils). The $\\nabla\\mathbf B$ tensor gives the scale length $L_{\\nabla B} = B\\sqrt{2/\\|\\nabla\\mathbf B\\|^2_F}$ (Landreman 2021); a small $L_{\\nabla B}$ means coils must sit close to the plasma.',
        ],
      },
    ],
  },
  {
    id: 'coils',
    title: '5 · Coils: Biot–Savart, REGCOIL & engineering',
    summary: 'From a plasma boundary to buildable coils.',
    lab: { label: 'Open the Coil Lab', href: '#/coils' },
    sections: [
      {
        h: 'Filamentary Biot–Savart',
        body: [
          'Coils are represented as closed polylines. A straight segment from $\\mathbf a$ to $\\mathbf b$ carrying current $I$ contributes exactly (Hanson & Hirshman 2002) $$\\mathbf B = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{|\\mathbf R_i|+|\\mathbf R_f|}{|\\mathbf R_i||\\mathbf R_f|\\,(|\\mathbf R_i||\\mathbf R_f| + \\mathbf R_i\\cdot\\mathbf R_f)}\\;\\mathbf R_i\\times\\mathbf R_f,$$ $\\mathbf R_i = \\mathbf x-\\mathbf a$, $\\mathbf R_f=\\mathbf x-\\mathbf b$. The lab’s implementation matches simsopt’s Biot–Savart for the W7-X, NCSX and HSX coil sets to better than 10⁻⁴.',
        ],
      },
      {
        h: 'Current potential and REGCOIL',
        body: [
          'Place a sheet current on a winding surface around the plasma, $\\mathbf K = \\hat{\\mathbf n}\\times\\nabla\\Phi$, with $$\\Phi = \\Phi_{sv}(\\theta,\\zeta) + \\frac{G\\zeta}{2\\pi} + \\frac{I\\theta}{2\\pi},$$ where $G$ is the net poloidal current that produces the toroidal field ($B_0 \\approx \\mu_0 G/2\\pi R$). $B_n$ on the plasma is linear in the Fourier coefficients of $\\Phi_{sv}$, so minimising $$\\chi^2 = \\int_{plasma} B_n^2\\,dA + \\lambda\\int_{coil}|\\mathbf K|^2 dA$$ is a linear least-squares problem (Landreman 2017). Large $\\lambda$ gives simpler, weaker currents at the cost of field accuracy.',
          'Contours of the total potential $\\Phi_{sv}+G\\zeta/2\\pi$ at equally spaced levels are the coil paths; each discrete coil carries $G/N_{coils}$. The lab then traces field lines through the field of those cut coils to verify that flux surfaces survive.',
        ],
      },
      {
        h: 'Engineering metrics',
        body: [
          'Coil length, curvature (bending strain of superconductor), coil–coil and coil–plasma distance (space for blanket and shield), Lorentz forces $d\\mathbf F/d\\ell = I\\,\\hat{\\mathbf t}\\times\\mathbf B$ and stored energy $W=\\tfrac12\\sum_{ij} M_{ij}I_iI_j$. Self-inductance uses the regularised Neumann formula $L=\\frac{\\mu_0}{4\\pi}\\oint\\oint\\frac{d\\boldsymbol\\ell\\cdot d\\boldsymbol\\ell\'}{\\sqrt{|\\mathbf r-\\mathbf r\'|^2+a^2/\\sqrt e}}$; for the W7-X set the lab gives ≈ 540 MJ, consistent with the ≈ 600 MJ engineering value.',
        ],
      },
    ],
  },
  {
    id: 'fieldlines',
    title: '6 · Field lines, Poincaré maps, islands & chaos',
    summary: 'How the Field Lab measures ι and finds the magnetic axis.',
    lab: { label: 'Open the Field-Line Lab', href: '#/field' },
    sections: [
      {
        h: 'Field-line equations',
        body: [
          'Using the toroidal angle as time, $$\\frac{dR}{d\\phi} = \\frac{R B_R}{B_\\phi},\\qquad \\frac{dZ}{d\\phi} = \\frac{RB_Z}{B_\\phi},$$ integrated with RK4 through a precomputed cylindrical field grid (an in-browser “mgrid”) using tricubic interpolation; the grid is built in parallel Web Workers.',
        ],
      },
      {
        h: 'Poincaré maps and the axis',
        body: [
          'Recording the puncture points every field period gives a Poincaré section: closed curves are flux surfaces, chains of islands appear at rational $\\iota = n/m$, and scattered points mark stochastic regions. The magnetic axis is the fixed point of the one-period map $P(R,Z)$, found by Newton iteration on $P(\\mathbf x)-\\mathbf x=0$.',
          'The eigenvalues of the linearised map $M=\\partial P/\\partial\\mathbf x$ are $e^{\\pm 2\\pi i\\,\\iota_0/n_{fp}}$ for an elliptic axis; Greene’s residue $\\mathcal R=(2-\\mathrm{Tr}M)/4$ lies in $(0,1)$.',
        ],
      },
      {
        h: 'Measuring ι',
        body: [
          'The axis is traced together with every field line so the poloidal angle $\\theta=\\arctan[(Z-Z_0)/(R-R_0)]$ can be unwrapped continuously; then $\\iota = \\Delta\\theta/\\Delta\\phi$. For the W7-X standard configuration the lab finds $\\iota\\approx 0.857$ on axis rising to ≈ 0.96 before the 5/5 island chain; switching on the planar coils moves the edge towards 5/4 or 5/6, exactly the high-/low-ι configurations used on the device.',
        ],
      },
    ],
  },
  {
    id: 'reactor',
    title: '7 · Confinement scaling & reactor power balance',
    summary: 'ISS04, density limits, Lawson and POPCONs for stellarator power plants.',
    lab: { label: 'Open the Reactor Studio', href: '#/reactor' },
    sections: [
      {
        h: 'Empirical confinement',
        body: [
          'The International Stellarator Scaling (Yamada et al. 2005) fits the stellarator database as $$\\tau_E^{ISS04} = 0.134\\,a^{2.28}R^{0.64}P^{-0.61}\\bar n_e^{0.54}B^{0.84}\\iota_{2/3}^{0.41}$$ (s, m, MW, $10^{19}\\,\\mathrm{m^{-3}}$, T). A configuration factor $f_{ren}$ multiplies it; optimised designs assume $f_{ren}\\approx 1.5$–2.',
          'The density limit is radiative (Sudo 1990): $n_c = 0.25\\sqrt{PB/(a^2R)}$ in $10^{20}\\,\\mathrm{m^{-3}}$ — it scales with heating power, so a burning plasma can run at high density.',
        ],
      },
      {
        h: 'Power balance',
        body: [
          'At steady state $P_\\alpha + P_{aux} = W/\\tau_E + P_{brems}$, with $P_{fus} = \\int \\tfrac14 n_{DT}^2\\langle\\sigma v\\rangle E_{DT}\\,dV$ using the Bosch–Hale reactivity. Solving for the auxiliary power that makes the required $\\tau_E$ equal to the scaling on a grid of $(\\langle n\\rangle,\\langle T\\rangle)$ produces a POPCON: contours of $P_{aux}$, $P_{fus}$, $Q$, $\\beta$ and the density limit fraction.',
          'Ignition requires $nT\\tau_E \\gtrsim 3\\times10^{21}\\,\\mathrm{keV\\,s\\,m^{-3}}$ near 14 keV (Lawson). The Reactor Studio ships presets for W7-X, Stellaris, Infinity Two and Helios parameters.',
        ],
      },
    ],
  },
];
