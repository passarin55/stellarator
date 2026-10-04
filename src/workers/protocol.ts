/** Typed message protocol between the UI thread and compute workers. */
import type { GridSpec } from '@core/field/grid';
import type { TraceOptions, TracedLine, AxisResult } from '@core/field/fieldlines';
import type { RegcoilInput, RegcoilResult } from '@core/coils/regcoil';

export interface PackedCoilsMsg {
  a: Float64Array;
  b: Float64Array;
  k: Float64Array;
  nseg: number;
}

export type Job =
  | { kind: 'gridPlanes'; coils: PackedCoilsMsg; spec: GridSpec; p0: number; p1: number }
  | { kind: 'axis'; grid: { spec: GridSpec; data: Float64Array }; guess: { R: number; Z: number }; phi0: number; steps: number }
  | { kind: 'trace'; grid: { spec: GridSpec; data: Float64Array }; starts: { R: number; Z: number }[]; opts: TraceOptions }
  | { kind: 'regcoil'; input: RegcoilInput }
  | { kind: 'energy'; coils: { points: Float64Array; current: number; period: number; flipped: boolean }[]; radius: number }
  | { kind: 'forces'; coils: { points: Float64Array; current: number }[]; indices: number[] };

export type JobResult =
  | { kind: 'gridPlanes'; data: Float64Array }
  | { kind: 'axis'; axis: AxisResult }
  | { kind: 'trace'; lines: TracedLine[] }
  | { kind: 'regcoil'; result: RegcoilResult }
  | { kind: 'energy'; energy: number; selfInductance: number[] }
  | { kind: 'forces'; forces: { index: number; maxForcePerLength: number; netForce: [number, number, number] }[] };

export type WorkerIn = { id: number; job: Job };
export type WorkerOut =
  | { id: number; type: 'progress'; fraction: number; stage?: string }
  | { id: number; type: 'done'; result: JobResult }
  | { id: number; type: 'error'; message: string };
