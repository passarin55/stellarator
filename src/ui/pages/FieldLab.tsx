import { useEffect, useMemo, useState } from 'react';
import { useRoute, navigate } from '../state/router';
import { useStore, toast } from '../state/store';
import { useLibraryCoils } from '../state/coils';
import { COILSETS, coilSetById, boundaryById } from '@data/library';
import { packCoils } from '@core/field/biotSavart';
import { rationalsInRange, type TracedLine, type AxisResult } from '@core/field/fieldlines';
import { crossSection, surfaceMetrics, type FourierSurface } from '@core/geometry/surface';
import type { Coil } from '@core/coils/coils';
import type { GridSpec } from '@core/field/grid';
import { Panel, Kpi, Slider, Select, PageHead, Progress, Check, Seg } from '../components/Controls';
import { Plot, type Series, type RefLine } from '../components/Plot';
import { Viewer3D } from '../components/Viewer3D';
import { CATEGORICAL, cssColor } from '../lib/colormap';
import { surfaceLayer } from '../lib/geometry3d';
import { downloadText, fmt } from '../lib/format';
import { buildFieldGridParallel, findAxisInWorker, traceParallel, CancelToken, CancelledError } from '../../workers/pool';

interface RunResult {
  axis: AxisResult;
  lines: TracedLine[];
  sectionFractions: number[];
  seconds: number;
  spec: GridSpec;
  startR: number[];
}

