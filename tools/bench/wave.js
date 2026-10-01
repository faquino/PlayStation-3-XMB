#!/usr/bin/env node
'use strict';
// Headless bench for the wave: measures the spline layer's wave as spline.js draws it, over a run, and prints it
// beside the same measurements taken on the console's own wave - the meshes spline.elf wrote, as the RSX captures and
// the savestates hold them.
//
// Both are measured on the screen, in 16:9 normalised device coordinates, and in the XMB's camera space. The console's
// vertices arrive projected, so they give both; the spline layer draws with no camera, so its wave is given the depth
// the particles give it (WAVE_DEPTH_NEAR to WAVE_DEPTH_FAR in particles-reverse.js) to be measured in space. A savestate
// holds two frames of the wave, one after the other, which is where the console's speeds come from: a frame is taken
// as 1/60 s, the XMB's rate under RPCS3.
//
// The console's column is the resting XMB under the day cycle. A capture of a boot sequence or of the music's set is
// left out, since both move the wave; whichset.py names a capture's set from its backdrop, and a savestate has no
// draw to name it by, so LEFT_OUT lists the savestates known to be under another set.
//
// Usage: node tools/bench/wave.js [--seconds 120] [--every 2] [--console re-work/wave-frames]
//
// --console measures the console's column again from the frames tools/bench/wave-frames.py extracts, and prints it as
// the CONSOLE literal below, to paste in when captures or savestates are added.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'ps3xmbwave');
// The load order index.html uses; each file reads the globals the ones before it export.
const FILES = ['background-gradients-night.js', 'background-gradients-day.js', 'spline-settings.js',
  'particles-themes.js', 'particles-settings.js', 'spline-reverse.js', 'wave-surface-cpu.js',
  'particles-reverse.js'];

const ASPECT = 16 / 9;
const STEP_HZ = 60;
const WAVE_GRID = 100; // the mesh spline.js draws
const WARM_UP = 5; // seconds the spline layer runs before it is measured, for its temporal smoothing to settle
const VERTICES = 128 * 128;
const RECORD_FLOATS = 8; // position, then the unnormalised normal

const LEFT_OUT = {
  'vsh.self_1_8': 'taken with a track playing, under music_1 (docs/particles/parameter-sets.md)',
};

// The console's column, as --console last measured it.
const CONSOLE = {
  onScreen: '0.56 to 0.61',
  centre: '-0.191 to 0.166',
  height: '0.312 to 0.652',
  tilt: '-0.416 to 0.406',
  quarters: [
    '-0.30 to 0.24, 0.27 to 0.54',
    '-0.28 to 0.27, 0.20 to 0.43',
    '-0.16 to 0.23, 0.25 to 0.43',
    '-0.20 to 0.23, 0.22 to 0.39',
  ],
  reach: '-3.21 to -1.91 / 1.43 to 1.88',
  depth: '7.45 / 8.65 / 9.95',
  screenSpeed: '0.00064 / 0.00119',
  sideways: '0.39',
  spaceSpeed: '0.0032 / 0.0060',
  emitterSpeed: '0.365 / 0.678',
  sources: '10 captures and 8 savestates, 26 frames and 8 steps',
};

function loadModules() {
  globalThis.window = globalThis;
  for (const file of FILES) {
    // An indirect eval keeps the files at global scope; a vm context makes their global lookups ~30x slower.
    (0, eval)(fs.readFileSync(path.join(DIR, file), 'utf8'));
  }
}

function quantile(values, f) {
  const a = Float64Array.from(values).sort();
  return a.length ? a[Math.floor(f * (a.length - 1))] : NaN;
}

// A frame of either wave: per vertex, where it lands on screen and where it sits in camera space.
function emptyFrame(n) {
  return { n, x: new Float64Array(n), y: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n),
    vz: new Float64Array(n) };
}

// The console's: clip-space positions, so the screen is x / w and camera space undoes the projection.
function consoleFrame(floats, offset, cam) {
  const f = emptyFrame(VERTICES);
  for (let i = 0; i < VERTICES; i++) {
    const o = offset + i * RECORD_FLOATS;
    const w = floats[o + 3];
    f.x[i] = floats[o] / w;
    f.y[i] = floats[o + 1] / w;
    f.vx[i] = floats[o] / cam.p00;
    f.vy[i] = floats[o + 1] / cam.p11;
    f.vz[i] = -w;
  }
  return f;
}

