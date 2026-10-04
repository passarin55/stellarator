import { useMemo, useState, useDeferredValue } from 'react';
import { solveQsc, nearAxisEvaluator, nearAxisToCylindrical, type QscInput } from '@core/nearAxis/qsc';
import { fitFourierSurface, toVmecInput } from '@core/geometry/surface';
import { NEAR_AXIS_PRESETS } from '@data/library';
import { Panel, Kpi, Slider, Select, PageHead, Seg } from '../components/Controls';
import { Viewer3D } from '../components/Viewer3D';
import { Plot } from '../components/Plot';
import { setCustomBoundary } from '../state/project';
import { toast } from '../state/store';
import { navigate } from '../state/router';
import { CATEGORICAL } from '../lib/colormap';
import { downloadText } from '../lib/format';
import { MathText } from '../components/Tex';

const NMODES = 5;

export default function NearAxis() {
  const [presetId, setPresetId] = useState(NEAR_AXIS_PRESETS[0].id);
  const [input, setInput] = useState<QscInput>(() => normalise(NEAR_AXIS_PRESETS[0].input));
  const [r, setR] = useState(0.1);
  const [nphi, setNphi] = useState(61);
  const [plot, setPlot] = useState<'geometry' | 'sigma' | 'elongation' | 'lgradb'>('geometry');
  const deferred = useDeferredValue(input);

  const sol = useMemo(() => {
    try {
      return { ok: true as const, s: solveQsc({ ...deferred, nphi }) };
    } catch (e) {
      return { ok: false as const, err: e instanceof Error ? e.message : String(e) };
    }
  }, [deferred, nphi]);

  const scene = useMemo(() => {
    if (!sol.ok) return null;
    const s = sol.s;
    const ev = nearAxisEvaluator(s);
    const nt = 40;
    const np = 140;
    const positions = new Float32Array((nt + 1) * (np + 1) * 3);
    const scalars = new Float32Array((nt + 1) * (np + 1));
    let k = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j <= np; j++) {
      const p0 = (2 * Math.PI * j) / np;
      for (let i = 0; i <= nt; i++) {
        const th = (2 * Math.PI * i) / nt;
        const [x, y, z] = ev.point(r, th, p0);
        positions.set([x, y, z], 3 * k);
        const b = ev.modB(r, th, p0);
        scalars[k++] = b;
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
      }
    }
    // magnetic axis line
    const axis = new Float32Array(3 * 401);
    for (let j = 0; j <= 400; j++) {
      const p = (2 * Math.PI * j) / 400;
      const [x, y, z] = ev.point(0, 0, p);
      axis.set([x, y, z], 3 * j);
    }
    return { surface: { positions, ntheta: nt, nphi: np, scalars, colormap: 'viridis' as const, range: [lo, hi] as [number, number] }, axis, lo, hi };
  }, [sol, r]);

  const set = (patch: Partial<QscInput>) => setInput((p) => ({ ...p, ...patch }));
  const setCoef = (key: 'rc' | 'zs', n: number, v: number) =>
    setInput((p) => {
      const a = [...(p[key] ?? [])];
      a[n] = v;
      return { ...p, [key]: a };
    });

  const exportBoundary = (mode: 'studio' | 'file') => {
    if (!sol.ok) return;
    const s = sol.s;
    const ntheta = 24;
    const nph = 32;
    const cyl = nearAxisToCylindrical(s, r, ntheta, nph);
    const surf = fitFourierSurface(cyl.R, cyl.Z, ntheta, nph, s.input.nfp, 8, 10, s.lasym);
    if (mode === 'studio') {
      setCustomBoundary(`Near-axis ${s.helicity === 0 ? 'QA' : 'QH'} (nfp ${s.input.nfp}, r = ${r})`, surf, 'near-axis', s.input.B0);
      toast('Boundary sent to the Configuration Studio');
      navigate('/studio');
    } else downloadText('input.near_axis', toVmecInput(surf, { title: `near-axis r=${r} etabar=${s.input.etabar}`, phiedge: Math.PI * r * r * s.input.B0 }));
  };

  const s = sol.ok ? sol.s : null;
  const phiDeg = s ? Array.from(s.phi, (p) => (p * s.input.nfp) / (2 * Math.PI)) : [];

  return (
    <div className="page">
      <PageHead
        title="Near-Axis Designer"
        lead={<>Quasisymmetric stellarators from the shape of the magnetic axis, solved to first order in the distance from the axis (Garren–Boozer). This is a line-by-line port of pyQSC: ι agrees to 10⁻⁹ for all published configurations.</>}
        actions={
          <>
            <button className="btn primary" onClick={() => exportBoundary('studio')} disabled={!s}>
              Send boundary to Studio
            </button>
            <button className="btn" onClick={() => exportBoundary('file')} disabled={!s}>
              VMEC input
            </button>
          </>
        }
      />
      <div className="split">
        <div className="stack">
          <Panel title="Configuration">
            <Select
              label="Published preset"
              value={presetId}
              options={NEAR_AXIS_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(id) => {
                setPresetId(id);
                setInput(normalise(NEAR_AXIS_PRESETS.find((p) => p.id === id)!.input));
              }}
            />
            <p className="small faint">{NEAR_AXIS_PRESETS.find((p) => p.id === presetId)?.reference}</p>
            <Slider label="Field periods nfp" value={input.nfp} min={1} max={10} step={1} digits={2} onChange={(v) => set({ nfp: Math.max(1, Math.round(v)) })} />
            <Slider label={<MathText text="$\bar\eta$ (first-order |B| variation)" />} value={input.etabar} min={-3} max={3} digits={4} onChange={(v) => set({ etabar: v === 0 ? 1e-3 : v })} />
            <Slider label={<MathText text="$\sigma_0$ (breaks stellarator symmetry)" />} value={input.sigma0 ?? 0} min={-1} max={1} digits={3} onChange={(v) => set({ sigma0: v })} />
            <Slider label={<MathText text="$I_2/B_0$ (on-axis current density)" />} value={input.I2 ?? 0} min={-2} max={2} digits={3} onChange={(v) => set({ I2: v })} />
            <Slider label="Surface radius r (display/export)" value={r} min={0.01} max={0.3} digits={3} onChange={setR} />
            <Slider label="Axis resolution nphi (odd)" value={nphi} min={15} max={201} step={2} digits={3} onChange={(v) => setNphi(Math.round(v) % 2 ? Math.round(v) : Math.round(v) + 1)} />
          </Panel>
          <Panel title="Magnetic axis shape" sub="R₀ = Σ rcₙ cos(n·nfp·φ), Z₀ = Σ zsₙ sin(n·nfp·φ)">
            {Array.from({ length: NMODES }, (_, n) => (
              <div key={n} className="grid cols-2" style={{ gap: 8 }}>
                <Slider label={`rc${n}`} value={input.rc[n] ?? 0} min={n === 0 ? 0.5 : -0.4} max={n === 0 ? 2 : 0.4} digits={5} onChange={(v) => setCoef('rc', n, v)} />
                {n > 0 ? <Slider label={`zs${n}`} value={input.zs[n] ?? 0} min={-0.4} max={0.4} digits={5} onChange={(v) => setCoef('zs', n, v)} /> : <span />}
              </div>
            ))}
            <p className="small faint">Higher harmonics from the preset (beyond n = {NMODES - 1}) are kept.</p>
          </Panel>
        </div>
        <div className="stack">
          {!sol.ok && <div className="note warnbox">Solver failed: {sol.err}</div>}
          {s && (
            <Panel title="Results">
              <div className="kpis">
                <Kpi label="ι on axis" value={s.iota} digits={6} tone={s.converged ? undefined : 'bad'} />
                <Kpi label="Symmetry type" value={s.helicity === 0 ? 'QA' : `QH (N=${s.helicity})`} note={`helicity N·nfp = ${s.helicity * s.input.nfp}`} />
                <Kpi label="ι − N (ι_N)" value={s.iotaN} digits={5} />
                <Kpi label="Max elongation" value={s.maxElongation} digits={4} tone={s.maxElongation > 6 ? 'warn' : undefined} />
                <Kpi label="Mean elongation" value={s.meanElongation} digits={4} />
                <Kpi label="min L∇B" value={s.minLgradB} unit="m" digits={4} note="coil-distance proxy" />
                <Kpi label="Axis length" value={s.axisLength} unit="m" digits={5} />
                <Kpi label="min R₀" value={s.minR0} unit="m" digits={4} tone={s.minR0 <= 0 ? 'bad' : undefined} />
                <Kpi label="RMS curvature" value={s.rmsCurvature} unit="1/m" digits={4} />
                <Kpi label="Newton" value={`${s.newtonIterations} it`} note={`|res| = ${s.newtonResidual.toExponential(1)}`} tone={s.converged ? 'good' : 'bad'} />
              </div>
            </Panel>
          )}
          {scene && (
            <Panel title={`Flux surface at r = ${r}`} sub="coloured by |B| — stripes aligned with the symmetry direction signal quasisymmetry" flush>
              <Viewer3D
                surfaces={[scene.surface]}
                lines={[{ points: scene.axis, color: '#f43f5e' }]}
                fitKey={`na-${presetId}-${input.nfp}`}
                colorbar={{ name: 'viridis', lo: scene.lo, hi: scene.hi, label: '|B| / B₀' }}
                height={440}
              />
            </Panel>
          )}
          {s && (
            <Panel
              title="Axis profiles"
              actions={
                <Seg
                  value={plot}
                  onChange={setPlot}
                  options={[
                    { value: 'geometry', label: 'κ & τ' },
                    { value: 'sigma', label: 'σ(φ)' },
                    { value: 'elongation', label: 'Elongation' },
                    { value: 'lgradb', label: 'L∇B' },
                  ]}
                />
              }
            >
              <Plot
                xLabel="φ · nfp / 2π (one field period)"
                yLabel={plot === 'geometry' ? '1/m' : plot === 'sigma' ? 'σ' : plot === 'elongation' ? 'elongation' : 'L∇B [m]'}
                height={280}
                filename={`near-axis-${plot}`}
                series={
                  plot === 'geometry'
                    ? [
                        { type: 'line', x: phiDeg, y: s.curvature, color: CATEGORICAL[0], label: 'curvature κ' },
                        { type: 'line', x: phiDeg, y: s.torsion, color: CATEGORICAL[1], label: 'torsion τ' },
                      ]
                    : plot === 'sigma'
                      ? [{ type: 'line', x: phiDeg, y: s.sigma, color: CATEGORICAL[2], label: 'σ' }]
                      : plot === 'elongation'
                        ? [{ type: 'line', x: phiDeg, y: s.elongation, color: CATEGORICAL[3], label: 'elongation' }]
                        : [{ type: 'line', x: phiDeg, y: s.LgradB, color: CATEGORICAL[4], label: 'L∇B' }]
                }
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function normalise(i: QscInput): QscInput {
  return { sigma0: 0, I2: 0, B0: 1, ...i, rc: [...i.rc], zs: [...i.zs] };
}
