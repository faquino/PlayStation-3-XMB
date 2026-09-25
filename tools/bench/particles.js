#!/usr/bin/env node
'use strict';
// Headless bench for the particle system: runs the simulation over the spline layer's own wave and prints what its
// pool and its drawn particles look like, beside the same measurements read off the console.
//
// The console's column is not a target to hit exactly - the pool is one moment of one savestate and the captures are
// two frames - but a change to the modelled emitter should move the simulation towards it and must not move the
// drawn metrics away. PARTICLES_REVERSE_ENGINEER.md records where each reference number comes from.
//
// Usage: node tools/bench/particles.js [--seconds 30] [--runs 3] [--seed 1] [--terms]
//
// --terms runs the pool again with each force switched off, which is how the noise turned out to be what keeps the
// particles fast late in life. The flow has nothing to switch off here: the bench gives no input, so the flow grid
// stays empty, as the console's does at rest.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'ps3xmbwave');
// The load order index.html uses; each file reads the globals the ones before it export.
const FILES = ['background-gradients-night.js', 'background-gradients-day.js', 'spline-settings.js',
  'particles-themes.js', 'particles-settings.js', 'spline-reverse.js', 'wave-surface-cpu.js',
  'particles-reverse.js'];

const ASPECT = 16 / 9;
const STEP_HZ = 60;
// The task's three noise generators, reseeded every frame, so the k-th live particle always draws the k-th vector.
const NOISE_SEEDS = [0x98756161 | 0, 0x21324889 | 0, 0x82181158 | 0];
const WAVE_GRID = 100; // the mesh spline.js draws
const BINS = 50;

// Read off the console. The pool is the resting savestate's, 2049 slots; the two captures are the RSX frames.
const CONSOLE = {
  alive: '2033 of 2049',
  aging: '0.001447 / 0.002435 / 0.004256',
  young: { depth: '7.57 / 8.55 / 9.07', vz: '-0.0112 / +0.0001 / +0.0078', vxy: '0.156 / 0.276 / 0.348' },
  old: { depth: '7.41 / 8.40 / 9.32', vz: '-0.2501 / -0.0014 / +0.2337', vxy: '0.081 / 0.262 / 0.517' },
  noiseCorr: '+0.128 / +0.111 / +0.193 (ctl +0.043)',
  onScreen: '1437, 1417',
  opaque: '92%, 92%',
  depth: '8.92, 8.49',
  outside: '0.096, 0.114',
  outside99: '0.38, 0.39',
};

function loadModules() {
  globalThis.window = globalThis;
  for (const file of FILES) {
    // An indirect eval keeps the files at global scope; a vm context makes their global lookups ~30x slower.
    (0, eval)(fs.readFileSync(path.join(DIR, file), 'utf8'));
  }
}

// The k-th draw of one of the task's generators, for k = 0 .. n-1.
function noiseSeries(seed, n) {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  const out = new Float64Array(n);
  let s = seed | 0;
  for (let i = 0; i < n; i++) {
    s = Math.imul(s, 16807);
    u32[0] = 0x40000000 | (s >>> 9);
    out[i] = f32[0] - 3;
  }
  return out;
}

function correlation(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sa = 0, sb = 0, sab = 0;
  for (let i = 0; i < n; i++) {
    sa += (a[i] - ma) * (a[i] - ma);
    sb += (b[i] - mb) * (b[i] - mb);
    sab += (a[i] - ma) * (b[i] - mb);
  }
  return sab / Math.sqrt(sa * sb);
}

function quantile(values, f) {
  const a = values.slice().sort((x, y) => x - y);
  return a.length ? a[Math.floor(f * (a.length - 1))] : NaN;
}

function three(values, digits) {
  if (!values.length) return '-';
  return [0.05, 0.5, 0.95].map((f) => quantile(values, f).toFixed(digits)).join(' / ');
}

function simulate(seconds, seed) {
  const S = window.SPLINE_SETTINGS;
  const PS = window.PARTICLE_SETTINGS;
  const W = 256, H = 64;
  const data = new Float32Array(W * H);
  const pipeline = window.PS3SplineReverse.createPipeline();
  const surface = { settings: S, data, width: W, height: H };
  const sys = window.PS3ParticlesReverse.createSystem({ capacity: 2049, seed });
  let t = 0;
  for (let frame = 0; frame < seconds * STEP_HZ; frame++) {
    t += 1 / STEP_HZ;
    pipeline.writeDisplacementTexture(S, t, data, W, H);
    sys.update(PS, surface, null, t, 1 / STEP_HZ, ASPECT);
  }
  return { sys, settings: S, data, W, H, t };
}