// The spline layer's, at the grid spline.js draws: its clip space is the screen, and its depth coordinate picks a depth
// in the band the particles put the wave in, on the camera's ray through the point - waveToWorld in particles-reverse.js.
function splineFrame(settings, data, w, h, t, cam) {
  const RE = window.PS3ParticlesReverse;
  const f = emptyFrame(WAVE_GRID * WAVE_GRID);
  const out = new Float32Array(3);
  for (let j = 0; j < WAVE_GRID; j++) {
    for (let i = 0; i < WAVE_GRID; i++) {
      const k = j * WAVE_GRID + i;
      const gx = (i / (WAVE_GRID - 1)) * 2 - 1;
      const gz = (j / (WAVE_GRID - 1)) * 2 - 1;
      window.WaveSurfaceCPU.evaluate(settings, data, w, h, gx, gz, t, out);
      const d = RE.WAVE_DEPTH_NEAR + (out[2] + 1) * 0.5 * (RE.WAVE_DEPTH_FAR - RE.WAVE_DEPTH_NEAR);
      f.x[k] = out[0];
      f.y[k] = out[1];
      f.vx[k] = (out[0] * d) / cam.p00;
      f.vy[k] = (out[1] * d) / cam.p11;
      f.vz[k] = -d;
    }
  }
  return f;
}

function onScreen(f, i) {
  return Math.abs(f.x[i]) <= 1 && Math.abs(f.y[i]) <= 1;
}

// What one frame looks like on screen. Every figure but the reach is over the vertices on screen.
function shape(f) {
  const ys = [];
  const quarters = [[], [], [], []];
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < f.n; i++) {
    minX = Math.min(minX, f.x[i]);
    maxX = Math.max(maxX, f.x[i]);
    if (!onScreen(f, i)) continue;
    ys.push(f.y[i]);
    quarters[Math.min(3, Math.floor((f.x[i] + 1) * 2))].push(f.y[i]);
  }
  const band = (v) => (v.length ? quantile(v, 0.95) - quantile(v, 0.05) : NaN);
  return {
    onScreen: ys.length / f.n,
    centre: quantile(ys, 0.5),
    height: band(ys),
    // Right quarter's middle less the left quarter's: positive when the wave rises to the right.
    tilt: quantile(quarters[3], 0.5) - quantile(quarters[0], 0.5),
    quarterCentre: quarters.map((q) => quantile(q, 0.5)),
    quarterHeight: quarters.map(band),
    minX,
    maxX,
  };
}

// Pooled over frames: view depth on screen.
function depths(frames) {
  const d = [];
  for (const f of frames) {
    for (let i = 0; i < f.n; i++) if (onScreen(f, i)) d.push(-f.vz[i]);
  }
  return d;
}

// Pooled over steps, one frame to the next: how far each vertex moves on screen (those on screen in the first) and in
// space (all of them), and how much of its motion on screen is sideways.
function motion(steps) {
  const screen = [], sideways = [], space = [];
  for (const [a, b] of steps) {
    for (let i = 0; i < a.n; i++) {
      space.push(Math.hypot(b.vx[i] - a.vx[i], b.vy[i] - a.vy[i], b.vz[i] - a.vz[i]));
      if (!onScreen(a, i)) continue;
      const dx = b.x[i] - a.x[i], dy = b.y[i] - a.y[i];
      const d = Math.hypot(dx, dy);
      screen.push(d);
      if (d > 0) sideways.push(Math.abs(dx) / d);
    }
  }
  return { screen, sideways, space };
}

// Every figure the bench prints, as text, from a set of frames and of steps.
function measure(frames, steps, deltaTime) {
  const shapes = frames.map(shape);
  const range = (key, digits, index) => {
    const v = shapes.map((s) => (index === undefined ? s[key] : s[key][index])).filter((x) => !Number.isNaN(x));
    return v.length ? Math.min(...v).toFixed(digits) + ' to ' + Math.max(...v).toFixed(digits) : '-';
  };
  const pct = (v, fs, digits) => fs.map((f) => quantile(v, f).toFixed(digits)).join(' / ');
  const m = motion(steps);
  return {
    onScreen: range('onScreen', 2),
    centre: range('centre', 3),
    height: range('height', 3),
    tilt: range('tilt', 3),
    quarters: [0, 1, 2, 3].map((q) => range('quarterCentre', 2, q) + ', ' + range('quarterHeight', 2, q)),
    reach: range('minX', 2) + ' / ' + range('maxX', 2),
    depth: pct(depths(frames), [0.05, 0.5, 0.95], 2),
    screenSpeed: pct(m.screen, [0.5, 0.95], 5),
    sideways: pct(m.sideways, [0.5], 2),
    spaceSpeed: pct(m.space, [0.5, 0.95], 4),
    emitterSpeed: pct(m.space.map((v) => v / deltaTime), [0.5, 0.95], 3),
  };
}

