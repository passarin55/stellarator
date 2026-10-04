import { REFERENCES } from '@data/references';
import { Panel, PageHead } from '../components/Controls';

const TOPICS: Record<string, string> = {
  theory: 'Theory',
  codes: 'Codes & numerical methods',
  physics: 'Plasma & fusion physics',
  devices: 'Devices',
  industry: 'Power-plant designs & industry',
  data: 'Data',
};

export default function References() {
  const topics = [...new Set(REFERENCES.map((r) => r.topic))];
  return (
    <div className="page">
      <PageHead
        title="References & provenance"
        lead="Everything in the lab is traceable. Bundled boundaries and coils come from the MIT-licensed simsopt repository; the near-axis solver is a port of pyQSC; validation fixtures were generated with both codes (see tests/fixtures)."
      />
      <div className="stack">
        {topics.map((t) => (
          <Panel key={t} title={TOPICS[t] ?? t}>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {REFERENCES.filter((r) => r.topic === t).map((r) => (
                <li key={r.id} style={{ marginBottom: 8 }}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.cite}
                  </a>
                  <div className="small faint">Used for: {r.usedFor}</div>
                </li>
              ))}
            </ol>
          </Panel>
        ))}
        <Panel title="Validation summary">
          <table className="data">
            <thead>
              <tr>
                <th>Module</th>
                <th>Reference</th>
                <th>Agreement</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Near-axis σ-equation (7 published configs)</td><td>pyQSC</td><td className="num">ι to 10⁻⁹, L∇B & elongation to 10⁻⁵</td></tr>
              <tr><td>Surface volume / area / R / a / aspect ratio</td><td>simsopt SurfaceRZFourier</td><td className="num">≤ 10⁻⁷ relative</td></tr>
              <tr><td>Biot–Savart (W7-X, NCSX, HSX)</td><td>simsopt BiotSavart</td><td className="num">&lt; 10⁻⁴ relative</td></tr>
              <tr><td>Circular loop on-axis field</td><td>analytic</td><td className="num">10⁻⁶</td></tr>
              <tr><td>W7-X standard ι, axis, residue</td><td>known W7-X values</td><td className="num">ι₀ ≈ 0.857, edge → 5/5</td></tr>
              <tr><td>W7-X stored magnetic energy</td><td>≈ 600 MJ (IPP)</td><td className="num">≈ 540 MJ (filament model)</td></tr>
              <tr><td>REGCOIL → coils → field lines (LP-QA)</td><td>Landreman & Paul 2022: ι ≈ 0.42</td><td className="num">0.38 &lt; ι &lt; 0.46, low shear</td></tr>
              <tr><td>Bosch–Hale D-T ⟨σv⟩</td><td>Bosch & Hale Table VIII</td><td className="num">≤ 0.5 %</td></tr>
              <tr><td>Lawson ignition minimum</td><td>≈ 3×10²¹ keV s m⁻³ at ≈ 14 keV</td><td className="num">✓</td></tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
