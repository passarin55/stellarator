/**
 * High-performance canvas plot: line/scatter series, filled heat maps,
 * labelled contour lines, reference lines, zoom (wheel), pan (drag),
 * double-click reset, hover readout and PNG/CSV export.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { niceTicks, tickLabel, downloadText } from '../lib/format';
import { colormap, gradientCss, type ColormapName } from '../lib/colormap';
import { marchingSquares } from '../lib/contour';

export interface Series {
  type: 'line' | 'scatter';
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  color: string;
  label?: string;
  width?: number;
  size?: number;
  dash?: number[];
  alpha?: number;
}

export interface HeatmapLayer {
  values: ArrayLike<number>;
  nx: number;
  ny: number;
  x: [number, number];
  y: [number, number];
  colormap: ColormapName;
  vmin?: number;
  vmax?: number;
  label?: string;
  log?: boolean;
}

export interface ContourLayer {
  values: ArrayLike<number>;
  nx: number;
  ny: number;
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  levels: number[];
  color: string;
  label?: (level: number) => string;
  width?: number;
  dash?: number[];
}

export interface RefLine {
  axis: 'x' | 'y';
  value: number;
  color?: string;
  label?: string;
  dash?: number[];
}

export interface PlotProps {
  series?: Series[];
  heatmap?: HeatmapLayer;
  contours?: ContourLayer[];
  refLines?: RefLine[];
  xLabel?: string;
  yLabel?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  equalAspect?: boolean;
  height?: number;
  legend?: boolean;
  title?: string;
  filename?: string;
  logY?: boolean;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

function extent(series: Series[], key: 'x' | 'y'): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    const a = s[key];
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.04;
  return [lo - pad, hi + pad];
}

export function Plot(props: PlotProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const height = props.height ?? 320;
  const [view, setView] = useState<{ x: [number, number]; y: [number, number] } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => setThemeTick((t) => t + 1);
    mq.addEventListener('change', onMq);
    return () => {
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener('change', onMq);
    };
  }, []);

  const series = useMemo(() => props.series ?? [], [props.series]);
  const baseDomain = useMemo(() => {
    let x = props.xDomain ?? (props.heatmap ? props.heatmap.x : extent(series, 'x'));
    let y = props.yDomain ?? (props.heatmap ? props.heatmap.y : extent(series, 'y'));
    if (props.equalAspect) {
      const m = { l: 56, r: 16 };
      const pw = width - m.l - m.r;
      const ph = height - 44;
      const sx = (x[1] - x[0]) / pw;
      const sy = (y[1] - y[0]) / ph;
      if (sx > sy) {
        const c = (y[0] + y[1]) / 2;
        const h = (sx * ph) / 2;
        y = [c - h, c + h];
      } else {
        const c = (x[0] + x[1]) / 2;
        const w = (sy * pw) / 2;
        x = [c - w, c + w];
      }
    }
    return { x, y };
  }, [props.xDomain, props.yDomain, props.heatmap, props.equalAspect, series, width, height]);

  // reset zoom when the data domain changes
  const domainKey = `${baseDomain.x[0]}|${baseDomain.x[1]}|${baseDomain.y[0]}|${baseDomain.y[1]}`;
  useEffect(() => setView(null), [domainKey]);
  const dom = view ?? baseDomain;
  const M = { l: 56, r: props.heatmap ? 64 : 16, t: 12, b: 36 };
  const pw = width - M.l - M.r;
  const ph = height - M.t - M.b;
  const sx = useCallback((x: number) => M.l + ((x - dom.x[0]) / (dom.x[1] - dom.x[0])) * pw, [dom, pw, M.l]);
  const sy = useCallback((y: number) => M.t + ph - ((y - dom.y[0]) / (dom.y[1] - dom.y[0])) * ph, [dom, ph, M.t]);

  // Heat-map image cache
  const heatImg = useMemo(() => {
    const h = props.heatmap;
    if (!h) return null;
    const c = document.createElement('canvas');
    c.width = h.nx;
    c.height = h.ny;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(h.nx, h.ny);
    let lo = h.vmin ?? Infinity;
    let hi = h.vmax ?? -Infinity;
    const tr = (v: number) => (h.log ? Math.log10(Math.max(v, 1e-30)) : v);
    if (h.vmin === undefined || h.vmax === undefined)
      for (let i = 0; i < h.values.length; i++) {
        const v = tr(h.values[i]);
        if (!Number.isFinite(v)) continue;
        if (h.vmin === undefined) lo = Math.min(lo, v);
        if (h.vmax === undefined) hi = Math.max(hi, v);
      }
    else {
      lo = tr(lo);
      hi = tr(hi);
    }
    for (let j = 0; j < h.ny; j++)
      for (let i = 0; i < h.nx; i++) {
        const v = tr(h.values[j * h.nx + i]);
        const o = ((h.ny - 1 - j) * h.nx + i) * 4;
        if (!Number.isFinite(v)) {
          img.data[o + 3] = 0;
          continue;
        }
        const [r, g, b] = colormap(h.colormap, (v - lo) / (hi - lo || 1));
        img.data[o] = r * 255;
        img.data[o + 1] = g * 255;
        img.data[o + 2] = b * 255;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, lo, hi };
  }, [props.heatmap]);

  const contourSegs = useMemo(
    () =>
      (props.contours ?? []).map((c) => ({
        layer: c,
        segs: c.levels.map((lv) => ({ level: lv, segs: marchingSquares(c.values, c.nx, c.ny, c.xs, c.ys, lv) })),
      })),
    [props.contours],
  );

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    cv.style.width = `${width}px`;
    cv.style.height = `${height}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const gridC = css('--plot-grid');
    const axisC = css('--plot-axis');
    const textC = css('--text-dim');
    ctx.font = '11px ' + css('--font-mono');

    // grid + ticks
    const xt = niceTicks(dom.x[0], dom.x[1], Math.max(3, Math.floor(pw / 90)));
    const yt = niceTicks(dom.y[0], dom.y[1], Math.max(3, Math.floor(ph / 50)));
    ctx.strokeStyle = gridC;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const t of xt) {
      const x = Math.round(sx(t)) + 0.5;
      ctx.moveTo(x, M.t);
      ctx.lineTo(x, M.t + ph);
    }
    for (const t of yt) {
      const y = Math.round(sy(t)) + 0.5;
      ctx.moveTo(M.l, y);
      ctx.lineTo(M.l + pw, y);
    }
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, pw, ph);
    ctx.clip();

    if (heatImg && props.heatmap) {
      const h = props.heatmap;
      ctx.imageSmoothingEnabled = true;
      const x0 = sx(h.x[0]);
      const x1 = sx(h.x[1]);
      const y0 = sy(h.y[1]);
      const y1 = sy(h.y[0]);
      ctx.drawImage(heatImg.canvas, x0, y0, x1 - x0, y1 - y0);
    }

    for (const { layer, segs } of contourSegs) {
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width ?? 1.4;
      ctx.setLineDash(layer.dash ?? []);
      for (const { level, segs: s } of segs) {
        ctx.beginPath();
        for (let i = 0; i < s.length; i += 4) {
          ctx.moveTo(sx(s[i]), sy(s[i + 1]));
          ctx.lineTo(sx(s[i + 2]), sy(s[i + 3]));
        }
        ctx.stroke();
        if (layer.label && s.length >= 4) {
          const k = Math.floor(s.length / 8) * 4;
          const lx = sx(s[k]);
          const ly = sy(s[k + 1]);
          const txt = layer.label(level);
          const w = ctx.measureText(txt).width + 6;
          ctx.fillStyle = css('--bg-elev');
          ctx.globalAlpha = 0.85;
          ctx.fillRect(lx - w / 2, ly - 8, w, 15);
          ctx.globalAlpha = 1;
          ctx.fillStyle = layer.color;
          ctx.textAlign = 'center';
          ctx.fillText(txt, lx, ly + 4);
        }
      }
      ctx.setLineDash([]);
    }

    for (const s of series) {
      ctx.globalAlpha = s.alpha ?? 1;
      if (s.type === 'line') {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width ?? 1.6;
        ctx.setLineDash(s.dash ?? []);
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < s.x.length; i++) {
          const xv = s.x[i];
          const yv = s.y[i];
          if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
            pen = false;
            continue;
          }
          if (!pen) ctx.moveTo(sx(xv), sy(yv));
          else ctx.lineTo(sx(xv), sy(yv));
          pen = true;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = s.color;
        const r = s.size ?? 1.4;
        for (let i = 0; i < s.x.length; i++) {
          const xv = s.x[i];
          const yv = s.y[i];
          if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
          ctx.fillRect(sx(xv) - r, sy(yv) - r, 2 * r, 2 * r);
        }
      }
      ctx.globalAlpha = 1;
    }

    for (const rl of props.refLines ?? []) {
      ctx.strokeStyle = rl.color ?? axisC;
      ctx.setLineDash(rl.dash ?? [4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (rl.axis === 'x') {
        ctx.moveTo(sx(rl.value), M.t);
        ctx.lineTo(sx(rl.value), M.t + ph);
      } else {
        ctx.moveTo(M.l, sy(rl.value));
        ctx.lineTo(M.l + pw, sy(rl.value));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (rl.label) {
        ctx.fillStyle = rl.color ?? textC;
        ctx.textAlign = 'left';
        if (rl.axis === 'x') ctx.fillText(rl.label, sx(rl.value) + 3, M.t + 11);
        else ctx.fillText(rl.label, M.l + pw - ctx.measureText(rl.label).width - 4, sy(rl.value) - 3);
      }
    }
    ctx.restore();

    // axes
    ctx.strokeStyle = axisC;
    ctx.beginPath();
    ctx.moveTo(M.l + 0.5, M.t);
    ctx.lineTo(M.l + 0.5, M.t + ph + 0.5);
    ctx.lineTo(M.l + pw, M.t + ph + 0.5);
    ctx.stroke();
    ctx.fillStyle = textC;
    ctx.textAlign = 'center';
    for (const t of xt) ctx.fillText(tickLabel(t), sx(t), M.t + ph + 14);
    ctx.textAlign = 'right';
    for (const t of yt) ctx.fillText(tickLabel(t), M.l - 6, sy(t) + 4);
    ctx.font = '12px ' + css('--font-sans');
    ctx.textAlign = 'center';
    if (props.xLabel) ctx.fillText(props.xLabel, M.l + pw / 2, height - 4);
    if (props.yLabel) {
      ctx.save();
      ctx.translate(12, M.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(props.yLabel, 0, 0);
      ctx.restore();
    }
    // colour bar for heat maps
    if (heatImg && props.heatmap) {
      const bx = width - M.r + 14;
      const g = ctx.createLinearGradient(0, M.t + ph, 0, M.t);
      for (let i = 0; i <= 10; i++) {
        const [r, gg, b] = colormap(props.heatmap.colormap, i / 10);
        g.addColorStop(i / 10, `rgb(${r * 255},${gg * 255},${b * 255})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(bx, M.t, 10, ph);
      ctx.fillStyle = textC;
      ctx.font = '10px ' + css('--font-mono');
      ctx.textAlign = 'left';
      const lab = (v: number) => tickLabel(props.heatmap!.log ? 10 ** v : v);
      ctx.fillText(lab(heatImg.hi), bx + 13, M.t + 8);
      ctx.fillText(lab(heatImg.lo), bx + 13, M.t + ph);
      if (props.heatmap.label) {
        ctx.save();
        ctx.translate(bx + 40, M.t + ph / 2);
        ctx.rotate(Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(props.heatmap.label, 0, 0);
        ctx.restore();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, dom, series, heatImg, contourSegs, props.refLines, props.xLabel, props.yLabel, themeTick]);

  // interactions
  const drag = useRef<{ x: number; y: number; dom: typeof dom } | null>(null);
  const toData = (px: number, py: number) => ({
    x: dom.x[0] + ((px - M.l) / pw) * (dom.x[1] - dom.x[0]),
    y: dom.y[0] + ((M.t + ph - py) / ph) * (dom.y[1] - dom.y[0]),
  });
  const onWheel = (e: React.WheelEvent) => {
    if (!e.shiftKey && !e.ctrlKey && !e.altKey) return; // don't hijack page scroll; modifier zooms
    e.preventDefault();
    const r = canvas.current!.getBoundingClientRect();
    const p = toData(e.clientX - r.left, e.clientY - r.top);
    const k = Math.exp(e.deltaY * 0.0015);
    setView({
      x: [p.x + (dom.x[0] - p.x) * k, p.x + (dom.x[1] - p.x) * k],
      y: [p.y + (dom.y[0] - p.y) * k, p.y + (dom.y[1] - p.y) * k],
    });
  };
  const onMove = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (drag.current) {
      const d = drag.current;
      const dx = ((px - d.x) / pw) * (d.dom.x[1] - d.dom.x[0]);
      const dy = ((py - d.y) / ph) * (d.dom.y[1] - d.dom.y[0]);
      setView({ x: [d.dom.x[0] - dx, d.dom.x[1] - dx], y: [d.dom.y[0] + dy, d.dom.y[1] + dy] });
      return;
    }
    if (px < M.l || px > M.l + pw || py < M.t || py > M.t + ph) {
      setTip(null);
      return;
    }
    const p = toData(px, py);
    let text = `x=${tickLabel(p.x)}  y=${tickLabel(p.y)}`;
    if (props.heatmap) {
      const h = props.heatmap;
      const i = Math.floor(((p.x - h.x[0]) / (h.x[1] - h.x[0])) * h.nx);
      const j = Math.floor(((p.y - h.y[0]) / (h.y[1] - h.y[0])) * h.ny);
      if (i >= 0 && i < h.nx && j >= 0 && j < h.ny) text += `  ${h.label ?? 'v'}=${tickLabel(h.values[j * h.nx + i])}`;
    } else {
      // nearest point on line series (screen distance)
      let best = 400;
      let bt = '';
      for (const s of series) {
        if (s.type !== 'line' || s.x.length > 5000) continue;
        for (let i = 0; i < s.x.length; i++) {
          const d = (sx(s.x[i]) - px) ** 2 + (sy(s.y[i]) - py) ** 2;
          if (d < best) {
            best = d;
            bt = `${s.label ?? ''} (${tickLabel(s.x[i])}, ${tickLabel(s.y[i])})`;
          }
        }
      }
      if (bt) text = bt;
    }
    setTip({ x: px + 12, y: py + 12, text });
  };

  const exportPng = () => {
    const a = document.createElement('a');
    a.href = canvas.current!.toDataURL('image/png');
    a.download = `${props.filename ?? 'plot'}.png`;
    a.click();
  };
  const exportCsv = () => {
    const rows: string[] = ['series,x,y'];
    for (const s of series) for (let i = 0; i < s.x.length; i++) rows.push(`${JSON.stringify(s.label ?? '')},${s.x[i]},${s.y[i]}`);
    downloadText(`${props.filename ?? 'plot'}.csv`, rows.join('\n'), 'text/csv');
  };

  return (
    <div className="plot" ref={wrap}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={props.title ?? `${props.yLabel ?? 'y'} versus ${props.xLabel ?? 'x'}`}
        onWheel={onWheel}
        onPointerDown={(e) => {
          const r = canvas.current!.getBoundingClientRect();
          drag.current = { x: e.clientX - r.left, y: e.clientY - r.top, dom };
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerMove={onMove}
        onPointerLeave={() => setTip(null)}
        onDoubleClick={() => setView(null)}
        style={{ cursor: drag.current ? 'grabbing' : 'crosshair', touchAction: 'none' }}
      />
      {tip && (
        <div className="plot-tip" style={{ left: Math.min(tip.x, width - 220), top: tip.y }}>
          {tip.text}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', padding: '2px 4px 0' }}>
        {props.legend !== false && series.some((s) => s.label) ? (
          <div className="legend">
            {series
              .filter((s) => s.label)
              .slice(0, 16)
              .map((s, i) => (
                <span key={i}>
                  <i style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
          </div>
        ) : (
          <span />
        )}
        <span className="row" style={{ gap: 4 }}>
          <span className="faint small" title="Drag to pan, Shift/Ctrl + wheel to zoom, double-click to reset">⇲ drag · ⇧+wheel · dbl-click</span>
          <button className="btn ghost sm" onClick={exportPng} title="Export PNG">PNG</button>
          {series.length > 0 && (
            <button className="btn ghost sm" onClick={exportCsv} title="Export data as CSV">CSV</button>
          )}
        </span>
      </div>
    </div>
  );
}

export function ColorbarLegend({ name, lo, hi, label }: { name: ColormapName; lo: number; hi: number; label: string }) {
  return (
    <>
      <div className="colorbar" style={{ background: gradientCss(name) }} />
      <div className="colorbar-labels">
        <span>{tickLabel(hi)}</span>
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', alignSelf: 'flex-end' }}>{label}</span>
        <span>{tickLabel(lo)}</span>
      </div>
    </>
  );
}
