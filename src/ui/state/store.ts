/**
 * Minimal, typed global store built on useSyncExternalStore.
 *
 * Holds the *project*: the active plasma boundary, the active coil set and
 * cross-page artefacts (e.g. coils synthesised by REGCOIL that the Field Lab
 * can trace). Serialisable parts persist to localStorage and can be exported
 * as a project file.
 */
import { useSyncExternalStore } from 'react';
import type { FourierSurface } from '@core/geometry/surface';
import type { Coil } from '@core/coils/coils';

export interface ActiveBoundary {
  id: string; // library id or 'custom:…'
  name: string;
  surface: FourierSurface;
  /** where it came from: library | near-axis | edited | imported */
  origin: 'library' | 'near-axis' | 'edited' | 'imported';
  /** nominal on-axis field [T] used for scaling coil currents */
  B0: number;
}

export interface SynthesizedCoils {
  name: string;
  nfp: number;
  coils: Coil[];
  createdAt: number;
  boundaryId: string;
}

export interface ProjectState {
  boundary: ActiveBoundary | null;
  /** library coil-set id or 'synth' */
  coilSetId: string;
  /** current multipliers per base coil (library coil sets) */
  coilCurrentScale: Record<string, number[]>;
  synthesized: SynthesizedCoils | null;
  theme: 'system' | 'light' | 'dark';
  ui: { sidebarOpen: boolean; paletteOpen: boolean };
  toasts: { id: number; text: string; kind: 'info' | 'error' }[];
}

const PERSIST_KEY = 'stellarator-studio-lab/v1';

const initial: ProjectState = {
  boundary: null,
  coilSetId: 'w7x',
  coilCurrentScale: {},
  synthesized: null,
  theme: 'system',
  ui: { sidebarOpen: false, paletteOpen: false },
  toasts: [],
};

function load(): ProjectState {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return initial;
    const p = JSON.parse(raw);
    return { ...initial, ...p, synthesized: null, ui: initial.ui, toasts: [] };
  } catch {
    return initial;
  }
}

let state: ProjectState = typeof window === 'undefined' ? initial : load();
const listeners = new Set<() => void>();

function persist() {
  try {
    const { boundary, coilSetId, coilCurrentScale, theme } = state;
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ boundary, coilSetId, coilCurrentScale, theme }));
  } catch {
    /* storage may be unavailable (private mode) — the app works without it */
  }
}

export const store = {
  get: () => state,
  set(patch: Partial<ProjectState> | ((s: ProjectState) => Partial<ProjectState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    persist();
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useStore<T>(selector: (s: ProjectState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state), () => selector(initial));
}

let toastId = 0;
export function toast(text: string, kind: 'info' | 'error' = 'info') {
  const id = ++toastId;
  store.set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
}

export function exportProject(): string {
  const { boundary, coilSetId, coilCurrentScale, synthesized } = state;
  return JSON.stringify(
    {
      format: 'stellarator-studio-lab/project',
      version: 1,
      savedAt: new Date().toISOString(),
      boundary,
      coilSetId,
      coilCurrentScale,
      synthesized: synthesized
        ? { ...synthesized, coils: synthesized.coils.map((c) => ({ ...c, points: Array.from(c.points) })) }
        : null,
    },
    null,
    1,
  );
}

export function importProject(text: string) {
  const p = JSON.parse(text);
  if (p.format !== 'stellarator-studio-lab/project') throw new Error('Not a Stellarator Studio Lab project file');
  store.set({
    boundary: p.boundary ?? null,
    coilSetId: p.coilSetId ?? 'w7x',
    coilCurrentScale: p.coilCurrentScale ?? {},
    synthesized: p.synthesized
      ? { ...p.synthesized, coils: p.synthesized.coils.map((c: Coil & { points: number[] }) => ({ ...c, points: Float64Array.from(c.points) })) }
      : null,
  });
}
