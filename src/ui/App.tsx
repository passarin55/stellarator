import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useRoute, navigate } from './state/router';
import { store, useStore, exportProject, importProject, toast } from './state/store';
import { downloadText } from './lib/format';
import {
  IconHome, IconTorus, IconAxis, IconCoil, IconField, IconReactor, IconCalc, IconAtlas, IconBook, IconRefs,
  IconSun, IconMoon, IconMenu, IconSearch, IconDownload, IconUpload, Logo,
} from './components/Icons';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Studio = lazy(() => import('./pages/Studio'));
const NearAxis = lazy(() => import('./pages/NearAxis'));
const CoilLab = lazy(() => import('./pages/CoilLab'));
const FieldLab = lazy(() => import('./pages/FieldLab'));
const Reactor = lazy(() => import('./pages/Reactor'));
const Formulary = lazy(() => import('./pages/Formulary'));
const Atlas = lazy(() => import('./pages/Atlas'));
const Learn = lazy(() => import('./pages/Learn'));
const References = lazy(() => import('./pages/References'));

interface RouteDef {
  path: string;
  title: string;
  icon: ComponentType<{ size?: number }>;
  section: 'Lab' | 'Knowledge' | '';
  component: ComponentType;
  keywords: string;
}

export const ROUTES: RouteDef[] = [
  { path: '/', title: 'Overview', icon: IconHome, section: '', component: Dashboard, keywords: 'home dashboard start' },
  { path: '/studio', title: 'Configuration Studio', icon: IconTorus, section: 'Lab', component: Studio, keywords: 'boundary fourier vmec surface shape 3d cross section' },
  { path: '/near-axis', title: 'Near-Axis Designer', icon: IconAxis, section: 'Lab', component: NearAxis, keywords: 'quasisymmetry qa qh pyqsc sigma iota axis' },
  { path: '/coils', title: 'Coil Lab', icon: IconCoil, section: 'Lab', component: CoilLab, keywords: 'coils regcoil biot savart forces inductance energy' },
  { path: '/field', title: 'Field-Line Lab', icon: IconField, section: 'Lab', component: FieldLab, keywords: 'poincare field lines iota islands axis tracing' },
  { path: '/reactor', title: 'Reactor Studio', icon: IconReactor, section: 'Lab', component: Reactor, keywords: 'popcon power balance iss04 lawson fusion power q' },
  { path: '/formulary', title: 'Plasma Formulary', icon: IconCalc, section: 'Lab', component: Formulary, keywords: 'debye larmor collisionality frequency formulary' },
  { path: '/atlas', title: 'Device Atlas', icon: IconAtlas, section: 'Knowledge', component: Atlas, keywords: 'devices w7x lhd hsx stellaris infinity helios timeline history' },
  { path: '/learn', title: 'Learn', icon: IconBook, section: 'Knowledge', component: Learn, keywords: 'theory tutorial boozer quasisymmetry omnigeneity' },
  { path: '/references', title: 'References', icon: IconRefs, section: 'Knowledge', component: References, keywords: 'sources papers citations bibliography' },
];

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);
  return theme;
}

