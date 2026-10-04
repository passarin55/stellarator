import { useRoute, navigate } from '../state/router';
import { ARTICLES } from '@data/learn';
import { Panel } from '../components/Controls';
import { MathText } from '../components/Tex';
import { IconArrow } from '../components/Icons';

export default function Learn() {
  const { query } = useRoute();
  const id = query.get('a') ?? ARTICLES[0].id;
  const idx = Math.max(0, ARTICLES.findIndex((a) => a.id === id));
  const art = ARTICLES[idx];
  return (
    <div className="page">
      <div className="split">
        <div className="stack" style={{ position: 'sticky', top: 64 }}>
          <Panel title="Chapters">
            <nav className="toc">
              {ARTICLES.map((a) => (
                <a key={a.id} href={`#/learn?a=${a.id}`} className={a.id === art.id ? 'active' : ''}>
                  {a.title}
                </a>
              ))}
            </nav>
          </Panel>
        </div>
        <article className="prose">
          <h1>{art.title}</h1>
          <p className="muted" style={{ fontSize: 16 }}>{art.summary}</p>
          {art.lab && (
            <a className="btn" href={art.lab.href} style={{ marginBottom: 8 }}>
              {art.lab.label} <IconArrow size={14} />
            </a>
          )}
          {art.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.body.map((p, i) => (
                <p key={i}>
                  <MathText text={p} />
                </p>
              ))}
            </section>
          ))}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 32 }}>
            {idx > 0 ? <button className="btn" onClick={() => navigate(`/learn?a=${ARTICLES[idx - 1].id}`)}>← {ARTICLES[idx - 1].title}</button> : <span />}
            {idx < ARTICLES.length - 1 && <button className="btn primary" onClick={() => navigate(`/learn?a=${ARTICLES[idx + 1].id}`)}>{ARTICLES[idx + 1].title} →</button>}
          </div>
        </article>
      </div>
    </div>
  );
}
