import { useMemo, useState } from 'react';
import { DEVICES, OPT_LABEL, type Device, type Status } from '@data/devices';
import { TIMELINE, GLOSSARY } from '@data/history';
import { Panel, PageHead, Seg } from '../components/Controls';
import { Plot, type Series } from '../components/Plot';
import { CATEGORICAL } from '../lib/colormap';
import { navigate } from '../state/router';
import { setBoundary, libraryBoundary } from '../state/project';
import { store } from '../state/store';

type SortKey = 'name' | 'R' | 'a' | 'B' | 'nfp' | 'years';
const OPT_CLASS: Record<string, string> = { QA: 'qa', QH: 'qh', QI: 'qi', classical: 'classical', heliotron: 'classical', heliac: 'classical', hybrid: 'classical' };
const STATUS_CLASS: Record<Status, string> = { operating: 'status-op', construction: 'status-op', design: 'status-design', past: 'status-past', cancelled: 'status-past' };

export default function Atlas() {
  const [filter, setFilter] = useState<'all' | 'experiments' | 'designs'>('all');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'R', dir: -1 });
  const [sel, setSel] = useState<Device | null>(DEVICES[0]);
  const [axes, setAxes] = useState<'RB' | 'Ra'>('RB');

  const rows = useMemo(() => {
    const f = DEVICES.filter((d) => (filter === 'all' ? true : filter === 'designs' ? d.status === 'design' : d.status !== 'design'));
    return [...f].sort((a, b) => {
      const va = a[sort.k] ?? -Infinity;
      const vb = b[sort.k] ?? -Infinity;
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  }, [filter, sort]);

  const scatter = useMemo<Series[]>(() => {
    const groups = ['QI', 'QA', 'QH', 'heliotron', 'heliac', 'classical', 'hybrid'] as const;
    return groups
      .map((g, i) => {
        const ds = DEVICES.filter((d) => d.optimization === g && d.R && (axes === 'RB' ? d.B : d.a));
        return { type: 'scatter' as const, x: ds.map((d) => Math.log10(d.R!)), y: ds.map((d) => (axes === 'RB' ? d.B! : Math.log10(d.a!))), color: CATEGORICAL[i], size: 5, label: OPT_LABEL[g] };
      })
      .filter((s) => s.x.length);
  }, [axes]);

  const head = (k: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 }))} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label} {sort.k === k ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  );

  return (
    <div className="page">
      <PageHead title="Device Atlas" lead="Stellarator experiments and power-plant designs from 1951 to today. Parameters are nominal published values; entries marked ≈ vary between sources. Every entry links its sources." />
      <div className="split-r">
        <div className="stack">
          <Panel title="Devices" actions={<Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'experiments', label: 'Experiments' }, { value: 'designs', label: 'Power-plant designs' }]} />} flush>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {head('name', 'Name')}
                    <th>Type</th>
                    <th>Status</th>
                    {head('nfp', 'nfp')}
                    {head('R', 'R [m]')}
                    {head('a', 'a [m]')}
                    {head('B', 'B [T]')}
                    <th>A = R/a</th>
                    {head('years', 'Years')}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} onClick={() => setSel(d)} style={{ cursor: 'pointer', background: sel?.id === d.id ? 'var(--accent-soft)' : undefined }}>
                      <td>
                        <strong>{d.name}</strong>
                        {d.approx && <span className="faint" title="approximate values"> ≈</span>}
                        <div className="small faint">{d.country}</div>
                      </td>
                      <td>
                        <span className={`badge ${OPT_CLASS[d.optimization]}`}>{d.optimization}</span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_CLASS[d.status]}`}>{d.status}</span>
                      </td>
                      <td className="num">{d.nfp ?? '—'}</td>
                      <td className="num">{d.R ?? '—'}</td>
                      <td className="num">{d.a ?? '—'}</td>
                      <td className="num">{d.B ?? '—'}</td>
                      <td className="num">{d.R && d.a ? (d.R / d.a).toFixed(1) : '—'}</td>
                      <td className="small">{d.years}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Design space" actions={<Seg value={axes} onChange={setAxes} options={[{ value: 'RB', label: 'B vs R' }, { value: 'Ra', label: 'a vs R' }]} />}>
            <Plot series={scatter} xLabel="log₁₀ R [m]" yLabel={axes === 'RB' ? 'B [T]' : 'log₁₀ a [m]'} height={340} filename="atlas-design-space" />
            <p className="small faint">Power-plant designs (top right) combine large size with high-field HTS magnets; experiments cluster at R ≲ 6 m, B ≲ 3 T.</p>
          </Panel>
          <Panel title="Timeline">
            <div className="timeline">
              {TIMELINE.map((t) => (
                <div className="tl-item" key={t.year + t.title}>
                  <span className="tl-year">{t.year}</span>
                  <strong>{t.title}</strong> <span className="badge">{t.tag}</span>
                  <div className="small muted">{t.text}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="stack" style={{ position: 'sticky', top: 64 }}>
          {sel && (
            <Panel title={sel.name} sub={sel.institution}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className={`badge ${OPT_CLASS[sel.optimization]}`}>{OPT_LABEL[sel.optimization]}</span>
                <span className={`badge ${STATUS_CLASS[sel.status]}`}>{sel.status}</span>
                <span className="badge">{sel.years}</span>
              </div>
              <table className="data" style={{ marginBottom: 10 }}>
                <tbody>
                  <tr><td>Field periods</td><td className="num">{sel.nfp ?? '—'}</td></tr>
                  <tr><td>Major / minor radius</td><td className="num">{sel.R ?? '—'} / {sel.a ?? '—'} m</td></tr>
                  <tr><td>Field on axis</td><td className="num">{sel.B ?? '—'} T</td></tr>
                  {sel.volume && <tr><td>Plasma volume</td><td className="num">{sel.volume} m³</td></tr>}
                  {sel.fusionPower && <tr><td>Fusion power</td><td className="num">{sel.fusionPower} MW</td></tr>}
                  <tr><td>Superconducting</td><td className="num">{sel.superconducting === null ? '—' : sel.superconducting ? 'yes' : 'no'}</td></tr>
                </tbody>
              </table>
              <p className="small"><strong>Coils:</strong> {sel.coils}</p>
              <ul className="small muted" style={{ paddingLeft: 18 }}>
                {sel.highlights.map((h) => <li key={h}>{h}</li>)}
              </ul>
              <div className="row" style={{ marginBottom: 10 }}>
                {sel.boundaryId && (
                  <button className="btn sm primary" onClick={() => { setBoundary(libraryBoundary(sel.boundaryId!)); navigate('/studio'); }}>
                    Open boundary in Studio
                  </button>
                )}
                {sel.coilSetId && (
                  <button className="btn sm" onClick={() => { store.set({ coilSetId: sel.coilSetId! }); navigate(`/field?c=${sel.coilSetId}`); }}>
                    Trace its coils
                  </button>
                )}
              </div>
              <div className="small">
                <strong>Sources</strong>
                <ul style={{ paddingLeft: 18, margin: '4px 0 0' }}>
                  {sel.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          )}
          <Panel title="Glossary">
            <dl style={{ margin: 0, maxHeight: 420, overflowY: 'auto' }}>
              {GLOSSARY.map((g) => (
                <div key={g.term} style={{ marginBottom: 8 }}>
                  <dt style={{ fontWeight: 600 }}>{g.term}</dt>
                  <dd className="small muted" style={{ margin: 0 }}>{g.def}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
