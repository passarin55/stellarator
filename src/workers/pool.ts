/**
 * A small work-stealing pool of compute workers with progress reporting and
 * cancellation. Jobs are queued and dispatched to idle workers; cancelling a
 * batch terminates the workers running it (the pool respawns them lazily).
 */
import type { Job, JobResult, WorkerIn, WorkerOut } from './protocol';
import type { GridSpec, FieldGrid } from '@core/field/grid';
import type { PackedCoils } from '@core/field/biotSavart';
import type { TraceOptions, TracedLine, AxisResult } from '@core/field/fieldlines';
import type { RegcoilInput, RegcoilResult } from '@core/coils/regcoil';

interface Pending {
  id: number;
  job: Job;
  transfer: Transferable[];
  resolve: (r: JobResult) => void;
  reject: (e: Error) => void;
  onProgress?: (f: number, stage?: string) => void;
  token: CancelToken;
}

export class CancelToken {
  cancelled = false;
  private cbs: (() => void)[] = [];
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.cbs.forEach((c) => c());
  }
  onCancel(cb: () => void) {
    this.cbs.push(cb);
  }
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

class WorkerPool {
  private workers: { w: Worker; busy: Pending | null }[] = [];
  private queue: Pending[] = [];
  private nextId = 1;
  readonly size: number;

  constructor() {
    const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(8, hc - 1));
  }

  private spawn() {
    const w = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
    const slot = { w, busy: null as Pending | null };
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data;
      const p = slot.busy;
      if (!p || p.id !== msg.id) return;
      if (msg.type === 'progress') p.onProgress?.(msg.fraction, msg.stage);
      else {
        slot.busy = null;
        if (msg.type === 'done') p.resolve(msg.result);
        else p.reject(new Error(msg.message));
        this.pump();
      }
    };
    w.onerror = (e) => {
      const p = slot.busy;
      slot.busy = null;
      p?.reject(new Error(e.message || 'worker error'));
      this.pump();
    };
    this.workers.push(slot);
    return slot;
  }

  private pump() {
    while (this.queue.length) {
      let slot = this.workers.find((s) => !s.busy);
      if (!slot && this.workers.length < this.size) slot = this.spawn();
      if (!slot) return;
      const p = this.queue.shift()!;
      if (p.token.cancelled) {
        p.reject(new CancelledError());
        continue;
      }
      slot.busy = p;
      slot.w.postMessage({ id: p.id, job: p.job } satisfies WorkerIn, p.transfer);
    }
  }

  run(job: Job, opts: { transfer?: Transferable[]; onProgress?: (f: number, stage?: string) => void; token?: CancelToken } = {}): Promise<JobResult> {
    const token = opts.token ?? new CancelToken();
    return new Promise((resolve, reject) => {
      const p: Pending = { id: this.nextId++, job, transfer: opts.transfer ?? [], resolve, reject, onProgress: opts.onProgress, token };
      token.onCancel(() => {
        const qi = this.queue.indexOf(p);
        if (qi >= 0) {
          this.queue.splice(qi, 1);
          reject(new CancelledError());
          return;
        }
        const slot = this.workers.find((s) => s.busy === p);
        if (slot) {
          slot.w.terminate();
          this.workers.splice(this.workers.indexOf(slot), 1);
          reject(new CancelledError());
          this.pump();
        }
      });
      this.queue.push(p);
      this.pump();
    });
  }
}

let pool: WorkerPool | null = null;
export const getPool = () => (pool ??= new WorkerPool());

// ---------------------------------------------------------------------------
// High-level, parallel operations
// ---------------------------------------------------------------------------

export async function buildFieldGridParallel(
  pc: PackedCoils,
  spec: GridSpec,
  onProgress?: (f: number) => void,
  token?: CancelToken,
): Promise<FieldGrid> {
  const P = getPool();
  const chunks = Math.min(spec.nPhi, P.size * 2);
  const per = Math.ceil(spec.nPhi / chunks);
  const prog = new Float64Array(chunks);
  const report = () => onProgress?.(prog.reduce((a, b) => a + b, 0) / chunks);
  const jobs: Promise<{ p0: number; data: Float64Array }>[] = [];
  for (let c = 0; c < chunks; c++) {
    const p0 = c * per;
    const p1 = Math.min(spec.nPhi, p0 + per);
    if (p0 >= p1) continue;
    jobs.push(
      P.run(
        { kind: 'gridPlanes', coils: { a: pc.a, b: pc.b, k: pc.k, nseg: pc.nseg }, spec, p0, p1 },
        {
          token,
          onProgress: (f) => {
            prog[c] = f;
            report();
          },
        },
      ).then((r) => ({ p0, data: (r as Extract<JobResult, { kind: 'gridPlanes' }>).data })),
    );
  }
  const parts = await Promise.all(jobs);
  const data = new Float64Array(spec.nPhi * spec.nZ * spec.nR * 3);
  const plane = spec.nZ * spec.nR * 3;
  for (const { p0, data: d } of parts) data.set(d, p0 * plane);
  return { spec, data };
}

export async function findAxisInWorker(grid: FieldGrid, guess: { R: number; Z: number }, phi0: number, steps: number, token?: CancelToken): Promise<AxisResult> {
  const r = await getPool().run({ kind: 'axis', grid, guess, phi0, steps }, { token });
  return (r as Extract<JobResult, { kind: 'axis' }>).axis;
}

export async function traceParallel(
  grid: FieldGrid,
  starts: { R: number; Z: number }[],
  opts: TraceOptions,
  onProgress?: (f: number) => void,
  token?: CancelToken,
): Promise<TracedLine[]> {
  const P = getPool();
  const n = Math.min(starts.length, P.size);
  const groups: { R: number; Z: number }[][] = Array.from({ length: n }, () => []);
  const index: number[][] = Array.from({ length: n }, () => []);
  starts.forEach((s, i) => {
    groups[i % n].push(s);
    index[i % n].push(i);
  });
  const prog = new Float64Array(n);
  const results = await Promise.all(
    groups.map((g, k) =>
      P.run(
        { kind: 'trace', grid, starts: g, opts },
        {
          token,
          onProgress: (f) => {
            prog[k] = f;
            onProgress?.(prog.reduce((a, b) => a + b, 0) / n);
          },
        },
      ),
    ),
  );
  const out: TracedLine[] = new Array(starts.length);
  results.forEach((r, k) => (r as Extract<JobResult, { kind: 'trace' }>).lines.forEach((l, j) => (out[index[k][j]] = l)));
  return out;
}

export async function regcoilInWorker(input: RegcoilInput, onProgress?: (f: number, stage?: string) => void, token?: CancelToken): Promise<RegcoilResult> {
  const r = await getPool().run({ kind: 'regcoil', input }, { onProgress, token });
  return (r as Extract<JobResult, { kind: 'regcoil' }>).result;
}

export async function energyInWorker(coils: { points: Float64Array; current: number; period: number; flipped: boolean }[], radius: number) {
  const r = await getPool().run({ kind: 'energy', coils, radius });
  return r as Extract<JobResult, { kind: 'energy' }>;
}

export async function forcesInWorker(coils: { points: Float64Array; current: number }[], indices: number[]) {
  const r = await getPool().run({ kind: 'forces', coils, indices });
  return (r as Extract<JobResult, { kind: 'forces' }>).forces;
}
