import { useEffect } from 'react';
import { store, useStore, type ActiveBoundary } from './store';
import { BOUNDARIES, boundaryById } from '@data/library';
import type { FourierSurface } from '@core/geometry/surface';

export const DEFAULT_BOUNDARY_ID = 'w7x-standard';

export function libraryBoundary(id: string): ActiveBoundary {
  const b = boundaryById(id) ?? BOUNDARIES[0];
  return { id: b.id, name: b.name, surface: b.surface, origin: 'library', B0: b.B0 };
}

export function setBoundary(b: ActiveBoundary) {
  store.set({ boundary: b });
}

export function setCustomBoundary(name: string, surface: FourierSurface, origin: ActiveBoundary['origin'], B0 = 1) {
  store.set({ boundary: { id: `custom:${Date.now()}`, name, surface, origin, B0 } });
}

/** Active boundary (falls back to W7-X). Honors ?b=<library id> in the hash URL. */
export function useActiveBoundary(queryId?: string | null): ActiveBoundary {
  const b = useStore((s) => s.boundary);
  useEffect(() => {
    if (queryId && boundaryById(queryId) && b?.id !== queryId) setBoundary(libraryBoundary(queryId));
  }, [queryId, b?.id]);
  return b ?? libraryBoundary(DEFAULT_BOUNDARY_ID);
}
