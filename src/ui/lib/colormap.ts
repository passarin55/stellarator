/**
 * Perceptual colour maps. Anchors are sampled from matplotlib's viridis,
 * plasma and RdBu_r (BSD-licensed) at 9 evenly spaced points and linearly
 * interpolated in sRGB — visually indistinguishable from the 256-entry LUTs
 * at the sizes used here.
 */
export type ColormapName = 'viridis' | 'plasma' | 'coolwarm' | 'turbo' | 'magma';

const ANCHORS: Record<ColormapName, [number, number, number][]> = {
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
    [31, 158, 137], [53, 183, 121], [110, 206, 88], [181, 222, 43], [253, 231, 37],
  ],
  plasma: [
    [13, 8, 135], [65, 4, 157], [106, 0, 168], [143, 13, 164], [177, 42, 144],
    [204, 71, 120], [225, 100, 98], [242, 132, 75], [252, 166, 54], [240, 249, 33],
  ],
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
    [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ],
  coolwarm: [
    [5, 48, 97], [33, 102, 172], [67, 147, 195], [146, 197, 222], [247, 247, 247],
    [244, 165, 130], [214, 96, 77], [178, 24, 43], [103, 0, 31],
  ],
  turbo: [
    [48, 18, 59], [70, 107, 227], [40, 187, 236], [50, 241, 151], [164, 252, 60],
    [237, 208, 58], [251, 128, 34], [208, 47, 5], [122, 4, 3],
  ],
};

export function colormap(name: ColormapName, t: number): [number, number, number] {
  const a = ANCHORS[name];
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (a.length - 1);
  const i = Math.min(a.length - 2, Math.floor(x));
  const f = x - i;
  return [
    (a[i][0] + f * (a[i + 1][0] - a[i][0])) / 255,
    (a[i][1] + f * (a[i + 1][1] - a[i][1])) / 255,
    (a[i][2] + f * (a[i + 1][2] - a[i][2])) / 255,
  ];
}

export const cssColor = (name: ColormapName, t: number) => {
  const [r, g, b] = colormap(name, t);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
};

export const gradientCss = (name: ColormapName, dir = 'to top') =>
  `linear-gradient(${dir}, ${Array.from({ length: 11 }, (_, i) => `${cssColor(name, i / 10)} ${i * 10}%`).join(', ')})`;

/** Categorical palette (Okabe–Ito inspired, adjusted for dark & light backgrounds). */
export const CATEGORICAL = ['#0ea5e9', '#f97316', '#10b981', '#e11d48', '#a855f7', '#eab308', '#14b8a6', '#6366f1', '#ec4899', '#84cc16'];