export function App() {
  const { path } = useRoute();
  const theme = useTheme();
  const sidebarOpen = useStore((s) => s.ui.sidebarOpen);
  const paletteOpen = useStore((s) => s.ui.paletteOpen);
  const toasts = useStore((s) => s.toasts);
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  const Page = route.component;
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = route.path === '/' ? 'Stellarator Studio Lab' : `${route.title} · Stellarator Studio Lab`;
    store.set((s) => ({ ui: { ...s.ui, sidebarOpen: false } }));
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, [route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        store.set((s) => ({ ui: { ...s.ui, paletteOpen: !s.ui.paletteOpen } }));
      }
      if (e.key === 'Escape') store.set((s) => ({ ui: { ...s.ui, paletteOpen: false } }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cycleTheme = () => store.set({ theme: theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system' });

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <a className="brand" href="#/" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Logo />
          <div>
            Stellarator Studio Lab
            <small>3D magnetic confinement workbench</small>
          </div>
        </a>
        <nav className="nav">
          {(['', 'Lab', 'Knowledge'] as const).map((sec) => (
            <div key={sec} style={{ display: 'contents' }}>
              {sec && <div className="nav-section">{sec}</div>}
              {ROUTES.filter((r) => r.section === sec).map((r) => (
                <a key={r.path} href={`#${r.path}`} className={r.path === route.path ? 'active' : ''} aria-current={r.path === route.path ? 'page' : undefined}>
                  <r.icon size={16} />
                  {r.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row">
            <button className="btn sm" onClick={() => downloadText('stellarator-project.json', exportProject(), 'application/json')} title="Export project (boundary, coil settings, synthesised coils)">
              <IconDownload size={14} /> Save
            </button>
            <button className="btn sm" onClick={() => fileInput.current?.click()} title="Import project file">
              <IconUpload size={14} /> Open
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importProject(await f.text());
                  toast(`Loaded project ${f.name}`);
                } catch (err) {
                  toast(String(err instanceof Error ? err.message : err), 'error');
                }
                e.target.value = '';
              }}
            />
          </div>
          <span>Physics validated against pyQSC & simsopt · MIT</span>
        </div>
      </aside>
      {sidebarOpen && <div className="palette-backdrop" style={{ zIndex: 30, background: 'rgba(0,0,0,.3)' }} onClick={() => store.set((s) => ({ ui: { ...s.ui, sidebarOpen: false } }))} />}
      <main className="main">
        <div className="topbar">
          <button className="btn ghost menu-btn" aria-label="Open navigation" onClick={() => store.set((s) => ({ ui: { ...s.ui, sidebarOpen: true } }))}>
            <IconMenu />
          </button>
          <span className="crumb">{route.title}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => store.set((s) => ({ ui: { ...s.ui, paletteOpen: true } }))} aria-label="Search and run commands">
            <IconSearch size={14} /> Search <kbd>⌘K</kbd>
          </button>
          <button className="btn ghost sm" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}. Click to change`}>
            {theme === 'light' ? <IconSun /> : theme === 'dark' ? <IconMoon /> : <span className="small">Auto</span>}
          </button>
        </div>
        <Suspense fallback={<div className="page muted">Loading module…</div>}>
          <Page />
        </Suspense>
      </main>
      {paletteOpen && <CommandPalette />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandPalette() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const close = () => store.set((s) => ({ ui: { ...s.ui, paletteOpen: false } }));
  const commands = useMemo(
    () => [
      ...ROUTES.map((r) => ({ label: `Go to ${r.title}`, hint: r.path, keywords: r.keywords, run: () => navigate(r.path) })),
      { label: 'Toggle dark / light theme', hint: 'theme', keywords: 'dark light theme', run: () => store.set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })) },
      { label: 'Export project file', hint: 'json', keywords: 'save export download', run: () => downloadText('stellarator-project.json', exportProject(), 'application/json') },
      { label: 'Load W7-X standard configuration', hint: 'studio', keywords: 'wendelstein w7x', run: () => navigate('/studio?b=w7x-standard') },
      { label: 'Load Landreman–Paul precise QA', hint: 'studio', keywords: 'qa precise landreman paul', run: () => navigate('/studio?b=landreman-paul-qa') },
      { label: 'Trace W7-X coils (Poincaré)', hint: 'field', keywords: 'poincare w7x trace', run: () => navigate('/field?c=w7x') },
      { label: 'Synthesise coils for the active boundary', hint: 'coils', keywords: 'regcoil synthesis', run: () => navigate('/coils?tab=synth') },
    ],
    [],
  );
  const filtered = commands.filter((c) => (c.label + ' ' + c.keywords).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="palette-backdrop" onClick={close}>
      <div className="palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Type a command or page…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel((s) => Math.min(filtered.length - 1, s + 1));
            if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
            if (e.key === 'Enter' && filtered[sel]) {
              filtered[sel].run();
              close();
            }
          }}
        />
        <ul role="listbox">
          {filtered.map((c, i) => (
            <li
              key={c.label}
              role="option"
              aria-selected={i === sel}
              className={i === sel ? 'sel' : ''}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                c.run();
                close();
              }}
            >
              <span>{c.label}</span>
              <small>{c.hint}</small>
            </li>
          ))}
          {!filtered.length && <li className="faint">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
