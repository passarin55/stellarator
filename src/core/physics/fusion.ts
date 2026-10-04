/**
 * Thermonuclear reactivities ⟨σv⟩ from the Bosch & Hale parameterisation
 * (Nucl. Fusion 32 (1992) 611, Table VII), valid 0.2–100 keV (D-T, D-D)
 * and 0.5–190 keV (D-³He).
 */

export type Reaction = 'DT' | 'DDn' | 'DDp' | 'DHe3';

interface BHCoeffs {
  BG: number; // Gamow constant [keV^1/2]
  mrc2: number; // reduced mass × c² [keV]
  C: [number, number, number, number, number, number, number];
}

const BH: Record<Reaction, BHCoeffs> = {
  DT: { BG: 34.3827, mrc2: 1124656, C: [1.17302e-9, 1.51361e-2, 7.51886e-2, 4.60643e-3, 1.35e-2, -1.0675e-4, 1.366e-5] },
  DHe3: { BG: 68.7508, mrc2: 1124572, C: [5.51036e-10, 6.41918e-3, -2.02896e-3, -1.9108e-5, 1.35776e-4, 0, 0] },
  DDp: { BG: 31.397, mrc2: 937814, C: [5.65718e-12, 3.41267e-3, 1.99167e-3, 0, 1.05060e-5, 0, 0] },
  DDn: { BG: 31.397, mrc2: 937814, C: [5.43360e-12, 5.85778e-3, 7.68222e-3, 0, -2.964e-6, 0, 0] },
};

/** Energy released per reaction [MeV], and the fraction carried by charged particles. */
export const REACTION_ENERGY: Record<Reaction, { total: number; charged: number; label: string }> = {
  DT: { total: 17.589, charged: 3.52, label: 'D + T → ⁴He (3.52 MeV) + n (14.07 MeV)' },
  DDn: { total: 3.269, charged: 0.82, label: 'D + D → ³He (0.82 MeV) + n (2.45 MeV)' },
  DDp: { total: 4.033, charged: 4.033, label: 'D + D → T (1.01 MeV) + p (3.02 MeV)' },
  DHe3: { total: 18.353, charged: 18.353, label: 'D + ³He → ⁴He (3.6 MeV) + p (14.7 MeV)' },
};

/** ⟨σv⟩ in m³/s at ion temperature T [keV]. */
export function reactivity(T: number, r: Reaction = 'DT'): number {
  if (T <= 0) return 0;
  const { BG, mrc2, C } = BH[r];
  const [C1, C2, C3, C4, C5, C6, C7] = C;
  const theta = T / (1 - (T * (C2 + T * (C4 + T * C6))) / (1 + T * (C3 + T * (C5 + T * C7))));
  const xi = Math.cbrt((BG * BG) / (4 * theta));
  const sv = C1 * theta * Math.sqrt(xi / (mrc2 * T * T * T)) * Math.exp(-3 * xi);
  return sv * 1e-6; // cm³/s → m³/s
}

export const KEV = 1.602176634e-16; // J
export const MEV = 1.602176634e-13; // J
export const E_ALPHA = 3.52 * MEV;
export const E_DT = 17.589 * MEV;
