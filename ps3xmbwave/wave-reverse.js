'use strict';
// The console's wave, built each frame the way the XMB builds it, into a 128 x 128 mesh in clip space. Exports
// `window.PS3WaveReverse`; `spline.js` runs it and draws the mesh, which `particles.js` emits from.

(function () {
  // -----------------------------------------------------------------------------------------------------------------
  // Verified: custom_render_plugin's lines, ffd_shader1's lattice, and spline.elf's deformation, matrix and surface.
  // WAVE_REVERSE_ENGINEER.md indexes how each was read and checked.
  // -----------------------------------------------------------------------------------------------------------------
  const N = 19; // points on a line, and lines (the lines object's +0x2c and +0x30)
  const COUNT = N * N;
  const STEP_HZ = 60; // the accumulator gains the frame's time x 60, and a step runs per whole unit (0x4f814)
  const MAX_STEPS_PER_FRAME = 4; // not the console's: a long frame here would otherwise run its steps all at once
  const CLOCK_RATE = 0.0001; // the clock gains TIMESTEP x 0.0001 a step (0x4bed0)...
  const CLOCK_WRAP = 10; // ...and goes back to 0 past 10 (0x4b6a4)
  const SMOOTHING = 0.1; // the smoothed clock moves a tenth of the way to the clock each step (0x4bce4)
  const PULL = 0.02; // each free end is pulled along x by TIMESTEP x 0.02 a step (0x4bce4)
  const END_Y_FREQ = 11; // the anchored ends swing as END Y (0.5 sin(11 (r / 19 + t)) + 0.5)...
  const END_Z_FREQ = 15; // ...and END Z x 0.5 (cos(15 (r / 19 + t)) + 1)
  const FAR_LENGTH = 2; // springs two points apart rest at twice LENGTH...
  const FAR_TENSION = 10; // ...and pull ten times as hard (0x4bed0)
  const SHAPE_REST = 1.3; // what the task receives has y and z scaled by 1.3 - cos((x - P) pi/2) (1 - S((x - P) / 5)),
  const SHAPE_REACH = 5; // P being FFD PARAM 1 and S the smoothstep, and by 0.3 below P (0x4f814)
  const SHAPE_BELOW = 0.3;

  const LATTICE = [8, 4, 4]; // ffd_shader1's control points, at X = i/8, Y = j/4, Z = k/4 (0x493c4)
  const LX = 11; // and as the task receives them, each axis's ends repeated: 11 x 7 x 7 (0x47b1c)
  const LYZ = 7;
  const LATTICE_TIME = 10; // _Time is ten times the lines' clock as the frame begins
  const CELL_LIMIT = 0.999; // spline.elf keeps the normalised point inside the lattice (0x3f7fbe76)

  // The camera the particles use too: eye at (0, 0, 2) looking down -z (_Modelview, _ModelviewProjection).
  const CAMERA = { eye: [0, 0, 2], fovy: 0.925025, near: 0.1, far: 1000 };

  const SPANS = 16; // the surface: 19 x 19 control points make 16 x 16 spans...
  const SAMPLES = 8; // ...each sampled 8 times along both axes, at t = j x 16/127
  const MESH = SPANS * SAMPLES;
  const VERTICES = MESH * MESH;
  const RECORD = 8; // floats per vertex, as spline.elf writes them: the position, then the normal
  const RESTART = 0xffff;

  // -----------------------------------------------------------------------------------------------------------------
  // Modelled: the lines' start. The console resets them to a state baked into its module, which is firmware data and
  // stays out of the repository. This one is made the same way the console's must have been, by running the lines:
  // from a sheet at rest, settled under heavy damping, then left to run with the day cycle's values.
  // -----------------------------------------------------------------------------------------------------------------
  const START = {
    damping: 0.0001, length: 0.306001, tension: 0.25, timestep: 2, perturbation: 0.1, endY: 0.4, endZ: 0.2,
  };
  const START_SETTLE_STEPS = 600;
  const START_SETTLE_DAMPING = 100; // times DAMPING
  const START_RUN_STEPS = 1200;

  // The noise: the integer hash of a counter each point moves on by 3 (0x4ab04), in (-1, 1].
  function noise(n) {
    const x = (n << 13) ^ n;
    const y = (Math.imul(x, (Math.imul(Math.imul(x, x), 15731) + 789221) | 0) + 1376312589) & 0x7fffffff;
    return 1 - Math.fround(y) / 1073741824;
  }

  function createLines() {
    return {
      p: new Float32Array(COUNT * 4), // A3, the points
      prev: new Float32Array(COUNT * 4), // A2, the points before the last step
      v: new Float32Array(COUNT * 4), // A6, their velocities
      clock: 0, smoothed: 0, counter: 0, acc: 0,
    };
  }

  // Each spring pulls i towards j by its stretch, and j back.
  function spring(p, v, i, j, rest, k) {
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) return;
    const f = (len - rest) * k / len;
    v[i] += dx * f; v[i + 1] += dy * f; v[i + 2] += dz * f;
    v[j] -= dx * f; v[j + 1] -= dy * f; v[j + 2] -= dz * f;
  }

  // One step (0x4bed0): springs and noise into the velocities, point by point and line by line, then the points
  // move, then the ends.
  function step(lines, s) {
    const { p, v } = lines;
    lines.prev.set(p);
    const dt = s.timestep * CLOCK_RATE;
    lines.clock += dt;
    if (lines.clock > CLOCK_WRAP) lines.clock = 0;
    const near = s.length, far = s.length * FAR_LENGTH;
    const k = s.tension, kFar = s.tension * FAR_TENSION;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = 4 * (N * r + c);
        if (c > 0) spring(p, v, i, i - 4, near, k);
        if (c > 1) spring(p, v, i, i - 8, far, kFar);
        if (r > 0) spring(p, v, i, i - 4 * N, near, k);
        if (r > 1) spring(p, v, i, i - 8 * N, far, kFar);
        v[i] += s.perturbation * noise(++lines.counter);
        v[i + 1] += s.perturbation * noise(++lines.counter);
        v[i + 2] += s.perturbation * noise(++lines.counter);
      }
    }
    const damp = s.damping * s.timestep;
    for (let i = 0; i < 4 * COUNT; i += 4) {
      p[i] += v[i] * dt; p[i + 1] += v[i + 1] * dt; p[i + 2] += v[i + 2] * dt;
      v[i] -= v[i] * damp; v[i + 1] -= v[i + 1] * damp; v[i + 2] -= v[i + 2] * damp;
    }
    lines.smoothed += (lines.clock - lines.smoothed) * SMOOTHING;
    const pull = s.timestep * PULL;
    for (let r = 0; r < N; r++) {
      const t = r / N + lines.smoothed;
      v[4 * N * r] += pull;
      const e = 4 * (N * r + N - 1);
      p[e] = 0;
      p[e + 1] = s.endY * (0.5 * Math.sin(END_Y_FREQ * t) + 0.5);
      p[e + 2] = s.endZ * 0.5 * (Math.cos(END_Z_FREQ * t) + 1);
      p[e + 3] = 1;
      v[e] = v[e + 1] = v[e + 2] = v[e + 3] = 0;
    }
  }

  function shape(x, p1) {
    if (x < p1) return SHAPE_BELOW;
    const m = Math.min(Math.max((x - p1) / SHAPE_REACH, 0), 1);
    return SHAPE_REST - Math.cos((x - p1) * Math.PI / 2) * (1 - m * m * (3 - 2 * m));
  }

  // What the task receives, A0 (0x4f814): the points interpolated from before the last step by what is left in the
  // accumulator, then shaped.
  function receive(lines, p1, out) {
    const { p, prev } = lines;
    const a = lines.acc;
    for (let i = 0; i < 4 * COUNT; i += 4) {
      const x = prev[i] + (p[i] - prev[i]) * a;
      const sc = shape(x, p1);
      out[i] = x;
      out[i + 1] = (prev[i + 1] + (p[i + 1] - prev[i + 1]) * a) * sc;
      out[i + 2] = (prev[i + 2] + (p[i + 2] - prev[i + 2]) * a) * sc;
      out[i + 3] = 1;
    }
  }

  // The lattice (ffd_shader1.fpo, then 0x4a848 and 0x47b1c): the program's displacement at each base point, scaled
  // by FFD SCALE1 and offset by FFD OFFSET, then laid out as the task reads it, each axis's ends repeated.
  function buildLattice(T, s, ctrl, out) {
    const [nx, ny, nz] = LATTICE;
    const wobble = 0.24 * (Math.sin(2 * T) + 3) * Math.exp(-0.0001 * T);
    const bumpAt = 0.833333 * (Math.sin(0.1 * T) + 0.2);
    for (let k = 0; k < nz; k++) {
      const Z = k / nz;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const X = i / nx;
          const x = 1.3 * X * X + 0.2 * X - 0.15;
          const y = wobble * (Math.tanh(X - 0.5) + 1) * Math.sin(7.85 * X - 2.5 * T - 1.25) + Math.sin(0.25 * T) / 2 +
            Math.exp(-50 * (X - bumpAt) * (X - bumpAt)) + Math.sin(T - 6.28 * Z) / 8;
          const c = 3 * (i + nx * (j + ny * k));
          ctrl[c] = x * s.ffdScale1X + s.ffdOffsetX;
          ctrl[c + 1] = y * s.ffdScale1Y + s.ffdOffsetY;
          ctrl[c + 2] = s.ffdOffsetZ; // the program writes z = 0
        }
      }
    }
    for (let K = 0; K < LYZ; K++) {
      const k = Math.min(Math.max(K - 1, 0), nz - 1);
      for (let J = 0; J < LYZ; J++) {
        const j = Math.min(Math.max(J - 1, 0), ny - 1);
        for (let I = 0; I < LX; I++) {
          const i = Math.min(Math.max(I - 1, 0), nx - 1);
          const c = 3 * (i + nx * (j + ny * k)), o = 3 * (I + LX * (J + LYZ * K));
          out[o] = ctrl[c]; out[o + 1] = ctrl[c + 1]; out[o + 2] = ctrl[c + 2];
        }
      }
    }
  }

  // The uniform cubic B-spline's four weights at t, and their derivatives.
  function basis(t, out, o) {
    const u = 1 - t;
    out[o] = u * u * u / 6;
    out[o + 1] = (3 * t * t * t - 6 * t * t + 4) / 6;
    out[o + 2] = (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6;
    out[o + 3] = t * t * t / 6;
  }
  function basisSlope(t, out, o) {
    out[o] = -(1 - t) * (1 - t) / 2;
    out[o + 1] = (3 * t * t - 4 * t) / 2;
    out[o + 2] = (-3 * t * t + 2 * t + 1) / 2;
    out[o + 3] = t * t / 2;
  }

  // The deformation (FUN_00003c68): the point normalised by FFD OFFSET and FFD SCALE1, displaced by the tricubic
  // B-spline over the lattice, then scaled by FFD SCALE2. The console divides with the SPU's reciprocal estimate,
  // about 1e-4 off; that is left out.
  function deform(src, lattice, s, out, w) {
    const sx = [s.ffdScale1X, s.ffdScale1Y, s.ffdScale1Z], ox = [s.ffdOffsetX, s.ffdOffsetY, s.ffdOffsetZ];
    const s2 = [s.ffdScale2X, s.ffdScale2Y, s.ffdScale2Z];
    const cells = LATTICE;
    for (let n = 0; n < COUNT; n++) {
      const i = 4 * n;
      let base = 0;
      for (let a = 0; a < 3; a++) {
        const u = (src[i + a] - ox[a]) / sx[a];
        const q = Math.min(Math.max(u, 0), CELL_LIMIT) * cells[a];
        const cell = Math.floor(q);
        basis(q - cell, w, 4 * a);
        w[12 + a] = u;
        base += cell * (a === 0 ? 1 : a === 1 ? LX : LX * LYZ);
      }
      let dx = 0, dy = 0, dz = 0;
      for (let c = 0; c < 4; c++) {
        for (let b = 0; b < 4; b++) {
          const wbc = w[4 + b] * w[8 + c];
          const row = 3 * (base + LX * (b + LYZ * c));
          for (let a = 0; a < 4; a++) {
            const wt = w[a] * wbc, o = row + 3 * a;
            dx += wt * lattice[o]; dy += wt * lattice[o + 1]; dz += wt * lattice[o + 2];
          }
        }
      }
      out[i] = (w[12] + dx) * s2[0];
      out[i + 1] = (w[13] + dy) * s2[1];
      out[i + 2] = (w[14] + dz) * s2[2];
      out[i + 3] = 1;
    }
  }

  // The matrix the task receives (b300): the camera's projection and view, times the wave's model matrix - a turn of
  // ANG ROT degrees about (ANG X, ANG Y, ANG Z), then a move to (POS X, POS Y, POS Z). Column-major, clip = M p.
  function buildMatrix(s, aspect, m) {
    let ax = s.angX, ay = s.angY, az = s.angZ;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const th = s.angRot * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), t = 1 - c;
    // Model: rotation (Rodrigues), then translation. r[col][row]
    const r = [
      [t * ax * ax + c, t * ax * ay + sn * az, t * ax * az - sn * ay],
      [t * ax * ay - sn * az, t * ay * ay + c, t * ay * az + sn * ax],
      [t * ax * az + sn * ay, t * ay * az - sn * ax, t * az * az + c],
    ];
    const tx = s.posX - CAMERA.eye[0], ty = s.posY - CAMERA.eye[1], tz = s.posZ - CAMERA.eye[2];
    const f = 1 / Math.tan(CAMERA.fovy / 2), { near, far } = CAMERA;
    const p00 = f / aspect, p11 = f, p22 = (far + near) / (near - far), p23 = 2 * far * near / (near - far);
    for (let col = 0; col < 3; col++) {
      m[4 * col] = p00 * r[col][0];
      m[4 * col + 1] = p11 * r[col][1];
      m[4 * col + 2] = p22 * r[col][2];
      m[4 * col + 3] = -r[col][2];
    }
    m[12] = p00 * tx; m[13] = p11 * ty; m[14] = p22 * tz + p23; m[15] = -tz;
  }

  function transform(m, src, out) {
    for (let i = 0; i < 4 * COUNT; i += 4) {
      const x = src[i], y = src[i + 1], z = src[i + 2], w = src[i + 3];
      out[i] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
      out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
      out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
      out[i + 3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
    }
  }

  // The weights at each of a span's eight samples, t = j x 16/127, and their slopes.
  const SAMPLE_BASIS = new Float64Array(SAMPLES * 4);
  const SAMPLE_SLOPE = new Float64Array(SAMPLES * 4);
  for (let j = 0; j < SAMPLES; j++) {
    basis(j * SPANS / (MESH - 1), SAMPLE_BASIS, 4 * j);
    basisSlope(j * SPANS / (MESH - 1), SAMPLE_SLOPE, 4 * j);
  }

  // The surface (FUN_000045c0): the bicubic B-spline over the 19 x 19 control points, rows the lines. Vertex ix of
  // line iy sits in span (iy / 8, ix / 8); its normal is the cross product of the slope across the lines with the
  // slope along them, per span, in clip space, with w = 0. Evaluated along the lines first, then across.
  function evaluateSurface(ctrl, rowPos, rowSlope, mesh) {
    for (let r = 0; r < N; r++) {
      for (let ix = 0; ix < MESH; ix++) {
        const span = ix >> 3, wb = 4 * (ix & 7);
        let px = 0, py = 0, pz = 0, pw = 0, sx = 0, sy = 0, sz = 0;
        for (let b = 0; b < 4; b++) {
          const c = 4 * (N * r + span + b), w = SAMPLE_BASIS[wb + b], d = SAMPLE_SLOPE[wb + b];
          px += w * ctrl[c]; py += w * ctrl[c + 1]; pz += w * ctrl[c + 2]; pw += w * ctrl[c + 3];
          sx += d * ctrl[c]; sy += d * ctrl[c + 1]; sz += d * ctrl[c + 2];
        }
        const o = 4 * (MESH * r + ix);
        rowPos[o] = px; rowPos[o + 1] = py; rowPos[o + 2] = pz; rowPos[o + 3] = pw;
        rowSlope[o] = sx; rowSlope[o + 1] = sy; rowSlope[o + 2] = sz;
      }
    }
    for (let iy = 0; iy < MESH; iy++) {
      const span = iy >> 3, wa = 4 * (iy & 7);
      for (let ix = 0; ix < MESH; ix++) {
        let px = 0, py = 0, pz = 0, pw = 0, tx = 0, ty = 0, tz = 0, sx = 0, sy = 0, sz = 0;
        for (let a = 0; a < 4; a++) {
          const o = 4 * (MESH * (span + a) + ix), w = SAMPLE_BASIS[wa + a], d = SAMPLE_SLOPE[wa + a];
          px += w * rowPos[o]; py += w * rowPos[o + 1]; pz += w * rowPos[o + 2]; pw += w * rowPos[o + 3];
          tx += d * rowPos[o]; ty += d * rowPos[o + 1]; tz += d * rowPos[o + 2];
          sx += w * rowSlope[o]; sy += w * rowSlope[o + 1]; sz += w * rowSlope[o + 2];
        }
        const v = RECORD * (MESH * iy + ix);
        mesh[v] = px; mesh[v + 1] = py; mesh[v + 2] = pz; mesh[v + 3] = pw;
        mesh[v + 4] = ty * sz - tz * sy;
        mesh[v + 5] = tz * sx - tx * sz;
        mesh[v + 6] = tx * sy - ty * sx;
        mesh[v + 7] = 0;
      }
    }
  }

  // The mesh's static parts: u is the line's index over 127, v fades the mesh out towards its edges; the index
  // buffer draws strips between neighbouring lines, 17 columns at a time, restarting after each.
  function edge(i) { return Math.min(1, 10 * Math.min(i, MESH - 1 - i) / (MESH - 1)); }
  function buildTexcoords() {
    const uv = new Float32Array(VERTICES * 2);
    for (let iy = 0; iy < MESH; iy++) {
      for (let ix = 0; ix < MESH; ix++) {
        const o = 2 * (MESH * iy + ix);
        uv[o] = iy / (MESH - 1);
        uv[o + 1] = edge(ix) * edge(iy);
      }
    }
    return uv;
  }
  function buildIndices() {
    const out = [];
    for (let iy = 0; iy < MESH - 1; iy++) {
      for (let first = 0; first < MESH - 1; first += SPANS) {
        const last = Math.min(first + SPANS, MESH - 1);
        for (let ix = first; ix <= last; ix++) out.push(MESH * iy + ix, MESH * (iy + 1) + ix);
        out.push(RESTART);
      }
    }
    return Uint16Array.from(out);
  }

  function createWave() {
    const lines = createLines();
    const start = createLines();
    const received = new Float32Array(COUNT * 4);
    const deformed = new Float32Array(COUNT * 4);
    const control = new Float32Array(COUNT * 4); // the grid as spline.elf leaves it, in clip space
    const latticeCtrl = new Float64Array(LATTICE[0] * LATTICE[1] * LATTICE[2] * 3);
    const lattice = new Float64Array(LX * LYZ * LYZ * 3);
    const weights = new Float64Array(16);
    const matrix = new Float64Array(16);
    const rowPos = new Float64Array(N * MESH * 4);
    const rowSlope = new Float64Array(N * MESH * 4);
    const mesh = new Float32Array(VERTICES * RECORD);
    const state = { latticeTime: 0, steps: 0, frames: 0 };

    // The start, made once: a sheet at rest, each line straight out from its anchor, settled and then run.
    (function makeStart() {
      for (let r = 0; r < N; r++) {
        const t = r / N;
        const y = START.endY * (0.5 * Math.sin(END_Y_FREQ * t) + 0.5);
        const z = START.endZ * 0.5 * (Math.cos(END_Z_FREQ * t) + 1);
        for (let c = 0; c < N; c++) {
          const i = 4 * (N * r + c);
          start.p[i] = (N - 1 - c) * START.length; start.p[i + 1] = y; start.p[i + 2] = z; start.p[i + 3] = 1;
        }
      }
      const settle = Object.assign({}, START, { damping: START.damping * START_SETTLE_DAMPING });
      for (let n = 0; n < START_SETTLE_STEPS; n++) step(start, settle);
      for (let n = 0; n < START_RUN_STEPS; n++) step(start, START);
    })();

    // The reset (0x4e624): the points and velocities from the start, the clocks, the accumulator and the noise to 0.
    function reset() {
      lines.p.set(start.p);
      lines.prev.set(start.p);
      lines.v.set(start.v);
      lines.clock = lines.smoothed = lines.counter = lines.acc = 0;
    }
    reset();

    // One frame: the lines step, the lattice is drawn at the clock the frame began with, and the task's work follows.
    function update(settings, dtSec, aspect) {
      const T = LATTICE_TIME * lines.clock;
      lines.acc = Math.min(lines.acc + Math.max(dtSec, 0) * STEP_HZ, MAX_STEPS_PER_FRAME + 1);
      while (lines.acc > 1) {
        step(lines, settings);
        lines.acc -= 1;
        state.steps++;
      }
      receive(lines, settings.ffdParam1, received);
      buildLattice(T, settings, latticeCtrl, lattice);
      deform(received, lattice, settings, deformed, weights);
      buildMatrix(settings, aspect, matrix);
      transform(matrix, deformed, control);
      evaluateSurface(control, rowPos, rowSlope, mesh);
      state.latticeTime = T;
      state.frames++;
      return mesh;
    }

    return {
      update,
      reset,
      mesh, // 16384 records of 8 floats, as spline.elf writes them: position (clip space), then normal
      texcoords: buildTexcoords(),
      indices: buildIndices(),
      lines, // the PPU's state, for inspection: A3, A2, A6, the clocks, the counter and the accumulator
      received, // A0, the grid the task receives
      control, // the grid deformed and projected, as the task leaves it in its local store
      lattice, // 11 x 7 x 7 points, as the task receives them (x, y, z)
      matrix, // b300, column-major
      state,
    };
  }

  window.PS3WaveReverse = {
    createWave,
    CAMERA,
    MESH,
    RECORD,
    RESTART,
    // The stages on their own, for checks against what the console's savestates hold.
    internals: {
      noise, step, shape, receive, buildLattice, deform, buildMatrix, transform, evaluateSurface, createLines,
    },
  };
})();