function readConsole(dir, cam) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const frames = [], steps = [];
  const used = { capture: 0, savestate: 0 };
  for (const [name, entry] of Object.entries(index)) {
    if (LEFT_OUT[name]) continue;
    if (entry.kind === 'capture' && entry.set !== '(base)') continue;
    const raw = fs.readFileSync(path.join(dir, entry.file));
    const floats = new Float32Array(new Uint8Array(raw).buffer);
    const these = [];
    for (let k = 0; k < entry.frames; k++) these.push(consoleFrame(floats, k * VERTICES * RECORD_FLOATS, cam));
    frames.push(...these);
    // A savestate's two buffers are a frame apart. The task's local store says which is the newer (docs/wave/output.md),
    // but no figure here needs it.
    if (these.length === 2) steps.push(these);
    used[entry.kind]++;
  }
  return { frames, steps, used };
}

function simulate(seconds, every, cam) {
  const S = window.SPLINE_SETTINGS;
  const W = 256, H = 64;
  let data = new Float32Array(W * H);
  let prev = new Float32Array(W * H);
  const pipeline = window.PS3SplineReverse.createPipeline();
  const frames = [], steps = [];
  let t = 0;
  for (let frame = 1; frame <= (WARM_UP + seconds) * STEP_HZ; frame++) {
    [prev, data] = [data, prev];
    t = frame / STEP_HZ;
    pipeline.writeDisplacementTexture(S, t, data, W, H);
    const since = frame - WARM_UP * STEP_HZ;
    if (since < 0 || since % Math.round(every * STEP_HZ)) continue;
    const a = splineFrame(S, prev, W, H, t - 1 / STEP_HZ, cam);
    const b = splineFrame(S, data, W, H, t, cam);
    frames.push(b);
    steps.push([a, b]);
  }
  return { frames, steps };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf('--' + name);
    return i === -1 ? fallback : args[i + 1];
  };
  const seconds = Number(opt('seconds', 120));
  const every = Number(opt('every', 2));
  const consoleDir = opt('console', null);

  loadModules();
  const RE = window.PS3ParticlesReverse;
  const p11 = 1 / Math.tan(RE.CAMERA.fovy * 0.5);
  const cam = { p11, p00: p11 / ASPECT };
  const deltaTime = window.PARTICLE_SETTINGS.deltaTime;

  let reference = CONSOLE;
  if (consoleDir) {
    const c = readConsole(consoleDir, cam);
    reference = measure(c.frames, c.steps, deltaTime);
    reference.sources = c.used.capture + ' captures and ' + c.used.savestate + ' savestates, ' + c.frames.length
      + ' frames and ' + c.steps.length + ' steps';
    console.log('const CONSOLE = ' + JSON.stringify(reference, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, '\'')
      + ';\n');
  }

  const started = Date.now();
  const sim = simulate(seconds, every, cam);
  const s = measure(sim.frames, sim.steps, deltaTime);
  console.log('The spline layer over ' + seconds + ' s, a frame every ' + every + ' s (' + sim.frames.length
    + ' frames), against the console\'s ' + reference.sources + '; '
    + ((Date.now() - started) / 1000).toFixed(1) + ' s wall clock\n');

  const row = (label, a, b) => console.log('  ' + String(label).padEnd(44) + String(a).padEnd(32) + b);
  console.log('On screen, frame by frame (lowest to highest; NDC, y up)');
  row('', 'spline layer', 'console');
  row('Share of the mesh on screen', s.onScreen, reference.onScreen);
  row('Middle of the band (median y)', s.centre, reference.centre);
  row('Height of the band (5th to 95th of y)', s.height, reference.height);
  row('Rise, right quarter less left quarter', s.tilt, reference.tilt);
  const names = ['left', 'centre-left', 'centre-right', 'right'];
  for (let q = 0; q < 4; q++) row('Quarter ' + (q + 1) + ' (' + names[q] + '): middle, height', s.quarters[q], reference.quarters[q]);
  row('Reach of the mesh in x, left / right', s.reach, reference.reach);

  console.log('\nIn space, pooled (percentiles)');
  row('View depth on screen, 5th / 50th / 95th', s.depth, reference.depth);

  console.log('\nMotion, a frame to the next, pooled (percentiles)');
  row('On screen, NDC per frame, 50th / 95th', s.screenSpeed, reference.screenSpeed);
  row('Share of it sideways, median', s.sideways, reference.sideways);
  row('In space, per frame, 50th / 95th', s.spaceSpeed, reference.spaceSpeed);
  row('Same over delta time (emitter\'s units)', s.emitterSpeed, reference.emitterSpeed);
  console.log('  (the emitter reads the spline layer\'s wave ' + RE.WAVE_SPEED_GAIN + ' times faster: WAVE_SPEED_GAIN)');
}

main();
