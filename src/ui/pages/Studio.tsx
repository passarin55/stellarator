import { useMemo, useRef, useState, useDeferredValue } from 'react';
import { useRoute } from '../state/router';
import { useActiveBoundary, setBoundary, libraryBoundary, setCustomBoundary } from '../state/project';
import { toast } from '../state/store';
import { BOUNDARIES, coilSetById } from '@data/library';
import {
  surfaceMetrics, crossSection, scaleSurface, truncateSurface, toVmecInput, parseVmecInput, offsetSurface,
  type FourierMode,
} from '@core/geometry/surface';
import { expandCoils } from '@core/coils/coils';
import { Panel, Kpi, Select, Slider, Seg, Check, PageHead } from '../components/Controls';
import { Viewer3D, type SurfaceLayer } from '../components/Viewer3D';
import { Plot, type Series } from '../components/Plot';
import { surfaceLayer, type SurfaceColoring } from '../lib/geometry3d';
import { CATEGORICAL } from '../lib/colormap';
import { downloadText, fmt } from '../lib/format';
import { IconDownload, IconUpload } from '../components/Icons';

const COLORING: { value: SurfaceColoring; label: string }[] = [
  { value: 'Z', label: 'Height Z' },
  { value: 'gaussian', label: 'Gaussian K' },
  { value: 'mean', label: 'Mean H' },
  { value: 'phi', label: 'Period phase' },
  { value: 'none', label: 'Plain' },
];

