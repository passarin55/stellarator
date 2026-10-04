import { useMemo, useState } from 'react';
import { formulary, type FormularyInput } from '@core/physics/formulary';
import { reactivity, REACTION_ENERGY, type Reaction } from '@core/physics/fusion';
import { Panel, Slider, PageHead } from '../components/Controls';
import { Plot } from '../components/Plot';
import { CATEGORICAL } from '../lib/colormap';
import { fmt } from '../lib/format';

const PRESETS: { name: string; v: FormularyInput }[] = [
  { name: 'W7-X core', v: { ne: 8e19, Te: 5000, Ti: 2500, B: 2.5, A: 1, Zi: 1, R: 5.5, iota: 0.9, epsEff: 0.008, eps: 0.05 } },
  { name: 'Reactor core (DT)', v: { ne: 2.5e20, Te: 15000, Ti: 15000, B: 9, A: 2.5, Zi: 1, R: 12.7, iota: 0.9, epsEff: 0.005, eps: 0.05 } },
  { name: 'Edge / divertor', v: { ne: 2e19, Te: 50, Ti: 50, B: 2.5, A: 1, Zi: 1, R: 5.5, iota: 1, epsEff: 0.01, eps: 0.1 } },
  { name: 'HSX', v: { ne: 2e18, Te: 1000, Ti: 50, B: 1, A: 1, Zi: 1, R: 1.2, iota: 1.05, epsEff: 0.005, eps: 0.05 } },
];

export default function Formulary() {
  const [v, setV] = useState<FormularyInput>(PRESETS[0].v);
  const out = useMemo(() => formulary(v), [v]);
  const set = (p: Partial<FormularyInput>) => setV((x) => ({ ...x, ...p }));
  const rx = useMemo(() => {
    const T: number[] = [];
    for (let t = 1; t <= 500; t *= 1.05) T.push(t);
    return { T, ...(Object.fromEntries((['DT', 'DHe3', 'DDn', 'DDp'] as Reaction[]).map((r) => [r, T.map((t) => Math.log10(reactivity(t, r)))])) as Record<Reaction, number[]>) };
  }, []);
  return (
    <div className="page">
      <PageHead title="Plasma Formulary" lead="Fundamental plasma parameters (NRL Plasma Formulary conventions) with stellarator-specific transport estimates." />
      <div className="split">
        <div className="stack">
          <Panel title="Inputs">
            <div className="row" style={{ marginBottom: 10 }}>
              {PRESETS.map((p) => (
                <button key={p.name} className="btn sm" onClick={() => setV(p.v)}>
                  {p.name}
                </button>
              ))}
            </div>
            <Slider label="n_e [m⁻³]" value={v.ne} min={1e16} max={1e22} log onChange={(x) => set({ ne: x })} />
            <Slider label="T_e [eV]" value={v.Te} min={1} max={1e5} log onChange={(x) => set({ Te: x })} />
            <Slider label="T_i [eV]" value={v.Ti} min={1} max={1e5} log onChange={(x) => set({ Ti: x })} />
            <Slider label="B [T]" value={v.B} min={0.05} max={20} log onChange={(x) => set({ B: x })} />
            <Slider label="Ion mass number A" value={v.A} min={1} max={4} onChange={(x) => set({ A: x })} />
            <Slider label="R [m]" value={v.R} min={0.2} max={25} log onChange={(x) => set({ R: x })} />
            <Slider label="ι" value={v.iota} min={0.1} max={2} onChange={(x) => set({ iota: x })} />
            <Slider label="ε = r/R" value={v.eps} min={0.005} max={0.3} log onChange={(x) => set({ eps: x })} />
            <Slider label="ε_eff (effective ripple)" value={v.epsEff} min={1e-4} max={0.2} log onChange={(x) => set({ epsEff: x })} />
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Results">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Quantity</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                    <th>Unit</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(out).map(([k, r]) => (
                    <tr key={k}>
                      <td>{r.label}</td>
                      <td className="num">{fmt(r.value, 4)}</td>
                      <td className="mono small">{r.unit}</td>
                      <td className="small muted" style={{ whiteSpace: 'normal', maxWidth: 360 }}>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Fusion reactivities ⟨σv⟩ (Bosch & Hale 1992)">
            <Plot
              series={(['DT', 'DHe3', 'DDn', 'DDp'] as Reaction[]).map((r, i) => ({ type: 'line' as const, x: rx.T.map(Math.log10), y: rx[r], color: CATEGORICAL[i], label: REACTION_ENERGY[r].label, width: 2 }))}
              xLabel="log₁₀ T [keV]"
              yLabel="log₁₀ ⟨σv⟩ [m³/s]"
              yDomain={[-27, -21]}
              height={320}
              filename="reactivity"
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
