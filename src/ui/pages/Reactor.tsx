import { useMemo, useState, useDeferredValue } from 'react';
import { powerBalance, popcon, lawsonIgnition, lawsonQ, type PlasmaParams } from '@core/physics/reactor';
import { reactivity } from '@core/physics/fusion';
import { Panel, Kpi, Slider, PageHead, Seg } from '../components/Controls';
import { Plot } from '../components/Plot';
import { CATEGORICAL } from '../lib/colormap';
import { fmt, pct } from '../lib/format';
import { MathText } from '../components/Tex';

type Base = Omit<PlasmaParams, 'Paux'>;

const PRESETS: { id: string; name: string; note: string; p: Base }[] = [
  {
    id: 'stellaris',
    name: 'Stellaris (Proxima)',
    note: 'R 12.7 m, a 1.3 m, B 9 T. Calibrated to the published ⟨β⟩ ≈ 2.8 % and ≈ 6 MW/m³ (≈ 2.6 GW) average fusion power density.',
    p: { R: 12.7, a: 1.3, B: 9, iota23: 0.95, nAvg: 2.3, TAvg: 9.5, alphaN: 0.4, alphaT: 1.2, Zeff: 1.5, dilution: 0.85, fRen: 1.5 },
  },
  {
    id: 'inf2',
    name: 'Infinity Two (Type One)',
    note: 'R 12.5 m, a 1.25 m, B 9 T; calibrated to P_fus ≈ 800 MW (the paper quotes ⟨n⟩ = 2×10²⁰ m⁻³ with its own profiles).',
    p: { R: 12.5, a: 1.25, B: 9, iota23: 0.9, nAvg: 1.6, TAvg: 8, alphaN: 0.3, alphaT: 1.3, Zeff: 1.5, dilution: 0.85, fRen: 1.4 },
  },
  {
    id: 'helios',
    name: 'Helios (Thea)',
    note: 'QA, R 8 m, a 1.8 m, B 6 T; calibrated to P_fus ≈ 950 MW.',
    p: { R: 8, a: 1.8, B: 6, iota23: 0.45, nAvg: 1.2, TAvg: 10, alphaN: 0.4, alphaT: 1.2, Zeff: 1.6, dilution: 0.85, fRen: 1.6 },
  },
  {
    id: 'helias5b',
    name: 'HELIAS 5-B (EU)',
    note: 'R 22 m, a 1.8 m, B 5.7 T, ~3 GW fusion.',
    p: { R: 22, a: 1.8, B: 5.7, iota23: 0.95, nAvg: 1.4, TAvg: 9.5, alphaN: 0.3, alphaT: 1.2, Zeff: 1.5, dilution: 0.85, fRen: 1.3 },
  },
  {
    id: 'w7x',
    name: 'W7-X (D-T thought experiment)',
    note: 'R 5.5 m, a 0.53 m, B 2.5 T — what if W7-X ran on D-T?',
    p: { R: 5.5, a: 0.53, B: 2.5, iota23: 0.95, nAvg: 0.8, TAvg: 3, alphaN: 0.3, alphaT: 1.5, Zeff: 1.5, dilution: 0.9, fRen: 1.2 },
  },
];

