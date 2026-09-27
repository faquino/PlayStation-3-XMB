'use strict';
// Particle simulation: a port of the SPU update task in `particles.elf` and of the PPU code that fills its block, plus
// a modelled rest (emitter, icons, input). Exported as `window.PS3ParticlesReverse`; driven by `particles.js`, reads
// `WaveSurfaceCPU`.

(function () {
  // -----------------------------------------------------------------------------------------------------------------
  // Traced from particles.elf and the RSX captures (PARTICLES_REVERSE_ENGINEER.md). Not free parameters.
  // -----------------------------------------------------------------------------------------------------------------
  const STRIDE = 12; // floats per pool slot, the task's 48-byte record: position + life, velocity + aging rate, quaternion
  const OUT_STRIDE = 8; // floats per vertex record: position + opacity, quaternion (the unused old position is dropped)
  const FREE = -666; // position.w of a free slot
  const LIFE_END = 0.99999;
  const NOISE_SEEDS = [0x98756161, 0x21324889, 0x82181158]; // reset every frame by FUN_00004978
  const SPIN_FREQS = [0.37, 0.17, 0.31];
  const GRID_W = 32; // flow grid, 32 x 16 cells of three signed bytes
  const GRID_H = 16;
  // Its two matrices, also from the block. Grid coordinates are normalised, and the rectangle they cover is what
  // the camera sees at a depth of 9, the median depth of the captured particles.
  const GRID_SCALE = [15.9546, 8.97447, 1];
  const GRID_ORIGIN = [-7.9773, -4.48723, -7];
  const LIFE_MIN = [-10, -10, -12]; // _LifeBounds, also the task's kill box at P+2048 / P+2064
  const LIFE_MAX = [10, 10, 7];
  const CAMERA = { eye: [0, 0, 2], fovy: 0.925025, near: 0.1, far: 1000 }; // _Modelview, _ModelviewProjection

  // Traced from custom_render_plugin, the PPU side that fills the block (see the notes).
  const BYTE_INV = Math.fround(1 / 127); // 0x3c010204, a grid byte's weight on both sides
  const GRID_DECAY = Math.fround(0.98); // 0x2c588, applied to every byte every frame
  const ICON_WIND_BOOST = 10; // 0x2f90c multiplies the wind by 10 before clamping it to +-1
  const ICON_MAP_LIMIT = 100; // and forgets every icon's last position once it tracks more than this many
  const SPRING_DAMP = 0.6; // 0x31494: the noise level's spring, velocity 0.6 v - 0.004 x + impulse
  const SPRING_PULL = 0.004;
  const WIND_MIN_LENGTH = 0.0001; // a shorter `wind dir` is dropped rather than normalised
  // The emitter, 0x30b80, draws from the wave's vertices: 128 lines of 128, as the captures' wave draw lays them out.
  const MESH_N = 128; // vertices along a line, column 0 at the right edge
  const MESH_M = 128; // lines
  const EMIT_MIN_SPEED = 0.0001; // a vertex that moved less than this emits nothing
  const AGING_MIN = 0.001; // and no particle ages slower than this
  const SWEEP_START = 0.06; // 0x2dbf4: an idle sweep starts with this chance a frame,
  const SWEEP_LENGTH = 100; // for 100 + 80 r births, one every other frame along a line
  const SWEEP_SPREAD = 80;
  const DEG = 0.0174533; // the emitter's degrees-to-radians factor, for `emit cone angle`

  // The XMB's icons, measured in the RSX captures: each is a unit quad with its own transform, so its centre and size
  // on screen read straight off the draw. Normalised device coordinates, as the 16:9 frame lays them out.
  const ICON_ROW_Y = 0.463; // the category row
  const ICON_SLOT_X = -0.411; // where the selected category sits
  const ICON_FIRST_GAP = 0.2185; // from it to its neighbours
  const ICON_SPACING = 0.2085; // between the others
  const ICON_SIZE = 0.217; // a category icon's height on screen
  const ICON_SELECTED_SIZE = 0.31; // the selected one's
  const ICON_RISE = 0.1935; // a category icon's centre rises by this much per unit of height it gains
  const ITEM_SELECTED_Y = 0.065; // the selected item, below the row
  const ITEM_ABOVE_Y = 0.778; // the one before it, above the row
  const ITEM_BELOW_Y = -0.259; // the one after it
  const ITEM_SPACING = 0.148;

  // -----------------------------------------------------------------------------------------------------------------
  // Modelled PPU side: where the console's wave mesh falls on the spline layer's wave, how the icons move, and what
  // feeds the input response - none of it traced yet.
  // -----------------------------------------------------------------------------------------------------------------
  const FIELD_CENTRE = [0, 0, 0]; // the origin, as the savestate shows
  const CATEGORIES = 10; // the modelled XMB's categories, and the items in each
  const ITEMS = 8;
  // The wind writer's factor on x motion, the particle object's +0x14, is not traced; x counts for nothing while
  // `icon wind scl x` is 0.
  const ICON_T = 1;
  // The spline layer has no camera, so the wave is given a depth range and a point's height picks its depth inside
  // it. The range is the one that puts new particles where the console's pool has them: its just-born band sits at
  // view depth 7.57 / 8.55 / 9.07 (5th, 50th, 95th percentile), and this range matches the median and the width.
  // The two ends cannot both land as well, because this wave's heights are distributed differently from the
  // console's - the band comes out a quarter of a unit deep at both ends.
  const WAVE_DEPTH_NEAR = 7.77;
  const WAVE_DEPTH_FAR = 9.47;
  // The console's mesh runs past the screen edges, its columns from 1.45 to -1.55 in normalised device coordinates
  // in the captures, and the emitter picks among its vertices evenly. Spreading the columns this far past the edges
  // of the spline layer's wave puts 15% of births outside the life box, as captured, and 35% off screen, against the
  // captures' 28 to 30%.
  const EMIT_EXTENT = 1.55;
  // The spline layer's wave moves more slowly than the console's, and the emitter's speeds follow the wave's: its
  // vertices are read this many times faster. That gives late life the console's speeds and leaves the newborns a
  // little slow; no one factor fits both (see the notes).
  const WAVE_SPEED_GAIN = 3.5;
  const STEP_HZ = 60;
  const MAX_STEPS_PER_FRAME = 4;
  const PREWARM_STEPS = 300;

  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);

  // One of the task's three noise generators: s = s * 16807 mod 2^32, then its top 23 bits as a float in [-1, 1).
  function lcgNext(state, i) {
    state[i] = Math.imul(state[i], 16807);
    u32[0] = 0x40000000 | (state[i] >>> 9);
    return f32[0] - 3;
  }

  // qglbase's random numbers (its export 0x2e67e2d8), which the emitter draws from: a counter run through the classic
  // integer hash, x(x^2 15731 + 789221) + 1376312589 on n ^ (n << 13), whose low 31 bits t give 1 - t / 2^30 in
  // single precision, in (-1, 1]. The console's counter is shared by everything that draws from it; here it starts
  // at the seed.
  function createQglRandom(seed) {
    let n = seed | 0;
    return function next() {
      n = (n + 1) | 0;
      const x = n ^ (n << 13);
      const t = (Math.imul(x, (Math.imul(Math.imul(x, x), 15731) + 789221) | 0) + 1376312589) & 0x7fffffff;
      return Math.fround(Math.fround(t) * -9.313225746154785e-10 + 1);
    };
  }

  // The task's parameter block, the 2304 bytes it DMAs in every frame, read whole out of RPCS3 frame captures: the
  // offsets and the values at them are verified. A savestate stores it shorter, as it leaves out all-zero lines.
  function createParams() {
    return {
      force: new Float32Array(4), // +0, (0, gravity, 0, 1)
      drag: new Float32Array(4), // +16, (friction, friction, friction, 0)
      grid: new Int8Array(GRID_W * GRID_H * 3), // +128, 32 x 16 cells of three signed bytes, row by row
      fromGrid: new Float32Array(16), // +1792, M2: grid vector -> world
      toGrid: new Float32Array(16), // +1856, M1: world -> normalised grid coordinates
      boundsMin: new Float32Array(LIFE_MIN), // +2048
      boundsMax: new Float32Array(LIFE_MAX), // +2064
      fieldCentre: new Float32Array(FIELD_CENTRE), // +2096
      fieldQuat: new Float32Array([0, 0, 0, 1]), // +2176, turned into the matrix at +2112 by the task
      noiseOffset: new Float32Array(4), // +2192, the wind
      flowStrength: 0, // +2208, 1 in the captures
      noiseScale: 0, // +2212, `brownian scale` at rest
      spinRate: 0, // +2220, `spin time scale`
      dt: new Float32Array(4), // +2224, (delta time x 3, 1)
    };
  }

  // Row-major 3x3 rotation matrix of a unit quaternion (x, y, z, w), as FUN_000048b8 builds it.
  function quatToMat3(q, m) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z); m[2] = 2 * (x * z + w * y);
    m[3] = 2 * (x * y + w * z); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
    m[6] = 2 * (x * z - w * y); m[7] = 2 * (y * z + w * x); m[8] = 1 - 2 * (x * x + y * y);
  }

  function clampIndex(i, last) { return i < 0 ? 0 : i > last ? last : i; }

  // FUN_000068e0: the flow grid sampled bilinearly at normalised grid coordinates, with the cells centred. u = g x
  // (32, 16) - 0.5 gives the base cell and the fraction, each of the four corners is clamped to the grid on its own,
  // a byte counts 1/127, and the corners blend along the row first, then between the rows.
  function sampleGrid(grid, gnx, gny, out) {
    const u = gnx * GRID_W - 0.5;
    const v = gny * GRID_H - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const xa = clampIndex(x0, GRID_W - 1), xb = clampIndex(x0 + 1, GRID_W - 1);
    const ya = clampIndex(y0, GRID_H - 1) * GRID_W, yb = clampIndex(y0 + 1, GRID_H - 1) * GRID_W;
    const i00 = (ya + xa) * 3, i10 = (ya + xb) * 3, i01 = (yb + xa) * 3, i11 = (yb + xb) * 3;
    for (let c = 0; c < 3; c++) {
      const a = grid[i00 + c] + (grid[i10 + c] - grid[i00 + c]) * fx;
      const b = grid[i01 + c] + (grid[i11 + c] - grid[i01 + c]) * fx;
      out[c] = (a + (b - a) * fy) * BYTE_INV;
    }
  }

  // M1 and M2, as the block carries them: both diagonal with a translation. Memory keeps the translation in the last
  // row; here it goes in the last column, which is the way the task applies them.
  function setGridMatrices(P) {
    const M1 = P.toGrid;
    const M2 = P.fromGrid;
    M2.fill(0);
    M1.fill(0);
    for (let a = 0; a < 3; a++) {
      M2[a * 5] = GRID_SCALE[a];
      M2[3 + a * 4] = GRID_ORIGIN[a];
      M1[a * 5] = 1 / GRID_SCALE[a];
      M1[3 + a * 4] = -GRID_ORIGIN[a] / GRID_SCALE[a];
    }
    M2[15] = 1;
    M1[15] = 1;
  }

  // Where the captures put category icon i when `selected` is the selected one, and item j of a column whose
  // selected item is `selected`.
  function categoryTargetX(i, selected) {
    const d = i - selected;
    if (d === 0) return ICON_SLOT_X;
    return ICON_SLOT_X + Math.sign(d) * (ICON_FIRST_GAP + (Math.abs(d) - 1) * ICON_SPACING);
  }

  function itemTargetY(j, selected) {
    if (j === selected) return ITEM_SELECTED_Y;
    return j < selected
      ? ITEM_ABOVE_Y + (selected - 1 - j) * ITEM_SPACING
      : ITEM_BELOW_Y - (j - selected - 1) * ITEM_SPACING;
  }

  function createSystem(options) {
    // `options.seed` makes a run repeatable, which the bench uses; without it every page load emits differently.
    const rng = createQglRandom(options && options.seed !== undefined
      ? options.seed
      : Date.now() ^ (Math.random() * 0x7fffffff));
    const uniform = () => (rng() + 1) * 0.5; // the way the PPU turns a draw into U(0, 1]

    const capacity = (options && options.capacity) || 4096;
    const pool = new Float32Array(capacity * STRIDE);
    const output = new Float32Array(capacity * OUT_STRIDE);
    const freeList = new Int32Array(capacity);
    let freeCount = 0;
    for (let s = capacity - 1; s >= 0; s--) {
      const o = s * STRIDE;
      pool[o + 3] = FREE;
      // A new particle keeps the orientation its slot's last one left. How the console fills the slots at first is
      // not traced; here each starts with a random orientation (Shoemake).
      const u1 = uniform(), u2 = uniform() * 2 * Math.PI, u3 = uniform() * 2 * Math.PI;
      const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
      pool[o + 8] = a * Math.sin(u2); pool[o + 9] = a * Math.cos(u2);
      pool[o + 10] = b * Math.sin(u3); pool[o + 11] = b * Math.cos(u3);
      freeList[freeCount++] = s;
    }

    const P = createParams();
    setGridMatrices(P);
    const fieldRot = new Float32Array(9);
    const noise = new Uint32Array(3);
    const flowTmp = new Float32Array(3);

    const model = {
      rotDpad: [0, 0, 0], // field angular velocity from icon steps, rad per step
      rotShake: [0, 0, 0], // and from shaking the controller
      stirSign: 1,
      // The noise level's spring (0x31494): position, velocity, and the impulse the next step adds.
      spring: 0,
      springVel: 0,
      impulse: 0,
      level: 0, // the position clamped to [0, 1]
      motion: 0, // what the controller's newest motion vector measures
    };
    // The modelled XMB: which category and which item in each is selected, and where the icons are on screen. Only
    // the selected category's items are drawn.
    const icons = {
      category: 4,
      item: new Int32Array(CATEGORIES).fill(2),
      x: new Float32Array(CATEGORIES),
      size: new Float32Array(CATEGORIES),
      column: -1,
      itemY: new Float32Array(ITEMS),
      // The wind writer's own memory: every icon's position when it was last drawn, by id.
      last: new Map(),
    };
    for (let i = 0; i < CATEGORIES; i++) {
      icons.x[i] = categoryTargetX(i, icons.category);
      icons.size[i] = i === icons.category ? ICON_SELECTED_SIZE : ICON_SIZE;
    }
    // The emitter's state: the vertices picked this frame, as (column, line) pairs, the ones picked the frame before,
    // which are born now, and the sweep in progress.
    const emission = { picked: [], due: [], sweepLeft: 0, sweepX: 0, sweepY: 0, frame: 0 };
    const wave = {
      surface: null, data: null, prevData: null, t: 0, prevT: 0, dtWave: 0, p00: 1, p11: 1,
    };
    const wA = new Float32Array(4);
    const wB = new Float32Array(4);
    const wD = new Float32Array(4);
    const evalTmp = new Float32Array(3);
    const noInput = { stepsX: 0, stepsY: 0, accelX: 0, accelY: 0 };
    // Input gathered since the last simulation step: frames above 60 Hz can run no step at all.
    const pending = { stepsX: 0, stepsY: 0, accelX: 0, accelY: 0 };

    const stats = { count: 0, emitted: 0, died: 0, steps: 0, level: 0, noiseScale: 0, fieldAngle: 0 };
    let count = 0;
    let stepCarry = 0;
    let warm = false;

    // --- Verified: the update task (0x6ed0), one call per frame over the whole pool -------------------------------
    function runTask() {
      noise[0] = NOISE_SEEDS[0];
      noise[1] = NOISE_SEEDS[1];
      noise[2] = NOISE_SEEDS[2];
      quatToMat3(P.fieldQuat, fieldRot);
      const M1 = P.toGrid;
      const M2 = P.fromGrid;
      const R = fieldRot;
      const c = P.fieldCentre;
      const F0 = P.force;
      const D = P.drag;
      const dtx = P.dt[0], dty = P.dt[1], dtz = P.dt[2], dtw = P.dt[3];
      const spinK = 0.5 * P.spinRate / 60;
      const bMin = P.boundsMin;
      const bMax = P.boundsMax;
      let n = 0;

      for (let s = 0; s < capacity; s++) {
        const o = s * STRIDE;
        if (pool[o + 3] === FREE) continue;
        let px = pool[o], py = pool[o + 1], pz = pool[o + 2], life = pool[o + 3];
        let vx = pool[o + 4], vy = pool[o + 5], vz = pool[o + 6];
        const aging = pool[o + 7];

        // 1. Flow grid: into grid space, bilinear sample, back to world space.
        const gx = M1[0] * px + M1[1] * py + M1[2] * pz + M1[3];
        const gy = M1[4] * px + M1[5] * py + M1[6] * pz + M1[7];
        sampleGrid(P.grid, gx, gy, flowTmp);
        const flx = M2[0] * flowTmp[0] + M2[1] * flowTmp[1] + M2[2] * flowTmp[2];
        const fly = M2[4] * flowTmp[0] + M2[5] * flowTmp[1] + M2[6] * flowTmp[2];
        const flz = M2[8] * flowTmp[0] + M2[9] * flowTmp[1] + M2[10] * flowTmp[2];

        // 2. Noise: the k-th live particle gets the k-th draw of the reseeded generators.
        const nx = lcgNext(noise, 0) * P.noiseScale + P.noiseOffset[0];
        const ny = lcgNext(noise, 1) * P.noiseScale + P.noiseOffset[1];
        const nz = lcgNext(noise, 2) * P.noiseScale + P.noiseOffset[2];

        // 3. Force.
        const fx = F0[0] + nx + flx * P.flowStrength;
        const fy = F0[1] + ny + fly * P.flowStrength;
        const fz = F0[2] + nz + flz * P.flowStrength;

        // 4. Field rotation about c, turned into a velocity change.
        const rx = px - c[0], ry = py - c[1], rz = pz - c[2];
        vx += (c[0] + R[0] * rx + R[1] * ry + R[2] * rz - px) / dtx;
        vy += (c[1] + R[3] * rx + R[4] * ry + R[5] * rz - py) / dty;
        vz += (c[2] + R[6] * rx + R[7] * ry + R[8] * rz - pz) / dtz;

        // 5. Integration, a vec4 operation: life advances by the aging rate.
        vx += (fx - D[0] * vx) * dtx;
        vy += (fy - D[1] * vy) * dty;
        vz += (fz - D[2] * vz) * dtz;
        px += vx * dtx;
        py += vy * dty;
        pz += vz * dtz;
        life += aging * dtw;

        // 6. Spin: q += 1/2 (w x q) * rate / 60, with w a function of life.
        const tw = 2 * Math.PI * life;
        const ox = Math.sin(tw * SPIN_FREQS[0]);
        const oy = Math.cos(tw * SPIN_FREQS[1]);
        const oz = Math.cos(tw * SPIN_FREQS[2]);
        let qx = pool[o + 8], qy = pool[o + 9], qz = pool[o + 10], qw = pool[o + 11];
        const dqx = ox * qw + (oy * qz - oz * qy);
        const dqy = oy * qw + (oz * qx - ox * qz);
        const dqz = oz * qw + (ox * qy - oy * qx);
        const dqw = -(ox * qx + oy * qy + oz * qz);
        qx += dqx * spinK;
        qy += dqy * spinK;
        qz += dqz * spinK;
        qw += dqw * spinK;
        const qn = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
        qx *= qn; qy *= qn; qz *= qn; qw *= qn;

        // 7. Death: end of life, or out of the box. The slot goes back on the free list.
        if (life >= LIFE_END || px < bMin[0] || py < bMin[1] || pz < bMin[2] ||
            px > bMax[0] || py > bMax[1] || pz > bMax[2]) {
          pool[o + 3] = FREE;
          freeList[freeCount++] = s;
          stats.died++;
          continue;
        }

        pool[o] = px; pool[o + 1] = py; pool[o + 2] = pz; pool[o + 3] = life;
        pool[o + 4] = vx; pool[o + 5] = vy; pool[o + 6] = vz;
        pool[o + 8] = qx; pool[o + 9] = qy; pool[o + 10] = qz; pool[o + 11] = qw;

        // 8. Vertex record: fade in over the first 2% of life, out over the last 6%.
        const w = n * OUT_STRIDE;
        output[w] = px;
        output[w + 1] = py;
        output[w + 2] = pz;
        output[w + 3] = Math.min(life, 0.02) * 50 * (1 - Math.max(life - 0.94, 0) * 16.6667);
        output[w + 4] = qx;
        output[w + 5] = qy;
        output[w + 6] = qz;
        output[w + 7] = qw;
        n++;
      }
      count = n;
    }

    // --- Modelled: the wave as seen by the particles -------------------------------------------------------------
    // The spline layer draws in clip space with no camera, so a wave point is placed where the real camera would see
    // it: at the depth range the captured wave occupies, on the ray through its screen position.
    function waveToWorld(data, t, gx, gz, out) {
      const s = wave.surface;
      window.WaveSurfaceCPU.evaluate(s.settings, data, s.width, s.height, gx, gz, t, evalTmp);
      const d = WAVE_DEPTH_NEAR + (evalTmp[2] + 1) * 0.5 * (WAVE_DEPTH_FAR - WAVE_DEPTH_NEAR);
      out[0] = evalTmp[0] * d / wave.p00;
      out[1] = evalTmp[1] * d / wave.p11;
      out[2] = CAMERA.eye[2] - d;
      out[3] = evalTmp[2];
      return out;
    }

    // World velocity of the wave at (gx, gz) in task units (displacement per step / dt), or 0 on the first frame.
    function waveVelocity(gx, gz, now, S, out) {
      if (wave.dtWave <= 1e-4) {
        out[0] = out[1] = out[2] = 0;
        return out;
      }
      waveToWorld(wave.prevData, wave.prevT, gx, gz, wD);
      const k = 1 / (wave.dtWave * STEP_HZ * S.deltaTime);
      out[0] = (now[0] - wD[0]) * k;
      out[1] = (now[1] - wD[1]) * k;
      out[2] = (now[2] - wD[2]) * k;
      return out;
    }

    // --- Verified: the flow grid, as custom_render_plugin writes it --------------------------------------------
    // Empty at rest. A moving icon overwrites the cell under it with its motion on screen (0x2f90c), and every byte
    // decays by 0.98 a frame (0x2c588), both in single precision the way the PPU works them out.
    function decayGrid() {
      const g = P.grid;
      for (let i = 0; i < g.length; i++) {
        if (g[i] === 0) continue;
        const v = Math.fround(Math.fround(g[i] * BYTE_INV) * GRID_DECAY);
        g[i] = Math.trunc(Math.fround(Math.min(Math.max(v, -1), 1) * 127));
      }
    }

    // A component of the wind as a byte: times 10, clamped to +-1, times 127, truncated.
    function windByte(v) {
      const c = Math.min(Math.max(Math.fround(Math.fround(v) * ICON_WIND_BOOST), -1), 1);
      return Math.trunc(Math.fround(c * 127));
    }

    // 0x2f90c, called for every icon drawn, with its position on screen in normalised device coordinates. The first
    // time it sees an icon it only remembers where it is; after that, an icon that has moved writes its motion, times
    // `icon wind` and its two scales, into the cell it is over.
    function iconWind(S, id, x, y) {
      if (icons.last.size > ICON_MAP_LIMIT) icons.last.clear();
      const last = icons.last.get(id);
      if (!last) {
        icons.last.set(id, [x, y]);
        return;
      }
      const dx = x - last[0];
      const dy = y - last[1];
      last[0] = x;
      last[1] = y;
      if (dx === 0 && dy === 0) return;
      const col = clampIndex(Math.trunc((x + 1) * 0.5 * GRID_W), GRID_W - 1);
      const row = clampIndex(Math.trunc((y + 1) * 0.5 * GRID_H), GRID_H - 1);
      const w = Math.fround(S.iconWind);
      const cell = (row * GRID_W + col) * 3;
      P.grid[cell] = windByte(Math.fround(Math.fround(dx * ICON_T) * w) * S.iconWindSclX);
      P.grid[cell + 1] = windByte(Math.fround(dy * w) * S.iconWindSclY);
      P.grid[cell + 2] = 0;
    }

    // --- Modelled: the XMB's icons, which the wind follows. Where they sit is measured, how they move is not -----
    // An icon step moves the selection, and every icon eases towards where the captures put it for the new one: the
    // row slides, the selected category's icon grows and rises, its column scrolls. The easing's time constant,
    // `iconEaseSec`, is the modelled part: at 0.065 s, the first frame of a step writes about the strongest byte the
    // captures show along the row, 59.
    function moveIcons(S, ev) {
      if (ev.stepsX) icons.category = Math.min(Math.max(icons.category + ev.stepsX, 0), CATEGORIES - 1);
      const c = icons.category;
      if (ev.stepsY) icons.item[c] = Math.min(Math.max(icons.item[c] + ev.stepsY, 0), ITEMS - 1);
      const k = 1 - Math.exp(-1 / (STEP_HZ * Math.max(S.iconEaseSec, 0.001)));
      for (let i = 0; i < CATEGORIES; i++) {
        icons.x[i] += (categoryTargetX(i, c) - icons.x[i]) * k;
        icons.size[i] += ((i === c ? ICON_SELECTED_SIZE : ICON_SIZE) - icons.size[i]) * k;
        iconWind(S, i, icons.x[i], ICON_ROW_Y + ICON_RISE * (icons.size[i] - ICON_SIZE));
      }
      // A category's items appear in place when it is selected, and the column they replace stops being drawn.
      const selected = icons.item[c];
      if (icons.column !== c) {
        icons.column = c;
        for (let j = 0; j < ITEMS; j++) icons.itemY[j] = itemTargetY(j, selected);
      }
      for (let j = 0; j < ITEMS; j++) {
        icons.itemY[j] += (itemTargetY(j, selected) - icons.itemY[j]) * k;
        iconWind(S, CATEGORIES + c * ITEMS + j, icons.x[c], icons.itemY[j]);
      }
    }

    // --- The parameter block, as 0x31494 fills it; what the input feeds into it is modelled -----------------------
    function clampAbs(v, max) { return Math.max(-max, Math.min(max, v)); }

    function buildParams(S, ev) {
      // The force is `gravity` alone. The wind goes to the noise offset instead, which the task adds to the force
      // all the same: `wind dir` normalised - dropped when shorter than 0.0001 - times `wind scale` + 10 x
      // `wind scale 10`.
      P.force[0] = 0;
      P.force[1] = S.gravity;
      P.force[2] = 0;
      P.force[3] = 0;
      const windLength = Math.hypot(S.windDirX, S.windDirY, S.windDirZ);
      const wind = windLength < WIND_MIN_LENGTH ? 0 : (S.windScale + 10 * S.windScale10) / windLength;
      P.noiseOffset[0] = S.windDirX * wind;
      P.noiseOffset[1] = S.windDirY * wind;
      P.noiseOffset[2] = S.windDirZ * wind;
      P.drag[0] = P.drag[1] = P.drag[2] = S.friction;
      P.drag[3] = 0;
      P.dt[0] = P.dt[1] = P.dt[2] = S.deltaTime;
      P.dt[3] = 1;
      P.spinRate = S.spinTimeScale;
      P.flowStrength = S.flowStrength;
      decayGrid();

      for (let a = 0; a < 3; a++) {
        model.rotDpad[a] *= S.rotationDecay;
        model.rotShake[a] *= S.rotationDecay;
      }

      // Icon steps act as D-pad presses. A savestate taken while navigating the XMB shows the field turned about y
      // by 1.84e-5, a sixth of `dpad rot max`, and the noise at 3.19 times its rest, both of them on their way down.
      // Which way it turns is measured: four captures, two taken holding right and two holding left, carry the
      // field's rotation as +2.09e-5 and +2.16e-5 against -2.05e-5 and -2.23e-5. Right is positive - the particles
      // go the way the icons go, and the XMB scrolls those against the key. It also dates the savestate taken while
      // navigating, whose +1.84e-5 was a step to the right. `dpad scale y` is 0 in the firmware, so only sideways
      // steps turn the field.
      // What kicks the noise's spring is not traced. Here a step kicks it by `stepNoiseImpulse`: at 0.4, the noise
      // is 3.17 times its rest 0.4 s after a step, against the 3.19 that savestate measured.
      if (ev.stepsX || ev.stepsY) {
        model.rotDpad[1] = clampAbs(model.rotDpad[1] + ev.stepsX * S.dpadScaleX * S.dpadRotMax, S.dpadRotMax);
        model.rotDpad[0] = clampAbs(model.rotDpad[0] - ev.stepsY * S.dpadScaleY * S.dpadRotMax, S.dpadRotMax);
        model.impulse += S.stepNoiseImpulse * (Math.abs(ev.stepsX) + Math.abs(ev.stepsY));
      }

      // Shake detection on the accelerometer. A savestate taken while the controller was shaken shows the noise at
      // 6.63 times its rest and next to no turn, so shaking is mostly noise: it stirs the field about the same y axis
      // the D-pad uses, in the direction of the swing that started it, since kicks that followed each swing would
      // cancel out, and it kicks the spring by `dshake brw imp`. The motion the noise also reads is the adapter's
      // acceleration times `shakeMotionGain`: at 0.05, a shake just past the threshold puts the noise near that
      // savestate's.
      const shake = Math.hypot(S.dshakeXCoeff * ev.accelX, S.dshakeGCoeff * ev.accelY);
      if (shake > S.dshakeThresh && S.dshakeThresh > 0) {
        const excess = (shake - S.dshakeThresh) / S.dshakeThresh;
        if (model.level < 0.05) model.stirSign = ev.accelX < 0 ? 1 : -1;
        const kick = S.dshakeRotImp * S.dshakeRotMax * excess;
        model.rotShake[1] = clampAbs(model.rotShake[1] + model.stirSign * kick, S.dshakeRotMax);
        model.impulse += S.dshakeBrwImp * (1 + excess);
      }
      model.motion = Math.hypot(ev.accelX, ev.accelY) * S.shakeMotionGain;

      const rx = model.rotDpad[0] + model.rotShake[0];
      const ry = model.rotDpad[1] + model.rotShake[1];
      const rz = model.rotDpad[2] + model.rotShake[2];
      const angle = Math.hypot(rx, ry, rz);
      if (angle > 1e-12) {
        const k = Math.sin(angle * 0.5) / angle;
        P.fieldQuat[0] = rx * k;
        P.fieldQuat[1] = ry * k;
        P.fieldQuat[2] = rz * k;
        P.fieldQuat[3] = Math.cos(angle * 0.5);
      } else {
        P.fieldQuat[0] = P.fieldQuat[1] = P.fieldQuat[2] = 0;
        P.fieldQuat[3] = 1;
      }

      // The noise scale is `brownian scale` + level x `brownian` + motion x `rshake brw`. The level is a damped
      // spring: its velocity becomes 0.6 times itself, less 0.004 times its position, plus the impulse, and the
      // level is its position clamped to [0, 1].
      model.springVel = SPRING_DAMP * model.springVel - SPRING_PULL * model.spring + model.impulse;
      model.impulse = 0;
      model.spring += model.springVel;
      model.level = Math.min(Math.max(model.spring, 0), 1);
      P.noiseScale = S.brownianScale + model.level * S.uiBrownian + model.motion * S.rshakeBrw;
      stats.level = model.level;
      stats.noiseScale = P.noiseScale;
      stats.fieldAngle = angle;
    }

    // --- Verified: the emitter, as custom_render_plugin runs it once a frame (0x30b80) ---------------------------
    // Vertices of the wave are picked in one frame and born in the next: a particle starts at its vertex, moving in a
    // cone around the way the vertex moves. The PPU queues each birth as commands - a new slot, a position, a
    // velocity, an aging rate - that write straight into the pool, so the particle keeps its slot's last orientation.

    // Where column ix of line iy falls on the spline layer's wave (modelled): the lines are the surface's rows, and
    // the columns run from EMIT_EXTENT at the right edge, where the console's column 0 is, to -EMIT_EXTENT.
    const mesh = { gx: 0, gz: 0 };
    function meshPoint(ix, iy) {
      mesh.gx = EMIT_EXTENT * (1 - (2 * ix) / (MESH_N - 1));
      mesh.gz = (2 * iy) / (MESH_M - 1) - 1;
    }

    // 0x2dde4: one draw a frame against `emit prob`, and if it passes, `emit per frame` vertices - an integer, as
    // the PPU keeps it - each at trunc(U x 127) on both axes.
    function pickVertices(S) {
      if (uniform() >= S.emitProb) return;
      const n = Math.trunc(S.emitPerFrame);
      for (let i = 0; i < n; i++) {
        const ix = Math.trunc(uniform() * (MESH_N - 1));
        emission.picked.push(ix, Math.trunc(uniform() * (MESH_M - 1)));
      }
    }

    // 0x2dbf4: while no sweep runs, one starts with a 0.06 chance a frame, at a random vertex, for 100 + 80 r
    // births. While one runs, every other frame picks the next vertex along its line, towards the left edge, until
    // the births or the line run out.
    function sweep() {
      if (emission.sweepLeft === 0) {
        if (uniform() < SWEEP_START) {
          emission.sweepX = Math.trunc(uniform() * (MESH_N - 1));
          emission.sweepY = Math.trunc(uniform() * (MESH_M - 1));
          emission.sweepLeft = Math.trunc(rng() * SWEEP_SPREAD) + SWEEP_LENGTH;
        }
        return;
      }
      if (emission.frame & 1) return;
      if (emission.sweepX < MESH_N) {
        emission.picked.push(emission.sweepX, emission.sweepY);
        emission.sweepX++;
        emission.sweepLeft--;
      } else {
        emission.sweepLeft = 0;
      }
    }

    // One vertex picked the frame before, born now. The console takes the vertex's velocity as how far it moved in
    // that frame over `delta time`; here it is the wave's own velocity in the same units, since the page's frames
    // need not match the steps.
    function emitAt(S, ix, iy) {
      meshPoint(ix, iy);
      waveToWorld(wave.data, wave.t, mesh.gx, mesh.gz, wA);
      if (Math.abs(wA[3]) > 1) return; // the spline layer clips this row, so there is no vertex there (modelled)
      waveVelocity(mesh.gx, mesh.gz, wA, S, wB);
      const v = Math.hypot(wB[0], wB[1], wB[2]) * WAVE_SPEED_GAIN;
      if (v < EMIT_MIN_SPEED) return;

      // The cone's axis is the way the vertex moves, reversed with a chance of `emit neg prob`.
      const vk = WAVE_SPEED_GAIN / v;
      let dx = wB[0] * vk, dy = wB[1] * vk, dz = wB[2] * vk;
      if (uniform() < S.emitNegProb) { dx = -dx; dy = -dy; dz = -dz; }
      // Two axes across it: the longest of d x X, d x Y and d x Z, normalised, and d times that.
      const l4 = dz * dz + dy * dy, l6 = dz * dz + dx * dx, l5 = dy * dy + dx * dx;
      let ax, ay, az;
      if (l4 > l6 ? l4 > l5 : false) { ax = 0; ay = dz; az = -dy; }
      else if (l4 > l6 || !(l6 > l5)) { ax = dy; ay = -dx; az = 0; }
      else { ax = -dz; ay = 0; az = dx; }
      const al = Math.hypot(ax, ay, az);
      ax /= al; ay /= al; az /= al;
      const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax;
      // The angle off the axis is uniform up to `emit cone angle`, and the direction around it uniform.
      const theta = uniform() * S.emitConeAngle * DEG;
      const phi = uniform() * 2 * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta), sp = Math.sin(phi), cp = Math.cos(phi);
      // `emit vel zscale` scales what lies along the camera's axis, z here, and the direction is not renormalised.
      const ux = dx * ct + (ax * cp + bx * sp) * st;
      const uy = dy * ct + (ay * cp + by * sp) * st;
      const uz = (dz * ct + (az * cp + bz * sp) * st) * S.emitVelZscale;
      // The speed grows as the square root of the vertex's own, and never drops below `emit vel min`.
      const speed = Math.max(Math.sqrt(v * S.emitVelMul * (1 + S.emitVelVar * rng())), S.emitVelMin);
      const aging = Math.max(AGING_MIN, S.agingSpeed * (1 + S.agingVariance * rng()));

      if (freeCount === 0) return;
      const o = freeList[--freeCount] * STRIDE; // the free list's last slot: the one freed most recently
      pool[o] = wA[0]; pool[o + 1] = wA[1]; pool[o + 2] = wA[2]; pool[o + 3] = 0;
      pool[o + 4] = ux * speed; pool[o + 5] = uy * speed; pool[o + 6] = uz * speed; pool[o + 7] = aging;
      stats.emitted++;
    }

    function emit(S) {
      emission.picked.length = 0;
      pickVertices(S);
      sweep();
      const due = emission.due;
      for (let i = 0; i < due.length; i += 2) emitAt(S, due[i], due[i + 1]);
      emission.due = emission.picked;
      emission.picked = due;
      emission.frame++;
    }

    // The block first, decaying the grid, then the icons' wind on top of it: which of the two comes first within a
    // frame on the console is not known.
    function step(S, ev) {
      buildParams(S, ev);
      moveIcons(S, ev);
      emit(S);
      runTask();
      stats.steps++;
    }

    function gatherInput(input, dtSec) {
      if (!input) return;
      const ev = input.poll(dtSec);
      pending.stepsX += ev.stepsX;
      pending.stepsY += ev.stepsY;
      if (Math.hypot(ev.accelX, ev.accelY) >= Math.hypot(pending.accelX, pending.accelY)) {
        pending.accelX = ev.accelX;
        pending.accelY = ev.accelY;
      }
    }

    // Advances the system to the wave's current frame. `aspect` is the canvas aspect the camera will use.
    function update(S, surface, input, timeSec, dtSec, aspect) {
      if (!wave.prevData || wave.prevData.length !== surface.data.length) {
        wave.prevData = new Float32Array(surface.data);
        wave.prevT = timeSec;
      }
      wave.surface = surface;
      wave.data = surface.data;
      wave.t = timeSec;
      wave.dtWave = timeSec - wave.prevT;
      wave.p11 = 1 / Math.tan(CAMERA.fovy * 0.5);
      wave.p00 = wave.p11 / aspect;

      gatherInput(input, dtSec);

      // The emitter needs the wave to have moved, so the scene is filled on the second frame rather than the first.
      if (!warm && wave.dtWave > 1e-4) {
        warm = true;
        for (let i = 0; i < PREWARM_STEPS; i++) step(S, noInput);
      }

      // Presses and shakes go to the first step.
      stepCarry = Math.min(stepCarry + dtSec * STEP_HZ, MAX_STEPS_PER_FRAME);
      while (stepCarry >= 1) {
        stepCarry -= 1;
        step(S, pending);
        pending.stepsX = pending.stepsY = 0;
        pending.accelX = pending.accelY = 0;
      }

      wave.prevData.set(surface.data);
      wave.prevT = timeSec;
      stats.count = count;
    }

    return {
      update,
      output,
      params: P,
      stats,
      capacity,
      // The pool itself, for inspection: `STRIDE` floats per slot in the task's own record layout, so it compares
      // directly against a pool read out of a savestate. `tools/bench/particles.js` does that comparison.
      pool,
      stride: STRIDE,
      free: FREE,
      get count() { return count; },
    };
  }

  window.PS3ParticlesReverse = {
    createSystem,
    CAMERA,
    LIFE_MIN,
    LIFE_MAX,
    OUT_STRIDE,
    WAVE_DEPTH_NEAR,
    WAVE_DEPTH_FAR,
  };
})();
