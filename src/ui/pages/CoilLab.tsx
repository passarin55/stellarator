import { useEffect, useMemo, useState } from 'react';
import { useRoute, navigate } from '../state/router';
import { store, useStore, toast } from '../state/store';
import { useActiveBoundary } from '../state/project';
import { COILSETS, coilSetById, boundaryById } from '@data/library';
import { useLibraryCoils } from '../state/coils';
import { curveGeometry, minCoilCoilDistance, minCoilSurfaceDistance, polylineLength, toMakegridCoils, type Coil } from '@core/coils/coils';
import { offsetSurface, surfaceMetrics } from '@core/geometry/surface';
import { cutModularCoils, normalFieldError, poloidalCurrentFor, type RegcoilResult } from '@core/coils/regcoil';
import { Panel, Kpi, Slider, Select, Seg, PageHead, Progress, Check } from '../components/Controls';
import { Viewer3D } from '../components/Viewer3D';
import { Plot } from '../components/Plot';
import { surfaceLayer } from '../lib/geometry3d';
import { CATEGORICAL } from '../lib/colormap';
import { downloadText, fmt, fmtSI } from '../lib/format';
import { energyInWorker, forcesInWorker, regcoilInWorker, CancelToken, CancelledError } from '../../workers/pool';

export default function CoilLab() {
  const { query } = useRoute();
  const tab = query.get('tab') === 'synth' ? 'synth' : 'library';
  return (
    <div className="page">
      <PageHead
        title="Coil Lab"
        lead="Inspect real stellarator coil sets — geometry, forces, inductance — or synthesise new coils for any plasma boundary with a REGCOIL-style current-potential solver."
        actions={
          <Seg
            value={tab}
            onChange={(t) => navigate(`/coils${t === 'synth' ? '?tab=synth' : ''}`)}
            options={[
              { value: 'library', label: 'Real coil sets' },
              { value: 'synth', label: 'Synthesis (REGCOIL)' },
            ]}
          />
        }
      />
      {tab === 'library' ? <LibraryCoils /> : <Synthesis />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LibraryCoils() {
  const coilSetId = useStore((s) => s.coilSetId);
  const set = coilSetById(coilSetId) ?? COILSETS[0];
  const { coils, scale } = useLibraryCoils(set.id);
  const boundary = set.boundaryId ? boundaryById(set.boundaryId) : undefined;
  const [energy, setEnergy] = useState<{ E: number; L: number[] } | null>(null);
  const [forces, setForces] = useState<{ index: number; maxForcePerLength: number; netForce: number[] }[] | null>(null);
  const [radius, setRadius] = useState(set.id === 'w7x' ? 0.1 : 0.03);
  const [busy, setBusy] = useState(false);

  const setScale = (i: number, v: number) => {
    const next = [...scale];
    next[i] = v;
    store.set((s) => ({ coilCurrentScale: { ...s.coilCurrentScale, [set.id]: next } }));
  };

  const perCoil = useMemo(
    () =>
      set.curves.map((c, i) => {
        const g = curveGeometry(c);
        const cur = coils.find((k) => k.baseIndex === i && k.period === 0 && !k.flipped)?.current ?? 0;
        return { i, label: set.labels?.[i] ?? `C${i + 1}`, ...g, current: cur };
      }),
    [set, coils],
  );
  const global = useMemo(() => {
    const active = coils.filter((c) => c.current !== 0);
    const cc = minCoilCoilDistance(coils.filter((c) => c.period === 0 || c.period === 1));
    const cs = boundary ? minCoilSurfaceDistance(active, boundary.surface, 32, 64) : NaN;
    const totalLength = active.reduce((a, c) => a + polylineLength(c.points), 0);
    const ampereMeters = active.reduce((a, c) => a + Math.abs(c.current) * polylineLength(c.points), 0);
    return { cc: cc.distance, cs, totalLength, ampereMeters, n: coils.length, nActive: active.length };
  }, [coils, boundary]);

  useEffect(() => {
    setEnergy(null);
    setForces(null);
  }, [coils, radius]);

  const runEngineering = async () => {
    setBusy(true);
    try {
      const active = coils.filter((c) => c.current !== 0);
      const [e, f] = await Promise.all([
        energyInWorker(active.map((c) => ({ points: c.points, current: c.current, period: c.period, flipped: c.flipped })), radius),
        forcesInWorker(
          coils.map((c) => ({ points: c.points, current: c.current })),
          coils.map((c, i) => (c.period === 0 && !c.flipped ? i : -1)).filter((i) => i >= 0),
        ),
      ]);
      setEnergy({ E: e.energy, L: e.selfInductance });
      setForces(f);
    } catch (err) {
      toast(String(err), 'error');
    }
    setBusy(false);
  };

  const scene = useMemo(() => {
    const surfaces = boundary ? [surfaceLayer(boundary.surface, { color: '#f472b6', opacity: 0.55, nphi: 120 }).layer] : [];
    const tube = 0.008 * (set.box.Rmax + set.box.Rmin);
    return {
      surfaces,
      coils: coils.map((c) => ({ points: c.points, color: c.current === 0 ? '#64748b' : CATEGORICAL[c.baseIndex % CATEGORICAL.length], radius: tube })),
    };
  }, [coils, boundary, set.box]);

  return (
    <div className="split">
      <div className="stack">
        <Panel title="Coil set">
          <Select
            label="Device"
            value={set.id}
            options={COILSETS.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(id) => store.set({ coilSetId: id })}
          />
          <p className="small muted">{set.description}</p>
          <div className="field">
            <span className="label">Current presets</span>
            <div className="row">
              {set.presets.map((p) => (
                <button key={p.name} className="btn sm" title={p.note} onClick={() => store.set((s) => ({ coilCurrentScale: { ...s.coilCurrentScale, [set.id]: p.scale } }))}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          {set.curves.map((_, i) => (
            <Slider key={i} label={`${set.labels?.[i] ?? `C${i + 1}`} current × `} value={scale[i]} min={-1.5} max={1.5} digits={3} onChange={(v) => setScale(i, v)} />
          ))}
          <div className="row">
            <button className="btn primary" onClick={() => navigate(`/field?c=${set.id}`)}>
              Trace field lines →
            </button>
            <button className="btn" onClick={() => downloadText(`coils.${set.id}`, toMakegridCoils(coils, set.nfp))}>
              MAKEGRID coils file
            </button>
          </div>
        </Panel>
        <Panel title="Engineering (Web Worker)">
          <Slider label="Equivalent conductor radius" value={radius} min={0.005} max={0.3} digits={3} unit="m (regularises self-inductance)" onChange={setRadius} />
          <button className="btn" onClick={runEngineering} disabled={busy}>
            {busy ? 'Computing…' : 'Compute stored energy & forces'}
          </button>
          {energy && (
            <div className="kpis" style={{ marginTop: 10 }}>
              <Kpi label="Stored magnetic energy" value={energy.E / 1e6} unit="MJ" digits={4} note="½ Σ Mᵢⱼ Iᵢ Iⱼ (Neumann)" />
              <Kpi label="Self-inductance (coil 1)" value={energy.L[0] * 1e6} unit="µH" digits={4} note="per filament turn" />
            </div>
          )}
        </Panel>
      </div>
      <div className="stack">
        <Panel title={set.name} sub={boundary ? `with ${boundary.short} plasma boundary` : undefined} flush>
          <Viewer3D surfaces={scene.surfaces} coils={scene.coils} fitKey={`coils-${set.id}`} />
        </Panel>
        <Panel title="Global metrics">
          <div className="kpis">
            <Kpi label="Coils (total / energised)" value={`${global.n} / ${global.nActive}`} />
            <Kpi label="Field periods" value={set.nfp} />
            <Kpi label="Min coil–coil distance" value={global.cc} unit="m" digits={3} />
            <Kpi label="Min coil–plasma distance" value={global.cs} unit="m" digits={3} />
            <Kpi label="Total conductor length" value={global.totalLength} unit="m" digits={4} note="filament centrelines" />
            <Kpi label="Ampere-metres" value={fmtSI(global.ampereMeters, 'A·m')} note="Σ |I| L (sets superconductor cost)" />
          </div>
        </Panel>
        <Panel title="Per coil type (one half-period)">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Coil</th>
                  <th>Current</th>
                  <th>Length [m]</th>
                  <th>max κ [1/m]</th>
                  <th>min bend radius [m]</th>
                  <th>⟨κ²⟩ [1/m²]</th>
                  <th>max dF/dℓ [MN/m]</th>
                  <th>|F_net| [MN]</th>
                </tr>
              </thead>
              <tbody>
                {perCoil.map((c) => {
                  const f = forces?.find((x) => coils[x.index].baseIndex === c.i);
                  return (
                    <tr key={c.i}>
                      <td>
                        <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: CATEGORICAL[c.i % CATEGORICAL.length], marginRight: 6 }} />
                        {c.label}
                      </td>
                      <td className="num">{fmtSI(c.current, 'A')}</td>
                      <td className="num">{c.length.toFixed(3)}</td>
                      <td className="num">{c.maxCurvature.toFixed(3)}</td>
                      <td className="num">{(1 / c.maxCurvature).toFixed(3)}</td>
                      <td className="num">{c.meanSquaredCurvature.toFixed(3)}</td>
                      <td className="num">{f ? fmt(f.maxForcePerLength / 1e6, 3) : '—'}</td>
                      <td className="num">{f ? fmt(Math.hypot(...f.netForce) / 1e6, 3) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small faint" style={{ marginTop: 8 }}>
            Forces use the field of all <em>other</em> coils (filament model); the self-force needs a finite-build model and is not included. Run “Compute stored energy & forces” to fill the force columns.
          </p>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Synthesis() {
  const { query } = useRoute();
  const active = useActiveBoundary(query.get('b'));
  const m = useMemo(() => surfaceMetrics(active.surface, 48, 32), [active.surface]);
  const [gap, setGap] = useState(1.5); // × minor radius
  const [lambda, setLambda] = useState(1e-16);
  const [mpol, setMpol] = useState(8);
  const [ntor, setNtor] = useState(8);
  const [B0, setB0] = useState(active.B0);
  const [ncoils, setNcoils] = useState(10);
  const [res, setRes] = useState(32);
  const [progress, setProgress] = useState<{ f: number; stage: string } | null>(null);
  const [result, setResult] = useState<RegcoilResult | null>(null);
  const [cut, setCut] = useState<{ coils: Coil[]; err: { mean: number; max: number } } | null>(null);
  const [token, setToken] = useState<CancelToken | null>(null);
  const [lcurve, setLcurve] = useState<{ lambda: number; chi2B: number; chi2K: number }[] | null>(null);
  const [showWinding, setShowWinding] = useState(false);

  useEffect(() => {
    setResult(null);
    setCut(null);
    setLcurve(null);
    setB0(active.B0);
  }, [active.id, active.B0]);

  const winding = useMemo(() => offsetSurface(active.surface, gap * m.minorRadius, Math.min(10, mpol + 2), Math.min(10, ntor + 2), 40, 40), [active.surface, gap, m.minorRadius, mpol, ntor]);
  const G = poloidalCurrentFor(B0, m.majorRadius);
  const input = (lam: number) => ({
    plasma: active.surface,
    winding,
    G,
    mpol,
    ntor,
    lambda: lam,
    nthetaPlasma: res,
    nzetaPlasma: res,
    nthetaCoil: Math.round(res * 1.5),
    nzetaCoil: Math.round(res * 1.5),
  });

  const run = async () => {
    const t = new CancelToken();
    setToken(t);
    setCut(null);
    try {
      setProgress({ f: 0, stage: 'inductance' });
      const r = await regcoilInWorker(input(lambda), (f, stage) => setProgress({ f, stage: stage ?? '' }), t);
      setResult(r);
      const coils = cutModularCoils(r, ncoils, 128);
      setCut({ coils, err: normalFieldError(coils, active.surface) });
    } catch (e) {
      if (!(e instanceof CancelledError)) toast(String(e instanceof Error ? e.message : e), 'error');
    }
    setProgress(null);
    setToken(null);
  };

  const scan = async () => {
    const t = new CancelToken();
    setToken(t);
    setProgress({ f: 0, stage: 'λ scan' });
    try {
      const lams = Array.from({ length: 9 }, (_, i) => 10 ** (-19 + i));
      let done = 0;
      const out = await Promise.all(
        lams.map((l) =>
          regcoilInWorker({ ...input(l), nthetaPlasma: Math.min(res, 24), nzetaPlasma: Math.min(res, 24), nthetaCoil: 32, nzetaCoil: 32 }, undefined, t).then((r) => {
            done++;
            setProgress({ f: done / lams.length, stage: 'λ scan' });
            return { lambda: l, chi2B: r.chi2B, chi2K: r.chi2K };
          }),
        ),
      );
      setLcurve(out);
    } catch (e) {
      if (!(e instanceof CancelledError)) toast(String(e), 'error');
    }
    setProgress(null);
    setToken(null);
  };

  const scene = useMemo(() => {
    const surfaces = [surfaceLayer(active.surface, { color: '#f472b6', opacity: cut ? 0.6 : 1, nphi: 120 }).layer];
    if (showWinding) surfaces.push(surfaceLayer(winding, { color: '#94a3b8', opacity: 0.2, nphi: 120 }).layer);
    const coils = (cut?.coils ?? []).map((c) => ({ points: c.points, color: CATEGORICAL[c.baseIndex % CATEGORICAL.length], radius: 0.015 * m.majorRadius }));
    return { surfaces, coils };
  }, [active.surface, cut, showWinding, winding, m.majorRadius]);

  const g = result?.grids;

  return (
    <div className="split">
      <div className="stack">
        <Panel title="Problem set-up">
          <p className="small muted" style={{ marginTop: 0 }}>
            Plasma: <strong>{active.name}</strong> (change it in the <a href="#/studio">Studio</a> or <a href="#/near-axis">Near-Axis Designer</a>).
          </p>
          <Slider label="Winding-surface gap (× a)" value={gap} min={0.2} max={2.5} digits={3} onChange={setGap} hint="distance between plasma and coils in units of the minor radius" />
          <Slider label="On-axis field B₀" value={B0} min={0.1} max={12} digits={3} unit={`T → G = ${fmtSI(G, 'A')}`} onChange={setB0} />
          <Slider label="Regularisation λ" value={lambda} min={1e-20} max={1e-10} log digits={2} onChange={setLambda} hint="larger λ → smaller, smoother currents but larger B·n error" />
          <div className="grid cols-2" style={{ gap: 8 }}>
            <Slider label="mpol" value={mpol} min={2} max={14} step={1} digits={2} onChange={(v) => setMpol(Math.round(v))} />
            <Slider label="ntor" value={ntor} min={2} max={14} step={1} digits={2} onChange={(v) => setNtor(Math.round(v))} />
          </div>
          <Slider label="Grid resolution" value={res} min={16} max={48} step={4} digits={2} onChange={(v) => setRes(Math.round(v))} />
          <Slider label="Coils per half-period" value={ncoils} min={2} max={12} step={1} digits={2} unit={`→ ${ncoils * 2 * active.surface.nfp} coils total`} onChange={(v) => setNcoils(Math.round(v))} />
          <div className="row">
            <button className="btn primary" onClick={run} disabled={!!progress}>
              Solve & cut coils
            </button>
            <button className="btn" onClick={scan} disabled={!!progress}>
              L-curve scan
            </button>
            {token && (
              <button className="btn" onClick={() => token.cancel()}>
                Cancel
              </button>
            )}
          </div>
          {progress && <div style={{ marginTop: 10 }}><Progress value={progress.f} label={progress.stage} /></div>}
        </Panel>
        {cut && (
          <Panel title="Hand-off">
            <p className="small muted">Send the {cut.coils.length} filament coils to the Field-Line Lab to check flux surfaces and ι.</p>
            <div className="row">
              <button
                className="btn primary"
                onClick={() => {
                  store.set({ synthesized: { name: `REGCOIL · ${active.name}`, nfp: active.surface.nfp, coils: cut.coils, createdAt: Date.now(), boundaryId: active.id } });
                  navigate('/field?c=synth');
                }}
              >
                Trace in Field Lab →
              </button>
              <button className="btn" onClick={() => downloadText('coils.regcoil', toMakegridCoils(cut.coils, active.surface.nfp))}>
                MAKEGRID file
              </button>
            </div>
          </Panel>
        )}
      </div>
      <div className="stack">
        <Panel title="Plasma, winding surface & cut coils" flush actions={<Check label="Show winding surface" checked={showWinding} onChange={setShowWinding} />}>
          <Viewer3D surfaces={scene.surfaces} coils={scene.coils} fitKey={`synth-${active.id}`} />
        </Panel>
        {result && g && (
          <>
            <Panel title="Solution quality">
              <div className="kpis">
                <Kpi label="RMS B·n / B₀" value={result.rmsBn / B0} digits={3} tone={result.rmsBn / B0 < 1e-3 ? 'good' : result.rmsBn / B0 < 1e-2 ? 'warn' : 'bad'} note="current sheet" />
                <Kpi label="max |B·n| / B₀" value={result.maxBn / B0} digits={3} />
                <Kpi label="max |K|" value={fmtSI(result.maxK, 'A/m')} />
                <Kpi label="RMS |K|" value={fmtSI(result.rmsK, 'A/m')} />
                <Kpi label="χ²_B" value={result.chi2B} unit="T²m²" digits={3} />
                <Kpi label="Basis functions" value={result.modes.length} />
                {cut && <Kpi label="⟨|B·n|/|B|⟩ cut coils" value={cut.err.mean} digits={3} tone={cut.err.mean < 0.01 ? 'good' : cut.err.mean < 0.03 ? 'warn' : 'bad'} note={`max ${fmt(cut.err.max)}`} />}
                {cut && <Kpi label="Current per coil" value={fmtSI(G / cut.coils.length, 'A')} />}
              </div>
            </Panel>
            <div className="grid cols-2">
              <Panel title="B·n on the plasma" sub="one field period">
                <Plot heatmap={{ values: result.BnMap, nx: g.nzp, ny: g.ntp, x: [0, 360 / active.surface.nfp], y: [0, 360], colormap: 'coolwarm', label: 'B·n [T]' }} xLabel="ζ [deg]" yLabel="θ [deg]" height={300} filename="regcoil-Bn" />
              </Panel>
              <Panel title="|K| on the winding surface" sub="current density">
                <Plot heatmap={{ values: result.KMap, nx: g.nzc, ny: g.ntc, x: [0, 360 / active.surface.nfp], y: [0, 360], colormap: 'magma', label: '|K| [A/m]' }} xLabel="ζ [deg]" yLabel="θ [deg]" height={300} filename="regcoil-K" />
              </Panel>
            </div>
          </>
        )}
        {lcurve && (
          <Panel title="L-curve" sub="trade-off between field accuracy and current complexity (labels: log₁₀ λ)">
            <Plot
              series={[
                { type: 'line', x: lcurve.map((p) => Math.log10(p.chi2K)), y: lcurve.map((p) => Math.log10(p.chi2B)), color: CATEGORICAL[0], label: 'λ scan', width: 2 },
                { type: 'scatter', x: lcurve.map((p) => Math.log10(p.chi2K)), y: lcurve.map((p) => Math.log10(p.chi2B)), color: CATEGORICAL[1], size: 3 },
              ]}
              refLines={lcurve.map((p) => ({ axis: 'x' as const, value: Math.log10(p.chi2K), label: String(Math.round(Math.log10(p.lambda))), dash: [1, 6] }))}
              xLabel="log₁₀ χ²_K  [A²]"
              yLabel="log₁₀ χ²_B  [T² m²]"
              height={300}
              filename="lcurve"
            />
          </Panel>
        )}
        {!result && !progress && (
          <div className="note">
            Tip: the defaults (gap 1.5·a, λ = 10⁻¹⁶, 10 coils per half-period) solve in a few seconds and give ≲ 0.5 % normal-field error for the near-axis precise-QA boundary. Closer winding surfaces need more coils: discrete-coil ripple grows when the coil spacing exceeds the coil–plasma gap. The boundary → REGCOIL → field-line pipeline is part of the automated test-suite (ι ≈ 0.42 recovered).
          </div>
        )}
      </div>
    </div>
  );
}
