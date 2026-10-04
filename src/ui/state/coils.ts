import { useMemo } from 'react';
import { useStore } from './store';
import { coilSetById } from '@data/library';
import { expandCoils, type Coil } from '@core/coils/coils';

/** Coils whose nominal current is zero (e.g. W7-X planar coils) scale relative to the largest current in the set. */
export function scaledCurrents(nominal: number[], scale: number[]): number[] {
  const ref = Math.max(...nominal.map(Math.abs));
  return nominal.map((c, i) => (c !== 0 ? c : ref) * (scale[i] ?? 1));
}

export function useLibraryCoils(id: string): { coils: Coil[]; scale: number[] } {
  const set = coilSetById(id)!;
  const scale = useStore((s) => s.coilCurrentScale[id]) ?? set.presets[0].scale;
  const coils = useMemo(() => expandCoils({ ...set, currents: scaledCurrents(set.currents, scale) }, 128), [set, scale]);
  return { coils, scale };
}