// The pool in the task's own record layout, split by how much life each particle has spent.
function poolMetrics(sys) {
  const { pool, stride, free, capacity } = sys;
  const bands = { young: [], old: [] };
  const aging = [];
  let alive = 0;
  for (let i = 0; i < capacity; i++) {
    const o = i * stride;
    if (pool[o + 3] === free) continue;
    alive++;
    const life = pool[o + 3];
    const record = {
      depth: window.PS3ParticlesReverse.CAMERA.eye[2] - pool[o + 2],
      vz: pool[o + 6],
      vxy: Math.hypot(pool[o + 4], pool[o + 5]),
    };
    aging.push(pool[o + 7]);
    if (life < 0.03) bands.young.push(record);
    else if (life >= 0.5) bands.old.push(record);
  }
  const of = (rows, key, digits) => three(rows.map((r) => r[key]), digits);

  // How long does a particle keep its drift? Rank the live ones in slot order, hand each the vector its rank would
  // draw this frame, and see whether the velocities remember it. A control that shifts the series by one step's
  // worth of births says how much of the answer is chance.
  const vel = [[], [], []];
  for (let i = 0; i < capacity; i++) {
    const o = i * stride;
    if (pool[o + 3] === free) continue;
    for (let a = 0; a < 3; a++) vel[a].push(pool[o + 4 + a]);
  }
  const noiseCorr = NOISE_SEEDS.map((seed, a) => correlation(noiseSeries(seed, alive), vel[a]));
  const control = correlation(noiseSeries(NOISE_SEEDS[0], alive + 7).slice(7), vel[0]);

  return {
    alive,
    noiseCorr,
    control,
    aging: [Math.min(...aging), quantile(aging, 0.5), Math.max(...aging)],
    young: { n: bands.young.length, depth: of(bands.young, 'depth', 2), vz: of(bands.young, 'vz', 4), vxy: of(bands.young, 'vxy', 3) },
    old: { n: bands.old.length, depth: of(bands.old, 'depth', 2), vz: of(bands.old, 'vz', 4), vxy: of(bands.old, 'vxy', 3) },
  };
}

// The drawn particles, projected the way the renderer does, against the band the wave occupies on screen.
function drawnMetrics(run) {
  const RE = window.PS3ParticlesReverse;
  const p11 = 1 / Math.tan(RE.CAMERA.fovy * 0.5);
  const p00 = p11 / ASPECT;
  const eye = RE.CAMERA.eye[2];

  // The wave's own band, binned across the screen, from the same surface the emitter samples.
  const out = new Float32Array(3);
  const lo = new Array(BINS).fill(Infinity);
  const hi = new Array(BINS).fill(-Infinity);
  const waveDepth = [];
  for (let j = 0; j < WAVE_GRID; j++) {
    for (let i = 0; i < WAVE_GRID; i++) {
      const gx = (i / (WAVE_GRID - 1)) * 2 - 1;
      const gz = (j / (WAVE_GRID - 1)) * 2 - 1;
      window.WaveSurfaceCPU.evaluate(run.settings, run.data, run.W, run.H, gx, gz, run.t, out);
      if (Math.abs(out[0]) > 1 || Math.abs(out[2]) > 1) continue;
      waveDepth.push(RE.WAVE_DEPTH_NEAR + (out[2] + 1) * 0.5 * (RE.WAVE_DEPTH_FAR - RE.WAVE_DEPTH_NEAR));
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor((out[0] + 1) * (BINS / 2))));
      lo[bin] = Math.min(lo[bin], out[1]);
      hi[bin] = Math.max(hi[bin], out[1]);
    }
  }

  const o = run.sys.output;
  const stride = RE.OUT_STRIDE;
  const depth = [];
  const dist = [];
  let onScreen = 0;
  let opaque = 0;
  for (let i = 0; i < run.sys.count; i++) {
    const d = eye - o[i * stride + 2];
    const x = (p00 * o[i * stride]) / d;
    const y = (p11 * o[i * stride + 1]) / d;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) continue;
    onScreen++;
    depth.push(d);
    if (o[i * stride + 3] >= 0.999) opaque++;
    const bin = Math.min(BINS - 1, Math.max(0, Math.floor((x + 1) * (BINS / 2))));
    if (lo[bin] <= hi[bin]) {
      dist.push(y >= lo[bin] && y <= hi[bin] ? 0 : Math.min(Math.abs(y - lo[bin]), Math.abs(y - hi[bin])));
    }
  }
  return {
    onScreen,
    opaque: (100 * opaque) / Math.max(1, onScreen),
    depth: quantile(depth, 0.5),
    outside: quantile(dist, 0.9),
    outside99: quantile(dist, 0.99),
    waveBand: quantile(waveDepth, 0.95) - quantile(waveDepth, 0.05),
  };
}

