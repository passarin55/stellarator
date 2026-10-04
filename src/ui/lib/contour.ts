/**
 * Marching squares: iso-lines of a scalar field sampled on a regular grid.
 * Returns line segments in data coordinates (x0,y0,x1,y1 interleaved).
 * Saddle cells are disambiguated with the cell-centre average.
 */
export function marchingSquares(
  grid: ArrayLike<number>,
  nx: number,
  ny: number,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  level: number,
): Float64Array {
  const out: number[] = [];
  const v = (i: number, j: number) => grid[j * nx + i];
  const lerp = (a: number, b: number, fa: number, fb: number) => a + ((level - fa) / (fb - fa)) * (b - a);
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const f0 = v(i, j);
      const f1 = v(i + 1, j);
      const f2 = v(i + 1, j + 1);
      const f3 = v(i, j + 1);
      if (![f0, f1, f2, f3].every(Number.isFinite)) continue;
      let c = 0;
      if (f0 > level) c |= 1;
      if (f1 > level) c |= 2;
      if (f2 > level) c |= 4;
      if (f3 > level) c |= 8;
      if (c === 0 || c === 15) continue;
      const x0 = xs[i],
        x1 = xs[i + 1],
        y0 = ys[j],
        y1 = ys[j + 1];
      // edge points: bottom (0-1), right (1-2), top (3-2), left (0-3)
      const B = () => [lerp(x0, x1, f0, f1), y0];
      const Rr = () => [x1, lerp(y0, y1, f1, f2)];
      const T = () => [lerp(x0, x1, f3, f2), y1];
      const L = () => [x0, lerp(y0, y1, f0, f3)];
      const seg = (a: number[], b: number[]) => out.push(a[0], a[1], b[0], b[1]);
      switch (c) {
        case 1:
        case 14:
          seg(L(), B());
          break;
        case 2:
        case 13:
          seg(B(), Rr());
          break;
        case 3:
        case 12:
          seg(L(), Rr());
          break;
        case 4:
        case 11:
          seg(T(), Rr());
          break;
        case 6:
        case 9:
          seg(B(), T());
          break;
        case 7:
        case 8:
          seg(L(), T());
          break;
        case 5:
        case 10: {
          const center = (f0 + f1 + f2 + f3) / 4 > level;
          if ((c === 5) === center) {
            seg(L(), T());
            seg(B(), Rr());
          } else {
            seg(L(), B());
            seg(T(), Rr());
          }
          break;
        }
      }
    }
  return Float64Array.from(out);
}
