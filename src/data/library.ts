/** Bundled plasma boundaries, coil sets and near-axis presets with provenance. */
import boundariesJson from './generated/boundaries.json';
import coilsetsJson from './generated/coilsets.json';
import nearAxisJson from './generated/nearaxis.json';
import type { FourierSurface } from '@core/geometry/surface';
import type { CoilSetDefinition } from '@core/coils/coils';
import type { QscInput } from '@core/nearAxis/qsc';

export interface BoundaryEntry {
  id: string;
  name: string;
  short: string;
  kind: 'QA' | 'QH' | 'QI' | 'classical' | 'tokamak' | 'other';
  description: string;
  reference: string;
  B0: number;
  surface: FourierSurface;
  phiedge: number;
  coilSetId?: string;
}

const raw = boundariesJson as Record<string, FourierSurface & { phiedge: number; source: string }>;

const META: Omit<BoundaryEntry, 'surface' | 'phiedge'>[] = [
  { id: 'w7x-standard', name: 'Wendelstein 7-X — standard configuration', short: 'W7-X', kind: 'QI', B0: 2.5, coilSetId: 'w7x', description: 'Five-period HELIAS optimised for low neoclassical transport, small bootstrap current and good fast-particle confinement (approximately quasi-isodynamic). ι ≈ 0.86 → 1 with the 5/5 island divertor at the edge.', reference: 'Beidler et al., Fusion Technol. 17 (1990); simsopt test files' },
  { id: 'ncsx-li383', name: 'NCSX — LI383', short: 'NCSX', kind: 'QA', B0: 1.7, coilSetId: 'ncsx', description: 'Compact (A ≈ 4.4) three-period quasi-axisymmetric configuration designed at PPPL; relies on bootstrap current for part of ι.', reference: 'Zarnstorff et al., PPCF 43 (2001) A237' },
  { id: 'landreman-paul-qa', name: 'Landreman–Paul precise QA (nfp = 2, A = 6)', short: 'LP-QA', kind: 'QA', B0: 1, description: 'Vacuum field with quasi-axisymmetry orders of magnitude more precise than previously known; ι ≈ 0.42 with very low shear.', reference: 'Landreman & Paul, PRL 128, 035001 (2022)' },
  { id: 'landreman-paul-qh-reactor', name: 'Landreman–Paul precise QH (nfp = 4), reactor scale', short: 'LP-QH', kind: 'QH', B0: 5.7, description: 'Precisely quasi-helically symmetric vacuum field scaled to reactor size (R ≈ 13.6 m, A = 8).', reference: 'Landreman & Paul, PRL 128, 035001 (2022)' },
  { id: 'nuhrenberg-zille-qhs', name: 'Nührenberg–Zille QHS (nfp = 6)', short: 'NZ-QHS', kind: 'QH', B0: 1, description: 'The first quasi-helically symmetric configuration, discovered numerically in 1988 — the origin of the quasi-symmetry concept.', reference: 'Nührenberg & Zille, Phys. Lett. A 129, 99 (1988)' },
  { id: 'lsp-section-5p3', name: 'Near-axis example without stellarator symmetry', short: 'LSP-5.3', kind: 'QA', B0: 1, description: 'Boundary from the first-order near-axis construction of Landreman, Sengupta & Plunk §5.3 — breaks stellarator symmetry (LASYM = T).', reference: 'Landreman, Sengupta & Plunk, JPP 85, 905850103 (2019)' },
  { id: 'rotating-ellipse', name: 'Rotating ellipse (nfp = 3)', short: 'Ellipse', kind: 'classical', B0: 1, description: 'Textbook configuration: an elliptical cross-section rotating with the field period generates rotational transform without plasma current.', reference: 'Mercier (1964); simsopt test files' },
  { id: 'circular-tokamak', name: 'Circular tokamak (axisymmetric reference)', short: 'Tokamak', kind: 'tokamak', B0: 5, description: 'Axisymmetric reference boundary; useful to contrast with genuinely 3D shapes (no rotational transform without plasma current).', reference: 'simsopt test files' },
];

export const BOUNDARIES: BoundaryEntry[] = META.map((m) => ({
  ...m,
  surface: { nfp: raw[m.id].nfp, lasym: raw[m.id].lasym, modes: raw[m.id].modes },
  phiedge: raw[m.id].phiedge,
}));

export const boundaryById = (id: string) => BOUNDARIES.find((b) => b.id === id);

export interface CoilSetEntry extends CoilSetDefinition {
  id: string;
  name: string;
  axis: { rc: number[]; zs: number[] };
  description: string;
  boundaryId?: string;
  /** suggested field-grid box for tracing */
  box: { Rmin: number; Rmax: number; Zmin: number; Zmax: number };
  presets: { name: string; scale: number[]; note: string }[];
}

