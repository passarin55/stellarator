/** Number formatting helpers with engineering-friendly output. */
export function fmt(x: number | undefined | null, digits = 3): string {
  if (x === undefined || x === null || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) {
    const [m, e] = x.toExponential(Math.max(0, digits - 1)).split('e');
    return `${m}×10${superscript(Number(e))}`;
  }
  return Number(x.toPrecision(digits)).toLocaleString('en-US', { maximumSignificantDigits: digits });
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const superscript = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** SI prefix formatting: fmtSI(1.62e6, 'A') → "1.62 MA" */
export function fmtSI(x: number, unit: string, digits = 3): string {
  if (!Number.isFinite(x)) return fmt(x);
  const prefixes: [number, string][] = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'],
  ];
  const a = Math.abs(x);
  for (const [v, p] of prefixes) if (a >= v || v === 1e-9) return `${Number((x / v).toPrecision(digits))} ${p}${unit}`;
  return `${x} ${unit}`;
}

export const pct = (x: number, digits = 2) => `${(x * 100).toFixed(digits)} %`;

/** "Nice" axis ticks (Heckbert). */
export function niceTicks(lo: number, hi: number, count = 6): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const range = niceNum(hi - lo, false);
  const step = niceNum(range / Math.max(1, count - 1), true);
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function niceNum(x: number, round: boolean): number {
  const e = Math.floor(Math.log10(x));
  const f = x / 10 ** e;
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** e;
}

export const tickLabel = (v: number) => {
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-2 || a >= 1e5)) return v.toExponential(1).replace('e+', 'e');
  return String(Number(v.toPrecision(4)));
};

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
