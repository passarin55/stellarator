import { useMemo } from 'react';
import { Viewer3D } from '../components/Viewer3D';
import { Panel, Kpi } from '../components/Controls';
import { surfaceLayer } from '../lib/geometry3d';
import { BOUNDARIES, COILSETS } from '@data/library';
import { expandCoils } from '@core/coils/coils';
import { DEVICES } from '@data/devices';
import { TIMELINE } from '@data/history';
import { IconTorus, IconAxis, IconCoil, IconField, IconReactor, IconAtlas, IconBook, IconCalc, IconArrow } from '../components/Icons';
import { CATEGORICAL } from '../lib/colormap';

const MODULES = [
  { href: '#/studio', icon: IconTorus, title: 'Configuration Studio', text: 'Load W7-X, NCSX or precise-QS boundaries, edit Fourier modes, inspect curvature and export VMEC input.' },
  { href: '#/near-axis', icon: IconAxis, title: 'Near-Axis Designer', text: 'Design quasisymmetric fields from the axis shape in milliseconds (pyQSC-exact σ-equation).' },
  { href: '#/coils', icon: IconCoil, title: 'Coil Lab', text: 'Real W7-X/NCSX/HSX coils, forces & stored energy — or synthesise coils for any boundary with REGCOIL.' },
  { href: '#/field', icon: IconField, title: 'Field-Line Lab', text: 'Parallel Biot–Savart grids, Poincaré sections, magnetic-axis Newton solver and ι profiles with islands.' },
  { href: '#/reactor', icon: IconReactor, title: 'Reactor Studio', text: 'ISS04 + Bosch–Hale power balance, POPCON maps and Lawson diagrams for Stellaris, Infinity Two, Helios.' },
  { href: '#/formulary', icon: IconCalc, title: 'Plasma Formulary', text: 'Debye length, gyroradii, frequencies, collisionality and the 1/ν transport estimate.' },
  { href: '#/atlas', icon: IconAtlas, title: 'Device Atlas', text: `${DEVICES.length} experiments and power-plant designs, a 75-year timeline and glossary — all sourced.` },
  { href: '#/learn', icon: IconBook, title: 'Learn', text: 'Seven illustrated chapters from “why twist the field” to quasi-isodynamic reactors.' },
];

export default function Dashboard() {
  const w7x = BOUNDARIES.find((b) => b.id === 'w7x-standard')!;
  const scene = useMemo(() => {
    const { layer } = surfaceLayer(w7x.surface, { coloring: 'Z', fraction: 0.8, colormap: 'plasma', nphi: 140 });
    const set = COILSETS[0];
    const coils = expandCoils(set, 96)
      .filter((c) => c.current !== 0)
      .filter((c) => {
        // show the coils of the same 80 % sector
        let phi = Math.atan2(c.points[1], c.points[0]);
        if (phi < 0) phi += 2 * Math.PI;
        return phi < 2 * Math.PI * 0.8;
      })
      .map((c) => ({ points: c.points, color: CATEGORICAL[c.baseIndex % CATEGORICAL.length], radius: 0.06 }));
    return { surfaces: [layer], coils };
  }, [w7x.surface]);

  return (
    <div className="page">
      <div className="hero" style={{ marginBottom: 20 }}>
        <div className="stack" style={{ justifyContent: 'center' }}>
          <h1>
            Design stellarators <span className="gradient-text">in your browser</span>
          </h1>
          <p className="muted" style={{ fontSize: 15.5 }}>
            Stellarator Studio Lab is a complete, physics-validated workbench for twisted-field fusion devices: from the shape of the
            magnetic axis to coils, field lines and power-plant performance. Every solver runs locally in parallel Web Workers — no server, no install.
          </p>
          <div className="kpis">
            <Kpi label="Physics modules" value="9" note="near-axis · REGCOIL · Biot–Savart · …" />
            <Kpi label="Validation tests" value="50+" note="vs pyQSC & simsopt" />
            <Kpi label="Real coil sets" value="3" note="W7-X · NCSX · HSX" />
            <Kpi label="Devices & designs" value={DEVICES.length} />
          </div>
          <div className="row">
            <a className="btn primary" href="#/studio">
              Open the Studio <IconArrow size={14} />
            </a>
            <a className="btn" href="#/field?c=w7x">
              Trace W7-X field lines
            </a>
            <a className="btn" href="#/learn">
              Learn the physics
            </a>
          </div>
        </div>
        <Panel title="Wendelstein 7-X" sub="standard configuration · 50 non-planar coils (planar coils off) · coloured by Z" flush>
          <Viewer3D surfaces={scene.surfaces} coils={scene.coils} height={420} fitKey="dash" autoRotate />
        </Panel>
      </div>

      <h2>Lab modules</h2>
      <div className="grid cols-4" style={{ marginBottom: 24 }}>
        {MODULES.map((m) => (
          <a key={m.href} className="card-link" href={m.href}>
            <h3>
              <m.icon size={18} /> {m.title}
            </h3>
            <p>{m.text}</p>
          </a>
        ))}
      </div>

      <div className="grid cols-2">
        <Panel title="A suggested path through the lab">
          <ol className="muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
            <li>
              In the <a href="#/near-axis">Near-Axis Designer</a> pick “Precise QA axis” and read off ι ≈ 0.42.
            </li>
            <li>Click <em>Send boundary to Studio</em> — the first-order surface is converted to VMEC Fourier modes.</li>
            <li>
              In the <a href="#/coils?tab=synth">Coil Lab → Synthesis</a> run REGCOIL and cut 12 modular coils per period.
            </li>
            <li>
              Send the coils to the <a href="#/field">Field-Line Lab</a>: Poincaré sections show nested surfaces and the measured ι.
            </li>
            <li>
              Scale it up in the <a href="#/reactor">Reactor Studio</a> and find where Q &gt; 10 on the POPCON.
            </li>
          </ol>
        </Panel>
        <Panel title="Latest milestones" actions={<a href="#/atlas" className="small">Full timeline →</a>}>
          <div className="timeline">
            {TIMELINE.slice(-4)
              .reverse()
              .map((t) => (
                <div className="tl-item" key={t.title}>
                  <span className="tl-year">{t.year}</span>
                  <strong>{t.title}</strong>
                  <div className="small muted">{t.text}</div>
                </div>
              ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
