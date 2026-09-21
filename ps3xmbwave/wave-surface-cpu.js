'use strict';
// CPU twin of the wave vertex shader in `spline.js`: evaluates the displaced wave at a grid point from the same
// settings and displacement texture. `particles-reverse.js` uses it to emit on the visible wave — keep it in sync.

(function () {
  // GL LINEAR filtering with CLAMP_TO_EDGE on a single-channel texture whose row 0 is at v = 0.
  function sampleLinear(data, w, h, u, v) {
    const x = Math.min(Math.max(u * w - 0.5, 0), w - 1);
    const y = Math.min(Math.max(v * h - 0.5, 0), h - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const fx = x - x0;
    const fy = y - y0;
    const a = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
    const b = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
    return a * (1 - fy) + b * fy;
  }

  function fract(v) { return v - Math.floor(v); }

  // Writes into `out` what the vertex shader computes for grid point (gx, gz) in [-1, 1]^2 at time t:
  // out[0], out[1] are clip-space x, y (the shader writes w = 1), out[2] is the ribbon's depth coordinate.
  function evaluate(s, data, w, h, gx, gz, t, out) {
    const u = (gx + 1) * 0.5;
    const v = (gz + 1) * 0.5;
    const px = gx;
    let py = sampleLinear(data, w, h, u, v);
    let pz = gz;
    const ffd1x = px * s.ffdScale1X + s.ffdOffsetX;
    const ffd2z = pz * s.ffdScale2Z + s.ffdOffsetZ;
    py += Math.sin(ffd1x + t * s.flowSpeed) * s.ffdYAmp;
    pz += Math.cos(ffd2z + t * s.flowSpeed) * s.ffdZAmp;
    let baseWave = Math.cos(px * 2 - t * 0.5 * s.timeStep) * s.waveCosAmp + s.waveBias;
    baseWave *= 1 - s.damping;
    baseWave += s.tension * Math.sin(px * s.length + t * s.flowSpeed * s.timeStep * 0.25);
    const structured = s.perturbation * s.perturbationScale * (
      Math.sin((px * s.length * 6 + pz * 0.5) * s.spacing * 0.01 + t * s.flowSpeed * s.timeStep * 0.7) * 0.5 +
      Math.sin((px * s.length * 10 - pz * 0.8) * s.spacing * 0.005 - t * s.flowSpeed * s.timeStep * 0.35) * 0.25
    );
    let total = (baseWave + structured) * s.waveHeightScale;
    total = s.waveSoftClip * Math.tanh(total / Math.max(s.waveSoftClip, 1e-4));
    py -= total;
    const u2 = fract(u - t * s.flowSpeed * 0.04 * s.timeStep);
    pz -= sampleLinear(data, w, h, u2, v) * s.zDetailScale;
    out[0] = px;
    out[1] = py;
    out[2] = pz;
    return out;
  }

  window.WaveSurfaceCPU = { evaluate };
})();
