import { Matrix, luSolve } from './linalg';

export interface NewtonOptions {
  tol?: number;
  maxIter?: number;
  /** Maximum number of step halvings in the backtracking line search. */
  maxLineSearch?: number;
}

export interface NewtonResult {
  x: Float64Array;
  residualNorm: number;
  iterations: number;
  converged: boolean;
}

const norm = (v: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
};

/**
 * Damped Newton–Raphson with backtracking line search, mirroring pyQSC's
 * newton() (which halves the step until the residual decreases).
 */
export function newton(
  residual: (x: Float64Array) => Float64Array,
  jacobian: (x: Float64Array) => Matrix,
  x0: ArrayLike<number>,
  opts: NewtonOptions = {},
): NewtonResult {
  const { tol = 1e-13, maxIter = 50, maxLineSearch = 12 } = opts;
  let x = Float64Array.from(x0);
  let r = residual(x);
  let rn = norm(r);
  let it = 0;
  for (; it < maxIter && rn > tol; it++) {
    const J = jacobian(x);
    const step = luSolve(J, r);
    let accepted = false;
    let alpha = 1;
    for (let ls = 0; ls <= maxLineSearch; ls++) {
      const xt = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) xt[i] = x[i] - alpha * step[i];
      const rt = residual(xt);
      const rtn = norm(rt);
      if (rtn < rn) {
        x = xt;
        r = rt;
        rn = rtn;
        accepted = true;
        break;
      }
      alpha *= 0.5;
    }
    if (!accepted) break;
  }
  return { x, residualNorm: rn, iterations: it, converged: rn <= Math.max(tol, 1e-9) };
}

/** Scalar Newton with finite-difference derivative fallback and bisection safeguard. */
export function solveScalar(f: (x: number) => number, x0: number, tol = 1e-12, maxIter = 60): number {
  let x = x0;
  for (let i = 0; i < maxIter; i++) {
    const fx = f(x);
    if (Math.abs(fx) < tol) return x;
    const h = 1e-7 * Math.max(1, Math.abs(x));
    const d = (f(x + h) - f(x - h)) / (2 * h);
    if (d === 0 || !Number.isFinite(d)) break;
    let step = fx / d;
    // limit wild steps
    const lim = 0.5;
    if (Math.abs(step) > lim) step = Math.sign(step) * lim;
    x -= step;
  }
  return x;
}

/** Brent-free bracketed root via bisection + secant (Illinois). */
export function bracketRoot(f: (x: number) => number, a: number, b: number, tol = 1e-12, maxIter = 200): number {
  let fa = f(a);
  let fb = f(b);
  if (fa * fb > 0) throw new Error('bracketRoot: root not bracketed');
  let side = 0;
  let c = a;
  for (let i = 0; i < maxIter; i++) {
    c = (fa * b - fb * a) / (fa - fb);
    const fc = f(c);
    if (Math.abs(fc) < tol || Math.abs(b - a) < tol) return c;
    if (fc * fb > 0) {
      b = c;
      fb = fc;
      if (side === -1) fa /= 2;
      side = -1;
    } else {
      a = c;
      fa = fc;
      if (side === 1) fb /= 2;
      side = 1;
    }
  }
  return c;
}

/** Simpson / trapezoid helpers on uniform periodic grids. */
export const periodicMean = (v: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s / v.length;
};

export function linspace(a: number, b: number, n: number, endpoint = true): Float64Array {
  const out = new Float64Array(n);
  const d = endpoint ? (b - a) / Math.max(1, n - 1) : (b - a) / n;
  for (let i = 0; i < n; i++) out[i] = a + i * d;
  return out;
}
