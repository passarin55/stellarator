// Small, dependency-free dense linear algebra used by the physics kernels.
// Matrices are row-major Float64Array with explicit dimensions.

export type Vec3 = [number, number, number];

export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export class Matrix {
  readonly data: Float64Array;
  constructor(
    readonly rows: number,
    readonly cols: number,
    data?: Float64Array,
  ) {
    this.data = data ?? new Float64Array(rows * cols);
    if (this.data.length !== rows * cols) throw new Error('Matrix: data length mismatch');
  }
  static identity(n: number): Matrix {
    const m = new Matrix(n, n);
    for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
    return m;
  }
  get(i: number, j: number): number {
    return this.data[i * this.cols + j];
  }
  set(i: number, j: number, v: number): void {
    this.data[i * this.cols + j] = v;
  }
  clone(): Matrix {
    return new Matrix(this.rows, this.cols, this.data.slice());
  }
  mulVec(x: ArrayLike<number>, out = new Float64Array(this.rows)): Float64Array {
    const { rows, cols, data } = this;
    for (let i = 0; i < rows; i++) {
      let s = 0;
      const o = i * cols;
      for (let j = 0; j < cols; j++) s += data[o + j] * x[j];
      out[i] = s;
    }
    return out;
  }
  mul(b: Matrix): Matrix {
    if (this.cols !== b.rows) throw new Error('Matrix.mul: dimension mismatch');
    const c = new Matrix(this.rows, b.cols);
    for (let i = 0; i < this.rows; i++)
      for (let k = 0; k < this.cols; k++) {
        const a = this.data[i * this.cols + k];
        if (a === 0) continue;
        const bo = k * b.cols;
        const co = i * b.cols;
        for (let j = 0; j < b.cols; j++) c.data[co + j] += a * b.data[bo + j];
      }
    return c;
  }
  transpose(): Matrix {
    const t = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) for (let j = 0; j < this.cols; j++) t.data[j * this.rows + i] = this.data[i * this.cols + j];
    return t;
  }
}

/** LU decomposition with partial pivoting; solves A x = b. Throws on singular A. */
export function luSolve(A: Matrix, b: ArrayLike<number>): Float64Array {
  const n = A.rows;
  if (A.cols !== n) throw new Error('luSolve: matrix must be square');
  const a = A.data.slice();
  const x = Float64Array.from(b);
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k]);
      if (v > max) {
        max = v;
        p = i;
      }
    }
    if (max < 1e-300) throw new Error('luSolve: singular matrix');
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = a[k * n + j];
        a[k * n + j] = a[p * n + j];
        a[p * n + j] = t;
      }
      const t = x[k];
      x[k] = x[p];
      x[p] = t;
      const tp = piv[k];
      piv[k] = piv[p];
      piv[p] = tp;
    }
    const akk = a[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] /= akk);
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j];
    x[i] = s / a[i * n + i];
  }
  return x;
}

/** Cholesky solve for symmetric positive-definite systems (used by regularised least squares). */
export function choleskySolve(A: Matrix, b: ArrayLike<number>): Float64Array {
  const n = A.rows;
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A.data[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) throw new Error('choleskySolve: matrix not positive definite');
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** 2x2 eigenvalues of a symmetric matrix [[a,b],[b,d]]. */
export function symEig2(a: number, b: number, d: number): [number, number] {
  const tr = a + d;
  const disc = Math.sqrt(((a - d) * (a - d)) / 4 + b * b);
  return [tr / 2 - disc, tr / 2 + disc];
}
