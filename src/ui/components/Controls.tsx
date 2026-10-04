import { useEffect, useState, type ReactNode } from 'react';
import { fmt } from '../lib/format';

export function Panel(props: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string; id?: string }) {
  return (
    <section className={`panel ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions) && (
        <div className="panel-head">
          {props.title && <h3>{props.title}</h3>}
          {props.sub && <span className="sub">{props.sub}</span>}
          <span className="spacer" />
          {props.actions}
        </div>
      )}
      <div className={`panel-body ${props.flush ? 'flush' : ''}`}>{props.children}</div>
    </section>
  );
}

export function Kpi(props: { label: ReactNode; value: number | string | undefined; unit?: string; digits?: number; note?: ReactNode; tone?: 'good' | 'warn' | 'bad'; title?: string }) {
  const v = typeof props.value === 'number' ? fmt(props.value, props.digits ?? 3) : (props.value ?? '—');
  return (
    <div className={`kpi ${props.tone ?? ''}`} title={props.title}>
      <div className="k-label">{props.label}</div>
      <div className="k-value">
        {v}
        {props.unit && <span className="k-unit">{props.unit}</span>}
      </div>
      {props.note && <div className="k-note">{props.note}</div>}
    </div>
  );
}

/** Slider + numeric readout. Supports log scale. */
export function Slider(props: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  digits?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const { min, max, log } = props;
  const toPos = (v: number) => (log ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (v - min) / (max - min));
  const fromPos = (p: number) => (log ? Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))) : min + p * (max - min));
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(fmtInput(props.value, props.digits)), [props.value, props.digits]);
  return (
    <div className="field" title={props.hint}>
      <div className="label">
        <span>{props.label}</span>
        <input
          aria-label={typeof props.label === 'string' ? props.label : undefined}
          className="mono"
          style={{ width: 92, padding: '1px 6px', textAlign: 'right' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = Number(text);
            if (Number.isFinite(v)) props.onChange(v);
            else setText(fmtInput(props.value, props.digits));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(1000 * Math.min(1, Math.max(0, toPos(props.value))))}
        onChange={(e) => {
          let v = fromPos(Number(e.target.value) / 1000);
          if (props.step && !log) v = Math.round(v / props.step) * props.step;
          props.onChange(Number(v.toPrecision(10)));
        }}
      />
      {props.unit && <span className="faint small" style={{ textAlign: 'right', marginTop: -4 }}>{props.unit}</span>}
    </div>
  );
}

const fmtInput = (v: number, digits = 4) => {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(Math.max(1, digits - 1));
  return String(Number(v.toPrecision(digits)));
};

export function Seg<T extends string | number>(props: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === props.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>(props: { label?: ReactNode; value: T; options: { value: T; label: string; group?: string }[]; onChange: (v: T) => void }) {
  const groups = [...new Set(props.options.map((o) => o.group ?? ''))];
  return (
    <div className="field">
      {props.label && <span className="label">{props.label}</span>}
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {props.options.filter((o) => o.group === g).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            props.options.filter((o) => !o.group).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
    </div>
  );
}

export function Check(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label && <div className="small faint" style={{ marginBottom: 4 }}>{label} — {Math.round(value * 100)} %</div>}
      <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function PageHead(props: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{props.title}</h1>
        {props.lead && <p>{props.lead}</p>}
      </div>
      {props.actions && <div className="row">{props.actions}</div>}
    </div>
  );
}