export default function Studio() {
  const { query } = useRoute();
  const active = useActiveBoundary(query.get('b'));
  const [coloring, setColoring] = useState<SurfaceColoring>('Z');
  const [fraction, setFraction] = useState(1);
  const [showCoils, setShowCoils] = useState(true);
  const [showWall, setShowWall] = useState(false);
  const [wallGap, setWallGap] = useState(0.15);
  const [selMode, setSelMode] = useState<string | null>(null);
  const [newM, setNewM] = useState(1);
  const [newN, setNewN] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const surface = useDeferredValue(active.surface);
  const metrics = useMemo(() => surfaceMetrics(surface, 64, 48), [surface]);
  const lib = BOUNDARIES.find((b) => b.id === active.id);
  const coilSet = lib?.coilSetId ? coilSetById(lib.coilSetId) : undefined;

  const view = useMemo(() => {
    const { layer, range } = surfaceLayer(surface, { coloring, fraction, colormap: coloring === 'Z' ? 'plasma' : undefined });
    const surfaces: SurfaceLayer[] = [layer];
    if (showWall) {
      const wall = offsetSurface(surface, wallGap * metrics.minorRadius * 2, 8, 8, 40, 40);
      surfaces.push(surfaceLayer(wall, { fraction, color: '#94a3b8', opacity: 0.25 }).layer);
    }
    const coils =
      showCoils && coilSet
        ? expandCoils(coilSet, 96)
            .filter((c) => c.current !== 0)
            .filter((c) => {
              let phi = Math.atan2(c.points[1], c.points[0]);
              if (phi < 0) phi += 2 * Math.PI;
              return phi <= 2 * Math.PI * fraction + 0.05;
            })
            .map((c) => ({ points: c.points, color: CATEGORICAL[c.baseIndex % CATEGORICAL.length], radius: 0.012 * metrics.majorRadius }))
        : [];
    return { surfaces, coils, range };
  }, [surface, coloring, fraction, showCoils, coilSet, showWall, wallGap, metrics.minorRadius, metrics.majorRadius]);

  const sections = useMemo<Series[]>(() => {
    const P = (2 * Math.PI) / surface.nfp;
    return [0, 0.25, 0.5].map((f, i) => {
      const c = crossSection(surface, f * P, 160);
      return { type: 'line', x: c.R, y: c.Z, color: CATEGORICAL[i], label: `φ = ${f === 0 ? '0' : `${f}·2π/nfp`}`, width: 2 };
    });
  }, [surface]);

  const sortedModes = useMemo(
    () => [...surface.modes].sort((a, b) => Math.hypot(b.rbc, b.zbs) - Math.hypot(a.rbc, a.zbs)),
    [surface],
  );
  const spectrum = useMemo(() => {
    const mpol = Math.max(...surface.modes.map((m) => m.m));
    const ntor = Math.max(1, ...surface.modes.map((m) => Math.abs(m.n)));
    const nx = 2 * ntor + 1;
    const ny = mpol + 1;
    const v = new Float64Array(nx * ny).fill(NaN);
    for (const m of surface.modes) {
      if (m.m === 0 && m.n === 0) continue;
      v[m.m * nx + (m.n + ntor)] = Math.log10(Math.max(1e-12, Math.hypot(m.rbc, m.zbs, m.rbs ?? 0, m.zbc ?? 0)));
    }
    return { v, nx, ny, ntor, mpol };
  }, [surface]);

  const updateModes = (modes: FourierMode[], label = 'edited') =>
    setCustomBoundary(`${active.name.replace(/ \((edited|scaled|truncated)\)$/, '')} (${label})`, { ...active.surface, modes }, 'edited', active.B0);

  const sel = selMode ? surface.modes.find((m) => `${m.m},${m.n}` === selMode) : undefined;
  const R00 = surface.modes.find((m) => m.m === 0 && m.n === 0)?.rbc ?? 1;

  return (
    <div className="page">
      <PageHead
        title="Configuration Studio"
        lead="Explore and edit 3D plasma boundaries in the VMEC Fourier representation. Geometry integrals use the same conventions as VMEC/simsopt (verified to 7 digits)."
        actions={
          <>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <IconUpload size={14} /> Import VMEC input
            </button>
            <button className="btn" onClick={() => downloadText(`input.${active.id.replace(/[^a-z0-9_-]/gi, '_')}`, toVmecInput(surface, { title: active.name, phiedge: (lib?.phiedge ?? metrics.meanCrossSection * active.B0) }))}>
              <IconDownload size={14} /> Export VMEC input
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const p = parseVmecInput(await f.text());
                  setCustomBoundary(f.name, { nfp: p.nfp, lasym: p.lasym, modes: p.modes }, 'imported');
                  toast(`Imported ${p.modes.length} modes, nfp = ${p.nfp}`);
                } catch (err) {
                  toast(String(err instanceof Error ? err.message : err), 'error');
                }
                e.target.value = '';
              }}
            />
          </>
        }
      />
      <div className="split">
        <div className="stack">
          <Panel title="Boundary">
            <Select
              label="Library"
              value={lib ? active.id : '__custom'}
              options={[
                ...BOUNDARIES.map((b) => ({ value: b.id, label: b.name, group: b.kind === 'tokamak' || b.kind === 'classical' || b.kind === 'other' ? 'Reference' : `Optimised (${b.kind})` })),
                ...(lib ? [] : [{ value: '__custom', label: `★ ${active.name}`, group: 'Current' }]),
              ]}
              onChange={(id) => id !== '__custom' && setBoundary(libraryBoundary(id))}
            />
            {lib ? <p className="small muted">{lib.description} <span className="faint">— {lib.reference}</span></p> : <p className="small muted">Origin: {active.origin}</p>}
            <div className="row">
              <button className="btn sm" onClick={() => setCustomBoundary(`${active.name} (scaled)`, scaleSurface(surface, 2), 'edited', active.B0)}>×2 size</button>
              <button className="btn sm" onClick={() => setCustomBoundary(`${active.name} (scaled)`, scaleSurface(surface, 0.5), 'edited', active.B0)}>×½ size</button>
              <button className="btn sm" onClick={() => setCustomBoundary(`${active.name} (truncated)`, truncateSurface(surface, 4, 4), 'edited', active.B0)}>Truncate to m,|n| ≤ 4</button>
            </div>
          </Panel>
          <Panel title="Fourier editor" sub={`${surface.modes.length} modes · nfp ${surface.nfp}${surface.lasym ? ' · LASYM' : ''}`}>
            <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>m</th>
                    <th>n</th>
                    <th>RBC</th>
                    <th>ZBS</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModes.slice(0, 60).map((m) => (
                    <tr key={`${m.m},${m.n}`} onClick={() => setSelMode(`${m.m},${m.n}`)} style={{ cursor: 'pointer', background: selMode === `${m.m},${m.n}` ? 'var(--accent-soft)' : undefined }}>
                      <td>{m.m}</td>
                      <td>{m.n}</td>
                      <td className="num">{m.rbc.toExponential(3)}</td>
                      <td className="num">{m.zbs.toExponential(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sel ? (
              <>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  Editing (m, n) = ({sel.m}, {sel.n})
                </div>
                {(['rbc', 'zbs'] as const).map((k) => (
                  <Slider
                    key={k}
                    label={k.toUpperCase()}
                    value={sel[k]}
                    min={-0.4 * R00}
                    max={sel.m === 0 && sel.n === 0 && k === 'rbc' ? 2 * R00 : 0.4 * R00}
                    digits={5}
                    onChange={(v) => updateModes(surface.modes.map((m) => (m === sel ? { ...m, [k]: v } : m)))}
                  />
                ))}
                <button className="btn sm" onClick={() => { updateModes(surface.modes.filter((m) => m !== sel)); setSelMode(null); }} disabled={sel.m === 0 && sel.n === 0}>
                  Remove mode
                </button>
              </>
            ) : (
              <p className="small faint">Select a row to edit its coefficients.</p>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <span className="small muted">Add</span>
              <input type="number" value={newM} min={0} max={20} onChange={(e) => setNewM(Number(e.target.value))} style={{ width: 60 }} aria-label="m" />
              <input type="number" value={newN} min={-20} max={20} onChange={(e) => setNewN(Number(e.target.value))} style={{ width: 60 }} aria-label="n" />
              <button
                className="btn sm"
                onClick={() => {
                  if (surface.modes.some((m) => m.m === newM && m.n === newN)) return setSelMode(`${newM},${newN}`);
                  updateModes([...surface.modes, { m: newM, n: newN, rbc: 0, zbs: 0 }]);
                  setSelMode(`${newM},${newN}`);
                }}
              >
                + mode
              </button>
            </div>
          </Panel>
        </div>
        <div className="stack">
          <Panel
            title={active.name}
            sub={lib?.coilSetId ? 'with its real coil set' : undefined}
            actions={
              <div className="row">
                <Seg value={coloring} options={COLORING} onChange={setColoring} ariaLabel="Surface colouring" />
              </div>
            }
            flush
          >
            <Viewer3D
              surfaces={view.surfaces}
              coils={view.coils}
              fitKey={active.id}
              colorbar={view.range ? { name: coloring === 'Z' ? 'plasma' : coloring === 'gaussian' || coloring === 'mean' ? 'coolwarm' : 'viridis', lo: view.range[0], hi: view.range[1], label: COLORING.find((c) => c.value === coloring)!.label } : undefined}
            />
            <div className="row" style={{ padding: '10px 14px', gap: 18 }}>
              <div style={{ width: 220 }}>
                <Slider label="Toroidal extent (cut-away)" value={fraction} min={0.1} max={1} onChange={setFraction} digits={2} />
              </div>
              {coilSet && <Check label="Show coils" checked={showCoils} onChange={setShowCoils} />}
              <Check label="Show wall / winding-surface proxy" checked={showWall} onChange={setShowWall} />
              {showWall && (
                <div style={{ width: 200 }}>
                  <Slider label="Gap (× minor diameter)" value={wallGap} min={0.05} max={1} onChange={setWallGap} digits={2} />
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Geometry">
            <div className="kpis">
              <Kpi label="Major radius R" value={metrics.majorRadius} unit="m" digits={4} />
              <Kpi label="Minor radius a" value={metrics.minorRadius} unit="m" digits={4} />
              <Kpi label="Aspect ratio R/a" value={metrics.aspectRatio} digits={4} />
              <Kpi label="Plasma volume" value={metrics.volume} unit="m³" digits={4} />
              <Kpi label="Surface area" value={metrics.area} unit="m²" digits={4} />
              <Kpi label="Max elongation" value={metrics.maxElongation} digits={3} note="inertia ellipse, any φ" />
              <Kpi label="Saddle fraction" value={`${(metrics.saddleFraction * 100).toFixed(1)} %`} note="area with K < 0" />
              <Kpi label="Max |κ|" value={metrics.maxCurvature} unit="1/m" note={`min bend radius ${fmt(1 / metrics.maxCurvature)} m`} />
              <Kpi label="Field periods" value={surface.nfp} />
              <Kpi label="Toroidal flux (B0·Ā)" value={active.B0 * metrics.meanCrossSection} unit="Wb" note={`B0 = ${active.B0} T`} />
            </div>
          </Panel>
          <div className="grid cols-2">
            <Panel title="Cross-sections" sub="three planes within one field period">
              <Plot series={sections} xLabel="R [m]" yLabel="Z [m]" equalAspect height={340} filename="cross-sections" />
            </Panel>
            <Panel title="Fourier spectrum" sub="log₁₀ |(RBC, ZBS)| by (n, m)">
              <Plot
                heatmap={{ values: spectrum.v, nx: spectrum.nx, ny: spectrum.ny, x: [-spectrum.ntor - 0.5, spectrum.ntor + 0.5], y: [-0.5, spectrum.mpol + 0.5], colormap: 'magma', label: 'log₁₀|c|' }}
                xLabel="toroidal mode n"
                yLabel="poloidal mode m"
                height={340}
                filename="spectrum"
              />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
