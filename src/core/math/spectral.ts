import { Matrix } from './linalg';

/**
 * Spectral (Fourier) differentiation matrix on n equispaced periodic points in
 * [xmin, xmax). Port of the DMSuite construction (Weideman & Reddy) as used by
 * pyQSC's spectral_diff_matrix.
 */
export function spectralDiffMatrix(n: number, xmin = 0, xmax = 2 * Math.PI): Matrix {
  const h = (2 * Math.PI) / n;
  const n1 = Math.floor((n - 1) / 2);
  const n2 = Math.ceil((n - 1) / 2);
  const topc: number[] = [];
  for (let k = 1; k <= n2; k++) topc.push(n % 2 === 0 ? 1 / Math.tan((k * h) / 2) : 1 / Math.sin((k * h) / 2));
  const temp: number[] = [...topc];
  const flipped = topc.slice(0, n1).reverse();
  for (const v of flipped) temp.push(n % 2 === 0 ? -v : v);
  const col1 = new Float64Array(n);
  for (let k = 1; k < n; k++) col1[k] = 0.5 * (k % 2 === 0 ? 1 : -1) * temp[k - 1];
  const scale = (2 * Math.PI) / (xmax - xmin);
  const D = new Matrix(n, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      // Toeplitz(col1, row1 = -col1): entry depends on i - j
      const v = i >= j ? col1[i - j] : -col1[j - i];
      D.data[i * n + j] = scale * v;
    }
  return D;
}

/** Evaluate a periodic function sampled on n points at arbitrary x by trigonometric interpolation. */
export function fourierInterpolate(samples: ArrayLike<number>, period: number, x: number): number {
  const n = samples.length;
  const { a, b } = realDft(samples);
  const w = (2 * Math.PI) / period;
  let s = a[0];
  const kmax = Math.floor(n / 2);
  for (let k = 1; k <= kmax; k++) {
    const f = n % 2 === 0 && k === kmax ? 0.5 : 1;
    s += f * (a[k] * Math.cos(k * w * x) + b[k] * Math.sin(k * w * x));
  }
  return s;
}

/** Real DFT: samples ≈ a0 + Σ a_k cos(kx) + b_k sin(kx) on x_j = 2πj/n. */
export function realDft(samples: ArrayLike<number>): { a: Float64Array; b: Float64Array } {
  const n = samples.length;
  const kmax = Math.floor(n / 2);
  const a = new Float64Array(kmax + 1);
  const b = new Float64Array(kmax + 1);
  for (let k = 0; k <= kmax; k++) {
    let sa = 0;
    let sb = 0;
    for (let j = 0; j < n; j++) {
      const x = (2 * Math.PI * k * j) / n;
      sa += samples[j] * Math.cos(x);
      sb += samples[j] * Math.sin(x);
    }
    const f = k === 0 || (n % 2 === 0 && k === kmax) ? 1 / n : 2 / n;
    a[k] = sa * f;
    b[k] = sb * f;
  }
  return { a, b };
}

/**
 * Minimum of a smooth periodic function given by samples, refined with
 * trigonometric interpolation + golden-section search (cf. pyQSC fourier_minimum).
 */
export function fourierMinimum(samples: ArrayLike<number>): number {
  const n = samples.length;
  let jmin = 0;
  for (let j = 1; j < n; j++) if (samples[j] < samples[jmin]) jmin = j;
  const period = 2 * Math.PI;
  const dx = period / n;
  let lo = (jmin - 1) * dx;
  let hi = (jmin + 1) * dx;
  const f = (x: number) => fourierInterpolate(samples, period, x);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = hi - g * (hi - lo);
  let d = lo + g * (hi - lo);
  let fc = f(c);
  let fd = f(d);
  for (let it = 0; it < 60; it++) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - g * (hi - lo);
      fc = f(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + g * (hi - lo);
      fd = f(d);
    }
  }
  return Math.min(f((lo + hi) / 2), samples[jmin]);
}