export default function Reactor() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [p, setP] = useState<Base>(PRESETS[0].p);
  const [view, setView] = useState<'popcon' | 'lawson' | 'profiles'>('popcon');
  const set = (patch: Partial<Base>) => setP((x) => ({ ...x, ...patch }));
  const dp = useDeferredValue(p);

  const pb = useMemo(() => powerBalance(dp), [dp]);

  const pc = useMemo(() => {
    const { nAvg: _n, TAvg: _t, ...base } = dp;
    void _n;
    void _t;
    return popcon(base, [0.2, Math.max(4, dp.nAvg * 1.8)], [1.5, Math.max(20, dp.TAvg * 2)], 46, 46);
  }, [dp]);

  const lawson = useMemo(() => {
    const T: number[] = [];
    for (let t = 3; t <= 60; t *= 1.04) T.push(t);
    return {
      T,
      ign: T.map((t) => lawsonIgnition(t)),
      q1: T.map((t) => lawsonQ(t, 1)),
      q10: T.map((t) => lawsonQ(t, 10)),
    };
  }, []);

  const profiles = useMemo(() => {
    const rho = Array.from({ length: 101 }, (_, i) => i / 100);
    const n = rho.map((r) => pb.n0 * (1 - r * r) ** dp.alphaN);
    const T = rho.map((r) => pb.T0 * (1 - r * r) ** dp.alphaT);
    const pf = rho.map((_, i) => {
      const nDT = n[i] * 1e20 * dp.dilution;
      return (0.25 * nDT * nDT * reactivity(T[i]) * 17.589 * 1.602e-13) / 1e6;
    });
    return { rho, n, T, pf };
  }, [pb, dp]);

  const fmtLevel = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} GW` : `${Math.round(v)} MW`);

  return (
    <div className="page">
      <PageHead
        title="Reactor Studio"
        lead={<>0-D steady-state power balance with parabolic profiles, Bosch–Hale D-T reactivity, ISS04 confinement (×f<sub>ren</sub>) and the Sudo density limit. For each (⟨n⟩, ⟨T⟩) the auxiliary power that closes the balance is solved for — the POPCON shows where the machine ignites.</>}
      />
      <div className="split">
        <div className="stack">
          <Panel title="Design point">
            <div className="field">
              <span className="label">Preset</span>
              <div className="row">
                {PRESETS.map((x) => (
                  <button key={x.id} className={`btn sm ${presetId === x.id ? 'primary' : ''}`} onClick={() => { setPresetId(x.id); setP(x.p); }}>
                    {x.name}
                  </button>
                ))}
              </div>
              <span className="small faint">{PRESETS.find((x) => x.id === presetId)?.note}</span>
            </div>
            <Slider label="Major radius R" value={p.R} min={1} max={30} unit="m" onChange={(v) => set({ R: v })} />
            <Slider label="Minor radius a" value={p.a} min={0.1} max={3} unit="m" onChange={(v) => set({ a: v })} />
            <Slider label="Field on axis B" value={p.B} min={1} max={15} unit="T" onChange={(v) => set({ B: v })} />
            <Slider label="ι at ρ = 2/3" value={p.iota23} min={0.2} max={1.5} onChange={(v) => set({ iota23: v })} />
            <Slider label="⟨n_e⟩ [10²⁰ m⁻³]" value={p.nAvg} min={0.1} max={6} onChange={(v) => set({ nAvg: v })} />
            <Slider label="⟨T⟩ [keV]" value={p.TAvg} min={0.5} max={30} onChange={(v) => set({ TAvg: v })} />
            <div className="grid cols-2" style={{ gap: 8 }}>
              <Slider label="α_n (density peaking)" value={p.alphaN} min={0} max={3} onChange={(v) => set({ alphaN: v })} />
              <Slider label="α_T (temp. peaking)" value={p.alphaT} min={0} max={3} onChange={(v) => set({ alphaT: v })} />
              <Slider label="Z_eff" value={p.Zeff} min={1} max={4} onChange={(v) => set({ Zeff: v })} />
              <Slider label="Fuel dilution n_DT/n_e" value={p.dilution} min={0.5} max={1} onChange={(v) => set({ dilution: v })} />
            </div>
            <Slider label="ISS04 renormalisation f_ren" value={p.fRen} min={0.5} max={3} onChange={(v) => set({ fRen: v })} hint="W7-X high-performance ~1–1.5; reactor designs assume improved turbulence optimisation" />
          </Panel>
          <Panel title="Model">
            <div className="small muted">
              <MathText text="$\tau_E = f_{ren}\,0.134\,a^{2.28}R^{0.64}P^{-0.61}\bar n_{e}^{0.54}B^{0.84}\iota_{2/3}^{0.41}$" />
              <br />
              <MathText text="$P_\alpha + P_{aux} = W/\tau_E + P_{br}$,  $n_c = 0.25\sqrt{PB/(a^2R)}$" />
            </div>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Operating point">
            <div className="kpis">
              <Kpi label="Fusion power" value={pb.Pfus} unit="MW" digits={4} />
              <Kpi label="Q = P_fus/P_aux" value={pb.ignited ? 'ignited' : pb.Q} digits={3} tone={pb.ignited || pb.Q > 10 ? 'good' : pb.Q > 1 ? 'warn' : 'bad'} />
              <Kpi label="Auxiliary heating" value={pb.Paux} unit="MW" digits={3} />
              <Kpi label="α heating" value={pb.Palpha} unit="MW" digits={4} />
              <Kpi label="Bremsstrahlung" value={pb.Pbrems} unit="MW" digits={3} />
              <Kpi label="τ_E (required)" value={pb.tauE} unit="s" digits={3} note={`ISS04×f: ${fmt(pb.tauISS04)} s`} tone={pb.H <= 1 + 1e-6 ? 'good' : 'bad'} />
              <Kpi label="⟨β⟩" value={pct(pb.beta)} tone={pb.beta > 0.05 ? 'warn' : undefined} note="QI designs: ≲ 5 %" />
              <Kpi label="n / n_Sudo" value={pb.greenwaldLikeFraction} digits={3} tone={pb.greenwaldLikeFraction > 1 ? 'bad' : 'good'} />
              <Kpi label="Stored energy W" value={pb.Wth} unit="MJ" digits={4} />
              <Kpi label="n₀T₀τ_E" value={pb.tripleProduct} unit="keV s m⁻³" digits={3} />
              <Kpi label="Neutron wall load" value={pb.neutronWallLoad} unit="MW/m²" digits={3} tone={pb.neutronWallLoad > 2 ? 'warn' : undefined} />
              <Kpi label="Plasma volume" value={pb.volume} unit="m³" digits={4} />
            </div>
          </Panel>
          <Panel
            title={view === 'popcon' ? 'POPCON — fusion power with P_aux (white) and Q (cyan) contours' : view === 'lawson' ? 'Lawson diagram' : 'Profiles'}
            actions={<Seg value={view} onChange={setView} options={[{ value: 'popcon', label: 'POPCON' }, { value: 'lawson', label: 'Lawson' }, { value: 'profiles', label: 'Profiles' }]} />}
          >
            {view === 'popcon' && (
              <Plot
                heatmap={{ values: pc.Pfus, nx: pc.n.length, ny: pc.T.length, x: [pc.n[0], pc.n[pc.n.length - 1]], y: [pc.T[0], pc.T[pc.T.length - 1]], colormap: 'plasma', label: 'P_fus [MW]', log: true, vmin: 1, vmax: Math.max(10, ...Array.from(pc.Pfus)) }}
                contours={[
                  { values: pc.Paux, nx: pc.n.length, ny: pc.T.length, xs: pc.n, ys: pc.T, levels: [0.01, 10, 30, 100], color: '#ffffff', label: (l) => (l < 1 ? 'ignition' : `P_aux ${l} MW`), width: 1.4 },
                  { values: pc.Q, nx: pc.n.length, ny: pc.T.length, xs: pc.n, ys: pc.T, levels: [1, 5, 10, 30], color: '#22d3ee', label: (l) => `Q=${l}`, width: 1.2, dash: [5, 3] },
                  { values: pc.sudoFrac, nx: pc.n.length, ny: pc.T.length, xs: pc.n, ys: pc.T, levels: [1], color: '#f87171', label: () => 'Sudo limit', width: 2 },
                  { values: pc.beta, nx: pc.n.length, ny: pc.T.length, xs: pc.n, ys: pc.T, levels: [0.05], color: '#fbbf24', label: () => '⟨β⟩ = 5 %', width: 1.6, dash: [2, 3] },
                ]}
                series={[{ type: 'scatter', x: [p.nAvg], y: [p.TAvg], color: '#22c55e', size: 5, label: `operating point (${fmtLevel(pb.Pfus)})` }]}
                xLabel="⟨n_e⟩ [10²⁰ m⁻³]"
                yLabel="⟨T⟩ [keV]"
                height={460}
                filename="popcon"
              />
            )}
            {view === 'lawson' && (
              <Plot
                series={[
                  { type: 'line', x: lawson.T, y: lawson.ign.map((v) => Math.log10(v)), color: '#e11d48', label: 'ignition', width: 2 },
                  { type: 'line', x: lawson.T, y: lawson.q10.map((v) => Math.log10(v)), color: CATEGORICAL[2], label: 'Q = 10', width: 2 },
                  { type: 'line', x: lawson.T, y: lawson.q1.map((v) => Math.log10(v)), color: CATEGORICAL[0], label: 'Q = 1 (scientific breakeven)', width: 2 },
                  { type: 'scatter', x: [pb.T0], y: [Math.log10(pb.tripleProduct)], color: '#22c55e', size: 5, label: 'this design (peak n₀T₀τ_E)' },
                ]}
                xLabel="T [keV]"
                yLabel="log₁₀ (n T τ_E) [keV s m⁻³]"
                yDomain={[18.5, 23]}
                height={420}
                filename="lawson"
              />
            )}
            {view === 'profiles' && (
              <Plot
                series={[
                  { type: 'line', x: profiles.rho, y: profiles.n, color: CATEGORICAL[0], label: 'n_e [10²⁰ m⁻³]', width: 2 },
                  { type: 'line', x: profiles.rho, y: profiles.T.map((t) => t / 10), color: CATEGORICAL[1], label: 'T [10 keV]', width: 2 },
                  { type: 'line', x: profiles.rho, y: profiles.pf, color: CATEGORICAL[3], label: 'p_fus [MW/m³]', width: 2 },
                ]}
                xLabel="ρ = r/a"
                yLabel="value"
                height={420}
                filename="profiles"
              />
            )}
          </Panel>
          <div className="note">
            This is a scoping tool: real designs use 1-D transport, detailed radiation, fast-particle losses and engineering limits. Use it to build intuition for how size, field and confinement trade against each other — e.g. P_fus ∝ β²B⁴V at fixed temperature.
          </div>
        </div>
      </div>
    </div>
  );
}
