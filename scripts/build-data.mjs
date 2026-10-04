#!/usr/bin/env node
// Converts the raw reference files in data/raw (VMEC &INDATA namelists and
// simsopt CurveXYZFourier coil files) into compact JSON consumed by the app.
//
//   node scripts/build-data.mjs
//
// The parsers live in src/core/io so that the very same code that runs in the
// browser (for user uploads) is used to build the bundled library. Running
// this script is only needed when data/raw changes; the output is committed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => readFileSync(join(root, 'data/raw', f), 'utf8');

// Lightweight copies of the TS parsers (kept in sync by tests/io.test.ts, which
// asserts that the generated JSON equals what the TS parser produces).
function parseVmecInput(text) {
  const clean = text
    .split('\n')
    .map((l) => l.replace(/!.*$/, ''))
    .join('\n');
  const num = (s) => Number(s.replace(/[dD]/, 'e'));
  const scalar = (name) => {
    const m = clean.match(new RegExp(`\\b${name}\\s*=\\s*([-+0-9.eEdD]+)`, 'i'));
    return m ? num(m[1]) : undefined;
  };
  const logical = (name) => {
    const m = clean.match(new RegExp(`\\b${name}\\s*=\\s*([.]?[TtFf][A-Za-z]*[.]?)`, 'i'));
    return m ? /^[.]?t/i.test(m[1]) : false;
  };
  const modes = [];
  const re = /\b(RBC|ZBS|RBS|ZBC)\s*\(\s*([-+]?\d+)\s*,\s*([-+]?\d+)\s*\)\s*=\s*([-+0-9.eEdD]+)/gi;
  const map = new Map();
  let m;
  while ((m = re.exec(clean))) {
    const kind = m[1].toLowerCase();
    const n = Number(m[2]);
    const mm = Number(m[3]);
    const key = `${mm},${n}`;
    if (!map.has(key)) map.set(key, { m: mm, n, rbc: 0, zbs: 0, rbs: 0, zbc: 0 });
    map.get(key)[kind] = num(m[4]);
  }
  for (const v of map.values()) modes.push(v);
  modes.sort((a, b) => a.m - b.m || a.n - b.n);
  return {
    nfp: scalar('NFP') ?? 1,
    phiedge: scalar('PHIEDGE') ?? 0,
    lasym: logical('LASYM'),
    modes: modes.filter((x) => x.rbc || x.zbs || x.rbs || x.zbc),
  };
}

function parseSimsoptCoils(text) {
  const rows = text
    .trim()
    .split('\n')
    .map((l) => l.split(',').map(Number));
  const ncoils = rows[0].length / 6;
  const coils = [];
  for (let c = 0; c < ncoils; c++) {
    const col = (k) => rows.map((r) => r[6 * c + k]);
    coils.push({ xs: col(0), xc: col(1), ys: col(2), yc: col(3), zs: col(4), zc: col(5) });
  }
  return coils;
}

const round = (x) => (Math.abs(x) < 1e-14 ? 0 : Number(x.toPrecision(12)));
const roundDeep = (o) =>
  Array.isArray(o) ? o.map(roundDeep) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, roundDeep(v)]))
    : typeof o === 'number' ? round(o) : o;

const boundaries = {
  'w7x-standard': 'input.W7-X_standard_configuration',
  'ncsx-li383': 'input.li383_low_res',
  'landreman-paul-qa': 'input.LandremanPaul2021_QA',
  'landreman-paul-qh-reactor': 'input.LandremanPaul2021_QH_reactorScale_lowres',
  'nuhrenberg-zille-qhs': 'input.NuhrenbergZille_1988_QHS',
  'lsp-section-5p3': 'input.LandremanSenguptaPlunk_section5p3',
  'rotating-ellipse': 'input.rotating_ellipse',
  'circular-tokamak': 'input.circular_tokamak',
};

const out = {};
for (const [id, file] of Object.entries(boundaries)) {
  out[id] = { source: file, ...roundDeep(parseVmecInput(raw(file))) };
}

// Coil sets. Currents, turns and magnetic-axis guesses are transcribed from
// simsopt/src/simsopt/configs/zoo.py (MIT licence). Axis series use
// R = sum rc[n] cos(n nfp phi), Z = sum zs[n] sin(n nfp phi), with zs[0] = 0
// (simsopt stores zs starting at n = 1, hence the leading zero here).
const coilsets = {
  w7x: {
    file: 'W7-X.dat',
    nfp: 5,
    stellsym: true,
    // 5 non-planar coils at 108 turns x 15 kA, planar coils A/B off ("standard configuration")
    currents: [1.62e6, 1.62e6, 1.62e6, 1.62e6, 1.62e6, 0, 0],
    labels: ['NPC 1', 'NPC 2', 'NPC 3', 'NPC 4', 'NPC 5', 'PC A', 'PC B'],
    axis: {
      rc: [5.56069066955626, 0.370739830964738, 0.0161526928867275, 0.0011820724983052, 3.43773868380292e-6, -4.71423775536881e-5],
      zs: [0, 0, -0.308156954586225, -0.0186374002410851, -0.000261743895528833, 5.78207516751575e-5, -0.000129121205314107],
    },
  },
  ncsx: {
    file: 'NCSX.dat',
    nfp: 3,
    stellsym: true,
    currents: [6.52271941985300e5, 6.51868569367400e5, 5.37743588647300e5],
    labels: ['M1', 'M2', 'M3'],
    axis: {
      rc: [1.471415400740515, 0.1205306261840785, 0.008016125223436036, -0.000508473952304439, -0.0003025251710853062],
      zs: [0, 0.06191774986623827, 0.003997436991295509, -0.0001973128955021696, -0.0001892615088404824, -2.754694372995494e-5],
    },
  },
  hsx: {
    file: 'HSX.dat',
    nfp: 4,
    stellsym: true,
    currents: Array(6).fill(-1.5007255e5),
    labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'],
    axis: {
      rc: [1.221168734647426701, 0.2069298947130969735, 0.01819037041932574511, 4.787659822787012774e-5],
      zs: [0, 0.1670393448410154857, 0.01638250511845155272, 0.000165642467397717749, -0.0001506417857585283353],
    },
  },
};

const coilOut = {};
for (const [id, cfg] of Object.entries(coilsets)) {
  const { file, ...rest } = cfg;
  coilOut[id] = { source: file, ...rest, curves: roundDeep(parseSimsoptCoils(raw(file))) };
}

const dir = join(root, 'src/data/generated');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'boundaries.json'), JSON.stringify(out));
writeFileSync(join(dir, 'coilsets.json'), JSON.stringify(coilOut));
console.log(`wrote ${Object.keys(out).length} boundaries and ${Object.keys(coilOut).length} coil sets to ${dir}`);
