'use strict';
// Particle simulation: a port of the SPU update task in `particles.elf`, plus a modelled PPU side (emitter, flow grid,
// input response). Exported as `window.PS3ParticlesReverse`; driven by `particles.js`, reads `WaveSurfaceCPU`.

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
  const GRID_W = 32; // flow grid, from the parameter block read out of an RPCS3 savestate
  const GRID_H = 16;
  // Its two matrices, also from the block. Grid coordinates are normalised, and the rectangle they cover is what
  // the camera sees at a depth of 9, the median depth of the captured particles.
  const GRID_SCALE = [15.9546, 8.97447, 1];
  const GRID_ORIGIN = [-7.9773, -4.48723, -7];
  const LIFE_MIN = [-10, -10, -12]; // _LifeBounds, also the task's kill box at P+2048 / P+2064
  const LIFE_MAX = [10, 10, 7];
  const CAMERA = { eye: [0, 0, 2], fovy: 0.925025, near: 0.1, far: 1000 }; // _Modelview, _ModelviewProjection

  // -----------------------------------------------------------------------------------------------------------------
  // Modelled PPU side: emitter, flow grid content and input response live in qgl_gaia_app / qglbase, not traced yet.
  // -----------------------------------------------------------------------------------------------------------------
  const FIELD_CENTRE = [0, 0, 0]; // the origin, as the savestate shows
  // The spline layer has no camera, so the wave gets the depths the captured one has on screen (5th-95th percentile).
  const WAVE_DEPTH_NEAR = 6.8;
  const WAVE_DEPTH_FAR = 10.6;
  // The captured wave runs past the screen edges, and particles are shared among its vertices evenly. Emitting this
  // far past the edges gives the captured shares: 14% of emissions fall outside the life box, 25% land off screen.
  const EMIT_EXTENT = 1.55;
  const FLOW_SAMPLES_X = 24;
  const FLOW_SAMPLES_Z = [-0.75, -0.25, 0.25, 0.75];
  const FLOW_RADIUS = 1.5;
  const NORMAL_STEP = 0.01;
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

  // Park-Miller "minimal standard" generator. qgl_gaia_app carries the same arithmetic, but as a hash that picks a
  // random element of a list, so the emitter drawing from it here is part of the model.
  function createParkMiller(seed) {
    let s = ((seed ^ 0xdeadbeef) >>> 0) % 2147483647 || 1;
    return function next() {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // The task's parameter structure, 768 bytes, read whole out of an RPCS3 savestate: the offsets and the values at
  // them are verified. The task DMAs three of these and works on the last, which is why the traced offsets of the
  // force and the drag sit 1536 bytes below the rest.
  function createParams() {
    return {
      force: new Float32Array(4), // +0, in the savestate (0, gravity, 0, 1)
      drag: new Float32Array(4), // +16, (friction, friction, friction, 0)
      fromGrid: new Float32Array(16), // +256, M2: grid vector -> world
      toGrid: new Float32Array(16), // +320, M1: world -> normalised grid coordinates
      grid: new Float32Array(GRID_W * GRID_H * 4), // described at +384: 32 x 16, data elsewhere (see the notes)
      boundsMin: new Float32Array(LIFE_MIN), // +512
      boundsMax: new Float32Array(LIFE_MAX), // +528
      fieldCentre: new Float32Array(FIELD_CENTRE), // +560
      fieldQuat: new Float32Array([0, 0, 0, 1]), // +640, turned into the matrix at +576 by the task
      noiseOffset: new Float32Array(4), // +656
      flowStrength: 0, // +672, 1 in the savestate
      noiseScale: 0, // +676, `brownian scale` unchanged
      spinRate: 0, // +684, `spin time scale`
      dt: new Float32Array(4), // +688, (delta time x 3, 1)
    };
  }

  // Row-major 3x3 rotation matrix of a unit quaternion (x, y, z, w), as FUN_000048b8 builds it.
  function quatToMat3(q, m) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z); m[2] = 2 * (x * z + w * y);
    m[3] = 2 * (x * y + w * z); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
    m[6] = 2 * (x * z - w * y); m[7] = 2 * (y * z + w * x); m[8] = 1 - 2 * (x * x + y * y);
  }

  // Bilinear sample of the flow grid at normalised grid coordinates, clamped to its edges. The block carries the
  // grid's size both as 32, 16 and as 31, 15, which is what the coordinates scale by.
  function sampleGrid(grid, gnx, gny, out) {
    const x = Math.min(Math.max(gnx * (GRID_W - 1), 0), GRID_W - 1);
    const y = Math.min(Math.max(gny * (GRID_H - 1), 0), GRID_H - 1);
    const x0 = Math.min(Math.floor(x), GRID_W - 2);
    const y0 = Math.min(Math.floor(y), GRID_H - 2);
    const fx = x - x0;
    const fy = y - y0;
    const i00 = (y0 * GRID_W + x0) * 4;
    const i10 = i00 + 4;
    const i01 = i00 + GRID_W * 4;
    const i11 = i01 + 4;
    for (let c = 0; c < 3; c++) {
      const a = grid[i00 + c] + (grid[i10 + c] - grid[i00 + c]) * fx;
      const b = grid[i01 + c] + (grid[i11 + c] - grid[i01 + c]) * fx;
      out[c] = a + (b - a) * fy;
    }
  }

  function createSystem(options) {
    const capacity = (options && options.capacity) || 4096;
    const pool = new Float32Array(capacity * STRIDE);
    const output = new Float32Array(capacity * OUT_STRIDE);
    const freeList = new Int32Array(capacity);
    let freeCount = 0;
    for (let s = capacity - 1; s >= 0; s--) {
      pool[s * STRIDE + 3] = FREE;
      freeList[freeCount++] = s;
    }

    const P = createParams();
    const fieldRot = new Float32Array(9);
    const noise = new Uint32Array(3);
    const flowTmp = new Float32Array(3);
    // `options.seed` makes a run repeatable, which the bench uses; without it every page load emits differently.
    const rng = createParkMiller(options && options.seed !== undefined
      ? options.seed >>> 0
      : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);

    const model = {
      rotDpad: [0, 0, 0], // field angular velocity from icon steps, rad per step
      rotShake: [0, 0, 0], // and from shaking the controller
      shake: 0, // shake level driving the Brownian boost, 0..1
      stirSign: 1,
      emitCarry: 0,
    };
    const wave = {
      surface: null, data: null, prevData: null, t: 0, prevT: 0, dtWave: 0, p00: 1, p11: 1,
    };
    const flowPos = new Float32Array(FLOW_SAMPLES_X * FLOW_SAMPLES_Z.length * 2);
    const flowVel = new Float32Array(FLOW_SAMPLES_X * FLOW_SAMPLES_Z.length * 3);
    const wA = new Float32Array(4);
    const wB = new Float32Array(4);
    const wC = new Float32Array(4);
    const wD = new Float32Array(4);
    const evalTmp = new Float32Array(3);
    const noInput = { stepsX: 0, stepsY: 0, iconVelX: 0, iconVelY: 0, accelX: 0, accelY: 0 };
    // Input gathered since the last simulation step: frames above 60 Hz can run no step at all.
    const pending = { stepsX: 0, stepsY: 0, iconVelX: 0, iconVelY: 0, accelX: 0, accelY: 0 };

    const stats = { count: 0, emitted: 0, died: 0, steps: 0, shake: 0, fieldAngle: 0 };
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

    function insideBounds(p) {
      return p[0] > LIFE_MIN[0] && p[1] > LIFE_MIN[1] && p[2] > LIFE_MIN[2] &&
        p[0] < LIFE_MAX[0] && p[1] < LIFE_MAX[1] && p[2] < LIFE_MAX[2];
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

    // --- Flow grid: the two matrices are verified, what the grid holds is modelled ------------------------------
    // The grid covers what the camera sees at a depth of 9, in normalised coordinates. The wave's own velocity
    // goes into it, scaled into grid space so that M2 brings it back to world units, with Gaussian weights that
    // fade the flow away from the wave.
    function buildFlowGrid(S) {
      // Both matrices are diagonal with a translation. Memory keeps the translation in the last row; here it goes
      // in the last column, which is the way the task applies them above.
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

      let m = 0;
      for (let j = 0; j < FLOW_SAMPLES_Z.length; j++) {
        for (let i = 0; i < FLOW_SAMPLES_X; i++) {
          const gx = ((i / (FLOW_SAMPLES_X - 1)) * 2 - 1) * EMIT_EXTENT;
          waveToWorld(wave.data, wave.t, gx, FLOW_SAMPLES_Z[j], wA);
          if (Math.abs(wA[3]) > 1) continue;
          waveVelocity(gx, FLOW_SAMPLES_Z[j], wA, S, wB);
          flowPos[m * 2] = wA[0];
          flowPos[m * 2 + 1] = wA[1];
          flowVel[m * 3] = wB[0];
          flowVel[m * 3 + 1] = wB[1];
          flowVel[m * 3 + 2] = wB[2];
          m++;
        }
      }

      const inv = 1 / (FLOW_RADIUS * FLOW_RADIUS);
      const gain = S.flowGridGain;
      for (let gy = 0; gy < GRID_H; gy++) {
        const y = GRID_ORIGIN[1] + (gy / (GRID_H - 1)) * GRID_SCALE[1];
        for (let gx = 0; gx < GRID_W; gx++) {
          const x = GRID_ORIGIN[0] + (gx / (GRID_W - 1)) * GRID_SCALE[0];
          let wsum = 0, ax = 0, ay = 0, az = 0;
          for (let k = 0; k < m; k++) {
            const dx = x - flowPos[k * 2];
            const dy = y - flowPos[k * 2 + 1];
            const w = Math.exp(-(dx * dx + dy * dy) * inv);
            wsum += w;
            ax += flowVel[k * 3] * w;
            ay += flowVel[k * 3 + 1] * w;
            az += flowVel[k * 3 + 2] * w;
          }
          const g = (gy * GRID_W + gx) * 4;
          // The +1 lets the flow fade where the wave is far; dividing by the grid's scale is what makes M2 hand
          // the task back the wave's own velocity.
          const norm = gain / (wsum + 1);
          P.grid[g] = ax * norm / GRID_SCALE[0];
          P.grid[g + 1] = ay * norm / GRID_SCALE[1];
          P.grid[g + 2] = az * norm / GRID_SCALE[2];
          P.grid[g + 3] = 0;
        }
      }
    }

    // --- Modelled: the parameter block and the input response -----------------------------------------------------
    function clampAbs(v, max) { return Math.max(-max, Math.min(max, v)); }

    function buildParams(S, ev) {
      const windGain = S.windScale + 10 * S.windScale10;
      const iconGain = S.iconWindGain * S.iconWind;
      P.force[0] = S.windDirX * windGain + iconGain * S.iconWindSclX * ev.iconVelX;
      P.force[1] = S.windDirY * windGain + S.gravity + iconGain * S.iconWindSclY * ev.iconVelY;
      P.force[2] = S.windDirZ * windGain;
      P.force[3] = 0;
      P.drag[0] = P.drag[1] = P.drag[2] = S.friction;
      P.drag[3] = 0;
      P.dt[0] = P.dt[1] = P.dt[2] = S.deltaTime;
      P.dt[3] = 1;
      P.spinRate = S.spinTimeScale;
      P.flowStrength = S.flowStrength;

      for (let a = 0; a < 3; a++) {
        model.rotDpad[a] *= S.rotationDecay;
        model.rotShake[a] *= S.rotationDecay;
      }
      model.shake *= S.shakeDecay;

      // Icon steps act as D-pad presses. A savestate taken while navigating the XMB shows the field turned about y
      // by 1.84e-5, a sixth of `dpad rot max`, and the noise raised to `brownian`, both of them on their way down.
      if (ev.stepsX || ev.stepsY) {
        model.rotDpad[1] = clampAbs(model.rotDpad[1] - ev.stepsX * S.dpadScaleX * S.dpadRotMax, S.dpadRotMax);
        model.rotDpad[0] = clampAbs(model.rotDpad[0] - ev.stepsY * S.dpadScaleY * S.dpadRotMax, S.dpadRotMax);
        model.shake = Math.max(model.shake, S.uiBrownian);
      }

      // Shake detection on the accelerometer. A savestate taken while the controller was shaken shows the noise at
      // 6.63 times `brownian scale` and next to no turn, so shaking is mostly noise: it stirs the field about the
      // same y axis the D-pad uses, in the direction of the swing that started it, since kicks that followed each
      // swing would cancel out.
      const level = Math.hypot(S.dshakeXCoeff * ev.accelX, S.dshakeGCoeff * ev.accelY);
      if (level > S.dshakeThresh && S.dshakeThresh > 0) {
        const excess = (level - S.dshakeThresh) / S.dshakeThresh;
        if (model.shake < 0.05) model.stirSign = ev.accelX < 0 ? 1 : -1;
        const kick = S.dshakeRotImp * S.dshakeRotMax * excess;
        model.rotShake[1] = clampAbs(model.rotShake[1] + model.stirSign * kick, S.dshakeRotMax);
        model.shake = Math.min(1, model.shake + S.dshakeBrwImp * (1 + excess));
      }

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
      // The savestates put the noise at exactly `brownian scale` at rest and at 6.63 and 3.19 times that while the
      // controller was shaken and while the XMB was being navigated, which `rshake brw` alone accounts for.
      P.noiseScale = S.brownianScale * (1 + S.rshakeBrw * model.shake);
      stats.shake = model.shake;
      stats.fieldAngle = angle;
    }

    // --- Modelled: the emitter, writing new particles into free slots on the wave surface -------------------------
    function emitOne(S) {
      // A random point of the wave, skipping rows the spline layer clips. One outside the life box is lost, as
      // the task would kill it on its first update.
      let gx = 0, gz = 0, drawn = false;
      for (let tries = 0; tries < 4 && !drawn; tries++) {
        gx = (rng() * 2 - 1) * EMIT_EXTENT;
        gz = rng() * 2 - 1;
        waveToWorld(wave.data, wave.t, gx, gz, wA);
        drawn = Math.abs(wA[3]) <= 1;
      }
      if (!drawn || !insideBounds(wA)) return;

      waveVelocity(gx, gz, wA, S, wB);
      let vx = wB[0] * S.emitVelMul;
      let vy = wB[1] * S.emitVelMul;
      let vz = wB[2] * S.emitVelMul;

      // Surface normal, pointing up, flipped for a share of the particles.
      waveToWorld(wave.data, wave.t, gx + NORMAL_STEP, gz, wC);
      waveToWorld(wave.data, wave.t, gx, gz + NORMAL_STEP, wD);
      const ex = wC[0] - wA[0], ey = wC[1] - wA[1], ez = wC[2] - wA[2];
      const fx = wD[0] - wA[0], fy = wD[1] - wA[1], fz = wD[2] - wA[2];
      let nx = ey * fz - ez * fy;
      let ny = ez * fx - ex * fz;
      let nz = ex * fy - ey * fx;
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9) { nx = 0; ny = 1; nz = 0; nl = 1; }
      let sign = ny < 0 ? -1 / nl : 1 / nl;
      if (rng() < S.emitNegProb) sign = -sign;
      nx *= sign; ny *= sign; nz *= sign;

      // Random direction in the emission cone around the normal.
      const cosMax = Math.cos((S.emitConeAngle * Math.PI) / 180);
      const cosT = 1 - rng() * (1 - cosMax);
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const phi = 2 * Math.PI * rng();
      let tx = Math.abs(nx) < 0.9 ? 0 : -nz;
      let ty = Math.abs(nx) < 0.9 ? -nz : 0;
      let tz = Math.abs(nx) < 0.9 ? ny : nx;
      const tl = 1 / Math.hypot(tx, ty, tz);
      tx *= tl; ty *= tl; tz *= tl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      const cp = Math.cos(phi) * sinT, sp = Math.sin(phi) * sinT;
      const speed = S.emitVelMin + S.emitVelVar * rng();
      vx += (tx * cp + bx * sp + nx * cosT) * speed;
      vy += (ty * cp + by * sp + ny * cosT) * speed;
      vz += (tz * cp + bz * sp + nz * cosT) * speed * S.emitVelZscale;

      // Random orientation (Shoemake).
      const u1 = rng(), u2 = rng() * 2 * Math.PI, u3 = rng() * 2 * Math.PI;
      const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);

      const slot = freeList[--freeCount];
      const o = slot * STRIDE;
      pool[o] = wA[0]; pool[o + 1] = wA[1]; pool[o + 2] = wA[2]; pool[o + 3] = 0;
      pool[o + 4] = vx; pool[o + 5] = vy; pool[o + 6] = vz;
      // Verified from the pool in the savestate: the rates there run from `aging speed` x (1 - `aging variance`)
      // to x (1 + `aging variance`), so the draw is symmetric.
      pool[o + 7] = S.agingSpeed * (1 + S.agingVariance * (rng() * 2 - 1));
      pool[o + 8] = a * Math.sin(u2); pool[o + 9] = a * Math.cos(u2);
      pool[o + 10] = b * Math.sin(u3); pool[o + 11] = b * Math.cos(u3);
      stats.emitted++;
    }

    function emit(S) {
      model.emitCarry += S.emitPerFrame;
      const attempts = Math.floor(model.emitCarry);
      model.emitCarry -= attempts;
      for (let i = 0; i < attempts && freeCount > 0; i++) {
        if (rng() < S.emitProb) emitOne(S);
      }
    }

    function step(S, ev) {
      buildParams(S, ev);
      emit(S);
      runTask();
      stats.steps++;
    }

    function gatherInput(input, dtSec) {
      if (!input) return;
      const ev = input.poll(dtSec);
      pending.stepsX += ev.stepsX;
      pending.stepsY += ev.stepsY;
      pending.iconVelX = ev.iconVelX;
      pending.iconVelY = ev.iconVelY;
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

      buildFlowGrid(S);
      gatherInput(input, dtSec);

      if (!warm) {
        warm = true;
        for (let i = 0; i < PREWARM_STEPS; i++) step(S, noInput);
      }

      // Presses and shakes go to the first step; the icon wind holds for all of them.
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
