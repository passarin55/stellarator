/// <reference lib="webworker" />
import { computeGridPlanes, gridEvaluator } from '@core/field/grid';
import { findMagneticAxis, traceFieldLines } from '@core/field/fieldlines';
import { solveRegcoil } from '@core/coils/regcoil';
import { storedEnergy, coilForces } from '@core/field/biotSavart';
import type { Coil } from '@core/coils/coils';
import type { WorkerIn, WorkerOut, JobResult } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const { id, job } = ev.data;
  const progress = (fraction: number, stage?: string) => ctx.postMessage({ id, type: 'progress', fraction, stage } satisfies WorkerOut);
  try {
    let result: JobResult;
    const transfer: Transferable[] = [];
    switch (job.kind) {
      case 'gridPlanes': {
        const data = computeGridPlanes(job.coils, job.spec, job.p0, job.p1, progress);
        result = { kind: 'gridPlanes', data };
        transfer.push(data.buffer);
        break;
      }
      case 'axis': {
        const f = gridEvaluator(job.grid);
        result = { kind: 'axis', axis: findMagneticAxis(f, job.guess, job.phi0, job.grid.spec.nfp, job.steps) };
        break;
      }
      case 'trace': {
        const f = gridEvaluator(job.grid);
        const lines = traceFieldLines(f, job.starts, job.opts, progress);
        result = { kind: 'trace', lines };
        break;
      }
      case 'regcoil': {
        result = { kind: 'regcoil', result: solveRegcoil(job.input, (stage, f) => progress(f, stage)) };
        break;
      }
      case 'energy': {
        const coils = job.coils.map((c, i) => ({ ...c, baseIndex: i, label: '' })) as Coil[];
        const e = storedEnergy(coils, job.radius);
        result = { kind: 'energy', energy: e.energy, selfInductance: e.selfInductance };
        break;
      }
      case 'forces': {
        const coils = job.coils.map((c, i) => ({ ...c, baseIndex: i, label: '', flipped: false, period: 0 })) as Coil[];
        const forces = job.indices.map((index, k) => {
          progress(k / job.indices.length);
          return { index, ...coilForces(coils, index) };
        });
        result = { kind: 'forces', forces };
        break;
      }
    }
    ctx.postMessage({ id, type: 'done', result } satisfies WorkerOut, transfer);
  } catch (e) {
    ctx.postMessage({ id, type: 'error', message: e instanceof Error ? e.message : String(e) } satisfies WorkerOut);
  }
};