function collect(values, digits) {
  if (values.length === 1) return values[0].toFixed(digits);
  const min = Math.min(...values), max = Math.max(...values);
  return min.toFixed(digits) + ' to ' + max.toFixed(digits);
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf('--' + name);
    return i === -1 ? fallback : Number(args[i + 1]);
  };
  const seconds = opt('seconds', 30);
  const runs = opt('runs', 3);
  const seed = opt('seed', NaN);

  loadModules();
  const started = Date.now();
  const pools = [];
  const drawn = [];
  let last = null;
  for (let r = 0; r < runs; r++) {
    const run = simulate(seconds, Number.isNaN(seed) ? undefined : seed + r);
    pools.push(poolMetrics(run.sys));
    drawn.push(drawnMetrics(run));
    last = pools[pools.length - 1];
  }
  const RE = window.PS3ParticlesReverse;
  console.log(runs + ' run(s) of ' + seconds + 's, emission band ' + RE.WAVE_DEPTH_NEAR + ' to '
    + RE.WAVE_DEPTH_FAR + ' deep, ' + ((Date.now() - started) / 1000).toFixed(1) + ' s wall clock\n');

  const row = (label, sim, ref) => console.log('  ' + String(label).padEnd(44) + String(sim).padEnd(34) + ref);
  console.log('The pool (percentiles are 5th / 50th / 95th)');
  row('', 'simulation', 'console');
  row('Alive', collect(pools.map((p) => p.alive), 0) + ' of 2049', CONSOLE.alive);
  row('Aging rate, min / median / max', pools[0].aging.map((v) => v.toFixed(6)).join(' / '), CONSOLE.aging);
  console.log('  -- just born, life under 0.03 (' + collect(pools.map((p) => p.young.n), 0) + ' particles)');
  row('View depth', last.young.depth, CONSOLE.young.depth);
  row('Velocity z', last.young.vz, CONSOLE.young.vz);
  row('Velocity in xy', last.young.vxy, CONSOLE.young.vxy);
  console.log('  -- late in life, over 0.5 (' + collect(pools.map((p) => p.old.n), 0) + ' particles)');
  row('View depth', last.old.depth, CONSOLE.old.depth);
  row('Velocity z', last.old.vz, CONSOLE.old.vz);
  row('Velocity in xy', last.old.vxy, CONSOLE.old.vxy);
  row('Velocity against its own noise draw',
    last.noiseCorr.map((v) => (v >= 0 ? '+' : '') + v.toFixed(3)).join(' / ')
    + ' (ctl ' + (last.control >= 0 ? '+' : '') + last.control.toFixed(3) + ')', CONSOLE.noiseCorr);

  if (args.includes('--terms')) {
    console.log('\nLate in life, with one modelled force switched off');
    row('', 'speed in xy', 'velocity z');
    const saved = Object.assign({}, window.PARTICLE_SETTINGS);
    for (const [label, tweak] of [['everything on', {}], ['flow off', { flowStrength: 0 }],
      ['noise off', { brownianScale: 0 }], ['both off', { flowStrength: 0, brownianScale: 0 }]]) {
      Object.assign(window.PARTICLE_SETTINGS, saved, tweak);
      const m = poolMetrics(simulate(seconds, Number.isNaN(seed) ? undefined : seed).sys);
      row(label, m.old.vxy, m.old.vz);
    }
    Object.assign(window.PARTICLE_SETTINGS, saved);
    row('the console', CONSOLE.old.vxy, CONSOLE.old.vz);
  }

  console.log('\nWhat is drawn');
  row('', 'simulation', 'captures');
  row('On screen', collect(drawn.map((d) => d.onScreen), 0), CONSOLE.onScreen);
  row('Opacity exactly 1', collect(drawn.map((d) => d.opaque), 1) + '%', CONSOLE.opaque);
  row('View depth, median', collect(drawn.map((d) => d.depth), 2), CONSOLE.depth);
  row('Outside the wave band, 90th percentile (NDC)', collect(drawn.map((d) => d.outside), 3), CONSOLE.outside);
  row('Same, 99th percentile', collect(drawn.map((d) => d.outside99), 3), CONSOLE.outside99);
  row('The wave\'s own depth spread, 5th to 95th', collect(drawn.map((d) => d.waveBand), 2), '1.50 at birth');
}

main();
