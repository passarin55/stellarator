import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';

/** KaTeX renderer. `block` renders display math. */
export function Tex({ children, block }: { children: string; block?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(children, { displayMode: !!block, throwOnError: false, strict: 'ignore' });
    } catch {
      return children;
    }
  }, [children, block]);
  return block ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Render a string with inline $…$ and display $$…$$ math segments. Used for
 * the Learn articles so content can be authored as plain strings.
 */
export function MathText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: { t: 'text' | 'inline' | 'block'; v: string }[] = [];
    const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
      if (m[1] !== undefined) out.push({ t: 'block', v: m[1] });
      else out.push({ t: 'inline', v: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
    return out;
  }, [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.t === 'text' ? <span key={i}>{p.v}</span> : <Tex key={i} block={p.t === 'block'}>{p.v}</Tex>,
      )}
    </>
  );
}