const cs = coilsetsJson as unknown as Record<string, CoilSetDefinition & { axis: { rc: number[]; zs: number[] }; labels: string[] }>;

export const COILSETS: CoilSetEntry[] = [
  {
    id: 'w7x',
    name: 'Wendelstein 7-X (70 coils)',
    ...cs.w7x,
    description: '5 non-planar (NPC 1–5) + 2 planar (A, B) coil types per half-period; 108 turns × 15 kA = 1.62 MA-turns per non-planar coil in the standard configuration.',
    boundaryId: 'w7x-standard',
    box: { Rmin: 4.6, Rmax: 6.4, Zmin: -1.1, Zmax: 1.1 },
    presets: [
      { name: 'Standard', scale: [1, 1, 1, 1, 1, 0, 0], note: 'Equal non-planar currents, planar coils off — edge ι = 5/5.' },
      { name: 'High-ι (illustrative)', scale: [1, 1, 1, 1, 1, -0.23, -0.23], note: 'Negative planar-coil currents raise ι towards the 5/4 edge resonance.' },
      { name: 'Low-ι (illustrative)', scale: [1, 1, 1, 1, 1, 0.25, 0.25], note: 'Positive planar-coil currents lower ι towards the 5/6 edge resonance.' },
      { name: 'High-mirror (illustrative)', scale: [1.07, 1.05, 1.0, 0.95, 0.93, 0, 0], note: 'Graded non-planar currents increase the mirror ratio along the axis.' },
    ],
  },
  {
    id: 'ncsx',
    name: 'NCSX modular coils (18)',
    ...cs.ncsx,
    description: 'Three modular-coil types per half-period (TF/PF coils omitted, as in simsopt’s representation).',
    boundaryId: 'ncsx-li383',
    box: { Rmin: 1.0, Rmax: 2.0, Zmin: -0.6, Zmax: 0.6 },
    presets: [{ name: 'Design currents', scale: [1, 1, 1], note: 'Modular coils only — vacuum ι ≈ 0.4.' }],
  },
  {
    id: 'hsx',
    name: 'HSX modular coils (48)',
    ...cs.hsx,
    description: 'Six identical-current modular coils per half-period produce the quasi-helically symmetric field (ι ≈ 1.05).',
    box: { Rmin: 0.95, Rmax: 1.75, Zmin: -0.4, Zmax: 0.4 },
    presets: [{ name: 'QHS', scale: [1, 1, 1, 1, 1, 1], note: 'Quasi-helically symmetric operation.' }],
  },
];

export const coilSetById = (id: string) => COILSETS.find((c) => c.id === id);

export interface NearAxisPreset {
  id: string;
  name: string;
  input: QscInput;
  reference: string;
}

const NA = nearAxisJson as Record<string, QscInput>;

/** Published near-axis configurations (pyQSC Qsc.from_paper; coefficients copied verbatim). */
export const NEAR_AXIS_PRESETS: NearAxisPreset[] = [
  { id: 'r1-5.1', name: 'QA, nfp 3 (LSP 2019 §5.1)', input: { rc: [1, 0.045], zs: [0, -0.045], nfp: 3, etabar: -0.9 }, reference: 'Landreman, Sengupta & Plunk, JPP 85 (2019) §5.1' },
  { id: 'r1-5.2', name: 'QH, nfp 4 (LSP 2019 §5.2)', input: { rc: [1, 0.265], zs: [0, -0.21], nfp: 4, etabar: -2.25 }, reference: 'Landreman, Sengupta & Plunk, JPP 85 (2019) §5.2' },
  { id: 'r1-5.3', name: 'QA, non-stellarator-symmetric (§5.3)', input: { rc: [1, 0.042], zs: [0, -0.042], zc: [0, -0.025], nfp: 3, etabar: -1.1, sigma0: -0.6 }, reference: 'Landreman, Sengupta & Plunk, JPP 85 (2019) §5.3' },
  { id: 'precise-qa', name: 'Precise QA axis (Landreman & Paul 2022)', input: NA['precise QA'], reference: 'Landreman & Paul, PRL 128, 035001 (2022) — pyQSC "precise QA"' },
  { id: 'precise-qh', name: 'Precise QH axis (Landreman & Paul 2022)', input: NA['precise QH'], reference: 'Landreman & Paul, PRL 128, 035001 (2022) — pyQSC "precise QH"' },
  { id: '2022-qa', name: 'QA nfp 2 (Landreman 2022 §5.1)', input: NA['2022 QA'], reference: 'Landreman, JPP 88, 905880616 (2022) §5.1' },
  { id: '2022-qh2', name: 'QH nfp 2 (Landreman 2022 §5.2)', input: NA['2022 QH nfp2'], reference: 'Landreman, JPP 88, 905880616 (2022) §5.2' },
];
