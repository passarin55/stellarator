/** Helpers that turn core geometry into renderable buffers. */
import { sampleSurfaceGrid, surfaceCurvatures, type FourierSurface } from '@core/geometry/surface';
import type { SurfaceLayer } from '../components/Viewer3D';
import type { ColormapName } from './colormap';

export type SurfaceColoring = 'none' | 'Z' | 'gaussian' | 'mean' | 'phi' | 'R';

export function surfaceLayer(
  s: FourierSurface,
  opts: { ntheta?: number; nphi?: number; coloring?: SurfaceColoring; fraction?: number; colormap?: ColormapName; opacity?: number; color?: string } = {},
): { layer: SurfaceLayer; range: [number, number] | null } {
  const frac = opts.fraction ?? 1;
  const nphi = Math.max(8, Math.round((opts.nphi ?? 160) * frac));
  const ntheta = opts.ntheta ?? 48;
  const g = sampleSurfaceGrid(s, ntheta, nphi, 0, 2 * Math.PI * frac);
  const coloring = opts.coloring ?? 'none';
  let scalars: Float32Array | undefined;
  let range: [number, number] | null = null;
  if (coloring !== 'none') {
    scalars = new Float32Array(g.theta.length);
    for (let k = 0; k < g.theta.length; k++) {
      const th = g.theta[k];
      const ph = g.phi[k];
      switch (coloring) {
        case 'Z':
          scalars[k] = g.positions[3 * k + 2];
          break;
        case 'R':
          scalars[k] = Math.hypot(g.positions[3 * k], g.positions[3 * k + 1]);
          break;
        case 'phi':
          scalars[k] = ((ph * s.nfp) / (2 * Math.PI)) % 1;
          break;
        case 'gaussian':
          scalars[k] = surfaceCurvatures(s, th, ph).gaussian;
          break;
        case 'mean':
          scalars[k] = surfaceCurvatures(s, th, ph).mean;
          break;
      }
    }
    // robust range (2–98 percentile) so curvature spikes don't wash out the map
    const sorted = Float32Array.from(scalars).sort();
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.floor(sorted.length * 0.98)];
    range = coloring === 'gaussian' || coloring === 'mean' ? symmetric(lo, hi) : [lo, hi];
  }
  return {
    layer: {
      positions: g.positions,
      ntheta,
      nphi,
      scalars,
      range: range ?? undefined,
      colormap: opts.colormap ?? (coloring === 'gaussian' || coloring === 'mean' ? 'coolwarm' : 'viridis'),
      color: opts.color,
      opacity: opts.opacity,
    },
    range,
  };
}

const symmetric = (lo: number, hi: number): [number, number] => {
  const m = Math.max(Math.abs(lo), Math.abs(hi));
  return [-m, m];
};