export default function FieldLab() {
  const { query } = useRoute();
  const synthesized = useStore((s) => s.synthesized);
  const libraryId = useStore((s) => s.coilSetId);
  const source = query.get('c') ?? libraryId;
  const isSynth = source === 'synth' && !!synthesized;
  const setId = isSynth ? null : (coilSetById(source)?.id ?? 'w7x');
  const lib = useLibraryCoils(setId ?? 'w7x');
  const coils: Coil[] = isSynth ? synthesized!.coils : lib.coils;
  const nfp = isSynth ? synthesized!.nfp : coilSetById(setId!)!.nfp;
  const storeBoundary = useStore((s) => s.boundary);
  const boundary: FourierSurface | undefined = isSynth
    ? storeBoundary?.id === synthesized!.boundaryId
      ? storeBoundary.surface
      : boundaryById(synthesized!.boundaryId)?.surface
    : setId
      ? boundaryById(coilSetById(setId)!.boundaryId ?? '')?.surface
      : undefined;

  // default tracing box
  const defaultBox = useMemo(() => {
    if (!isSynth && setId) return coilSetById(setId)!.box;
    if (boundary) {
      const m = surfaceMetrics(boundary, 32, 24);
      const pad = 0.25 * m.minorRadius;
      return { Rmin: m.rRange[0] - pad, Rmax: m.rRange[1] + pad, Zmin: m.zRange[0] - pad, Zmax: m.zRange[1] + pad };
    }
    return { Rmin: 0.5, Rmax: 1.5, Zmin: -0.5, Zmax: 0.5 };
  }, [isSynth, setId, boundary]);

  const [nR, setNR] = useState(41);
  const [nPhi, setNPhi] = useState(36);
  const [nLines, setNLines] = useState(16);
  const [extent, setExtent] = useState(0.95);
  const [transits, setTransits] = useState(60);
  const [steps, setSteps] = useState(72);
  const [plane, setPlane] = useState<0 | 0.5>(0);
  const [showBoundary, setShowBoundary] = useState(true);
  const [colorByIota, setColorByIota] = useState(true);
  const [progress, setProgress] = useState<{ stage: string; f: number } | null>(null);
  const [token, setToken] = useState<CancelToken | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => setResult(null), [source, coils]);

  const boundaryOutboard = useMemo(() => {
    if (!boundary) return null;
    const c = crossSection(boundary, 0, 64);
    let iMax = 0;
    for (let i = 0; i < c.R.length; i++) if (c.R[i] > c.R[iMax]) iMax = i;
    return { R: c.R[iMax], Z: c.Z[iMax] };
  }, [boundary]);

  const run = async () => {
    const t = new CancelToken();
    setToken(t);
    const t0 = performance.now();
    try {
      const box = defaultBox;
      const nZ = Math.max(9, Math.round((nR * (box.Zmax - box.Zmin)) / (box.Rmax - box.Rmin)));
      const spec: GridSpec = { nfp, ...box, nR, nZ, nPhi };
      setProgress({ stage: `Biot–Savart grid ${nR}×${nZ}×${nPhi} (${coils.length} coils)`, f: 0 });
      const grid = await buildFieldGridParallel(packCoils(coils), spec, (f) => setProgress((p) => ({ stage: p?.stage ?? '', f })), t);
      setProgress({ stage: 'Locating magnetic axis (Newton on the period map)', f: 0.5 });
      const axisSeries = !isSynth && setId ? coilSetById(setId)!.axis.rc : null;
      const mid = boundary ? crossSection(boundary, 0, 2) : null;
      const guessR = axisSeries ? axisSeries.reduce((a, b) => a + b, 0) : mid ? 0.5 * (mid.R[0] + mid.R[1]) : 0.5 * (box.Rmin + box.Rmax);
      const axis = await findAxisInWorker(grid, { R: guessR, Z: 0 }, 0, steps, t);
      if (!axis.converged) toast('Axis Newton iteration did not fully converge — results may be approximate', 'error');
      const edge = boundaryOutboard ? boundaryOutboard.R : axis.R + 0.4 * (box.Rmax - axis.R);
      const startR = Array.from({ length: nLines }, (_, i) => axis.R + ((i + 1) / nLines) * extent * (edge - axis.R) * 1.15);
      const sectionFractions = [0, 0.5];
      setProgress({ stage: `Tracing ${nLines} field lines × ${transits} transits`, f: 0 });
      const lines = await traceParallel(
        grid,
        startR.map((R) => ({ R, Z: axis.Z })),
        { nfp, phi0: 0, transits, stepsPerPeriod: steps, axis, sectionFractions, record3D: steps * nfp * 2 },
        (f) => setProgress((p) => ({ stage: p?.stage ?? '', f })),
        t,
      );
      setResult({ axis, lines, sectionFractions, seconds: (performance.now() - t0) / 1000, spec, startR });
    } catch (e) {
      if (!(e instanceof CancelledError)) toast(String(e instanceof Error ? e.message : e), 'error');
    }
    setProgress(null);
    setToken(null);
  };

  const sIdx = plane === 0 ? 0 : 1;
  const iotaRange = useMemo(() => {
    if (!result) return [0, 1] as [number, number];
    const v = result.lines.filter((l) => !l.lost && Number.isFinite(l.iota)).map((l) => Math.abs(l.iota));
    return [Math.min(...v, Math.abs(result.axis.iotaAxis)), Math.max(...v)] as [number, number];
  }, [result]);

  const poincare = useMemo<Series[]>(() => {
    if (!result) return [];
    const out: Series[] = result.lines.map((l, i) => {
      const pts = l.sections[sIdx];
      const x = new Float64Array(pts.length / 2);
      const y = new Float64Array(pts.length / 2);
      for (let k = 0; k < x.length; k++) {
        x[k] = pts[2 * k];
        y[k] = pts[2 * k + 1];
      }
      const t = (Math.abs(l.iota) - iotaRange[0]) / (iotaRange[1] - iotaRange[0] || 1);
      return {
        type: 'scatter' as const,
        x,
        y,
        color: l.lost ? '#94a3b8' : colorByIota && Number.isFinite(l.iota) ? cssColor('turbo', 0.1 + 0.85 * t) : CATEGORICAL[i % CATEGORICAL.length],
        size: 1.1,
      };
    });
    if (boundary && showBoundary) {
      const c = crossSection(boundary, plane * ((2 * Math.PI) / nfp), 200);
      out.push({ type: 'line', x: c.R, y: c.Z, color: '#f472b6', width: 1.5, label: 'target boundary', dash: [5, 4] });
    }
    out.push({ type: 'scatter', x: [result.axis.R], y: [plane === 0 ? result.axis.Z : NaN], color: '#e11d48', size: 3.5, label: plane === 0 ? 'magnetic axis' : undefined });
    return out;
  }, [result, sIdx, boundary, showBoundary, plane, nfp, colorByIota, iotaRange]);

  const iotaProfile = useMemo(() => {
    if (!result) return null;
    const rows = result.lines.map((l, i) => ({ r: Math.abs(result.startR[i] - result.axis.R), iota: Math.abs(l.iota), lost: l.lost }));
    const good = rows.filter((r) => !r.lost && Number.isFinite(r.iota));
    const series: Series[] = [
      { type: 'line', x: [0, ...good.map((r) => r.r)], y: [Math.abs(result.axis.iotaAxis), ...good.map((r) => r.iota)], color: CATEGORICAL[0], label: 'ι (field-line average)', width: 2 },
      { type: 'scatter', x: good.map((r) => r.r), y: good.map((r) => r.iota), color: CATEGORICAL[0], size: 2.5 },
    ];
    const lo = Math.min(...series[0].y as number[]);
    const hi = Math.max(...series[0].y as number[]);
    const pad = Math.max(0.02, (hi - lo) * 0.25);
    const rats = rationalsInRange(lo - pad, hi + pad, 12, nfp).filter((q) => q.m <= 12);
    const refs: RefLine[] = rats.map((q) => ({ axis: 'y', value: q.value, label: `${q.n}/${q.m}`, color: q.n % nfp === 0 ? '#e11d48' : undefined, dash: q.n % nfp === 0 ? [6, 3] : [2, 4] }));
    return { series, refs, lost: rows.filter((r) => r.lost).length, edge: good.length ? good[good.length - 1].iota : NaN, domain: [lo - pad, hi + pad] as [number, number] };
  }, [result, nfp]);

  const scene3d = useMemo(() => {
    if (!result) return null;
    const lines = result.lines
      .filter((_, i) => i % Math.max(1, Math.floor(result.lines.length / 6)) === 0)
      .map((l, i) => ({ points: l.path ?? new Float32Array(), color: CATEGORICAL[i % CATEGORICAL.length] }));
    const surfaces = boundary ? [surfaceLayer(boundary, { color: '#f472b6', opacity: 0.18, nphi: 100 }).layer] : [];
    const tube = 0.006 * (result.spec.Rmax + result.spec.Rmin);
    return { lines, surfaces, coils: coils.filter((c) => c.current !== 0).map((c) => ({ points: c.points, color: '#64748b', radius: tube })) };
  }, [result, boundary, coils]);

  const exportCsv = () => {
    if (!result) return;
    const rows = ['line,R0,iota,lost,section,R,Z'];
    result.lines.forEach((l, i) =>
      l.sections.forEach((s, si) => {
        for (let k = 0; k < s.length; k += 2) rows.push(`${i},${result.startR[i]},${l.iota},${l.lost},${result.sectionFractions[si]},${s[k]},${s[k + 1]}`);
      }),
    );
    downloadText('poincare.csv', rows.join('\n'), 'text/csv');
  };

  return (
    <div className="page">
      <PageHead
        title="Field-Line Lab"
        lead="Build a Biot–Savart field grid in parallel Web Workers, find the magnetic axis as a fixed point of the one-period map, and trace field lines to produce Poincaré sections and rotational-transform profiles."
        actions={result && <button className="btn" onClick={exportCsv}>Export Poincaré CSV</button>}
      />
      <div className="split">
        <div className="stack">
          <Panel title="Field source">
            <Select
              label="Coils"
              value={isSynth ? 'synth' : setId!}
              options={[
                ...COILSETS.map((c) => ({ value: c.id, label: c.name, group: 'Real devices' })),
                ...(synthesized ? [{ value: 'synth', label: synthesized.name, group: 'Synthesised (REGCOIL)' }] : []),
              ]}
              onChange={(v) => navigate(`/field?c=${v}`)}
            />
            {!isSynth && (
              <p className="small muted">
                Current ratios come from the <a href="#/coils">Coil Lab</a> ({lib.scale.map((s) => s.toFixed(2)).join(', ')}).
              </p>
            )}
            {!synthesized && <p className="small faint">Synthesise coils for any boundary in the Coil Lab to trace them here.</p>}
          </Panel>
          <Panel title="Numerics">
            <Slider label="Grid points in R" value={nR} min={21} max={81} step={2} digits={2} onChange={(v) => setNR(Math.round(v))} hint="Z resolution follows the box aspect ratio" />
            <Slider label="Grid planes per period" value={nPhi} min={12} max={72} step={4} digits={2} onChange={(v) => setNPhi(Math.round(v))} />
            <Slider label="Field lines" value={nLines} min={4} max={40} step={1} digits={2} onChange={(v) => setNLines(Math.round(v))} />
            <Slider label="Radial extent (× boundary)" value={extent} min={0.3} max={1.3} digits={3} onChange={setExtent} hint="starting points span from the axis to this fraction of the outboard boundary (×1.15)" />
            <Slider label="Toroidal transits" value={transits} min={10} max={400} step={10} digits={3} onChange={(v) => setTransits(Math.round(v))} />
            <Slider label="RK4 steps per period" value={steps} min={24} max={240} step={12} digits={3} onChange={(v) => setSteps(Math.round(v))} />
            <div className="row">
              <button className="btn primary" onClick={run} disabled={!!progress}>
                Run
              </button>
              {token && (
                <button className="btn" onClick={() => token.cancel()}>
                  Cancel
                </button>
              )}
            </div>
            {progress && <div style={{ marginTop: 10 }}><Progress value={progress.f} label={progress.stage} /></div>}
          </Panel>
          {result && (
            <Panel title="Diagnostics">
              <div className="kpis">
                <Kpi label="Axis R" value={result.axis.R} unit="m" digits={5} />
                <Kpi label="Axis Z" value={result.axis.Z} unit="m" digits={3} />
                <Kpi label="ι on axis (map)" value={Math.abs(result.axis.iotaAxis)} digits={4} note="from monodromy eigenvalues" />
                <Kpi label="Greene residue" value={result.axis.residue} digits={3} tone={result.axis.residue > 0 && result.axis.residue < 1 ? 'good' : 'bad'} note={result.axis.residue > 0 && result.axis.residue < 1 ? 'elliptic (stable) axis' : 'hyperbolic!'} />
                <Kpi label="Outermost ι" value={iotaProfile?.edge} digits={4} />
                <Kpi label="Lost lines" value={`${iotaProfile?.lost ?? 0} / ${result.lines.length}`} tone={(iotaProfile?.lost ?? 0) > 0 ? 'warn' : 'good'} note="left the grid" />
                <Kpi label="Wall-clock" value={result.seconds} unit="s" digits={3} />
              </div>
            </Panel>
          )}
        </div>
        <div className="stack">
          <Panel
            title="Poincaré section"
            sub={result ? `${result.lines.length} lines · ${transits} transits` : 'press Run'}
            actions={
              <div className="row">
                <Check label="Colour by ι" checked={colorByIota} onChange={setColorByIota} />
                {boundary && <Check label="Target boundary" checked={showBoundary} onChange={setShowBoundary} />}
                <Seg value={plane} onChange={setPlane} options={[{ value: 0, label: 'φ = 0' }, { value: 0.5, label: 'φ = π/nfp' }]} />
              </div>
            }
          >
            {result ? (
              <Plot series={poincare} xLabel="R [m]" yLabel="Z [m]" equalAspect height={520} legend filename="poincare" />
            ) : (
              <div className="muted" style={{ height: 300, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                <div>
                  <p>
                    Choose a coil set and press <strong>Run</strong>.
                  </p>
                  <p className="small faint">W7-X with default settings takes a few seconds on a laptop (the grid needs ≈ 6×10⁸ segment evaluations).</p>
                </div>
              </div>
            )}
          </Panel>
          {iotaProfile && (
            <div className="grid cols-2">
              <Panel title="Rotational transform profile" sub="red dashed: resonances n/m with n divisible by nfp (natural islands)">
                <Plot series={iotaProfile.series} refLines={iotaProfile.refs} yDomain={iotaProfile.domain} xLabel="distance from axis at φ = 0 [m]" yLabel="ι" height={300} legend={false} filename="iota-profile" />
              </Panel>
              {scene3d && (
                <Panel title="Field lines in 3D" sub="two toroidal transits" flush>
                  <Viewer3D lines={scene3d.lines} surfaces={scene3d.surfaces} coils={scene3d.coils} height={340} fitKey={`fl-${source}`} />
                </Panel>
              )}
            </div>
          )}
          {result && (
            <p className="small faint">
              Grid {result.spec.nR}×{result.spec.nZ}×{result.spec.nPhi} over R ∈ [{fmt(result.spec.Rmin)}, {fmt(result.spec.Rmax)}] m, Z ∈ [{fmt(result.spec.Zmin)}, {fmt(result.spec.Zmax)}] m, tricubic interpolation, RK4 with Δφ = 2π/({nfp}·{steps}).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
