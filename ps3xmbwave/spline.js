'use strict';
// Spline layer renderer: draws the backdrop (`backdrop.js`), at the moment the scene hands it, and the wave
// `wave-reverse.js` builds each frame, into the targets of `postprocess.js`, which lays them out on the screen. Consumes
// `SPLINE_SETTINGS` + `PS3WaveReverse` + `PS3Backdrop` + `PS3PostProcess`; `index.html` hands its `surface` to
// `particles.js`.

(function () {
  function compile(gl, src, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) || 'shader compile failed';
      gl.deleteShader(shader);
      throw new Error(info);
    }
    return shader;
  }

  function link(gl, vsSrc, fsSrc) {
    const program = gl.createProgram();
    const vs = compile(gl, vsSrc, gl.VERTEX_SHADER);
    const fs = compile(gl, fsSrc, gl.FRAGMENT_SHADER);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) || 'program link failed';
      gl.deleteProgram(program);
      throw new Error(info);
    }
    return program;
  }

  function uloc(gl, program, name) { return gl.getUniformLocation(program, name); }

  function aloc(gl, program, name) {
    const loc = gl.getAttribLocation(program, name);
    if (loc < 0) throw new Error('Missing attribute: ' + name);
    return loc;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // The wave's two textures, generated here: the firmware's are left out of the repository.
  // _Stripes, 16 x 4, one stripe's profile across its period, sharper row by row up the cell's size on screen (the
  // console makes it at run time; these are fitted to it): the first row flat at a half, the others
  // peak x (1 - ((x - 0.5) / reach)^2)^power. Only the column at x = 0 is read while THINNESS is 1.
  const STRIPE_ROWS = [null, [0.672, 0.48, 0.8], [0.87, 0.36, 3], [0.933, 0.23, 3]];
  function stripeTexels() {
    const out = new Uint8Array(16 * 4);
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 16; i++) {
        let value = 0.498;
        if (STRIPE_ROWS[row]) {
          const [peak, reach, power] = STRIPE_ROWS[row];
          const d = Math.abs((i + 0.5) / 16 - 0.5) / reach;
          value = d < 1 ? peak * Math.pow(1 - d * d, power) : 0;
        }
        out[16 * row + i] = Math.round(255 * value);
      }
    }
    return out;
  }
  // _FresLUT, 512 x 1: textures/TGA/freslut1.tga, whose red the program reads as the rim light's weight against
  // |e . n| m, and whose green, the even light's weight, is 1 throughout. Red rises from texel 14 to its peak at 29
  // and falls away by 120: a Catmull-Rom curve through these points, fitted to it to 1.6%.
  const FRESNEL_KNOTS = [
    [0, 0], [14, 0], [17, 0.031], [19, 0.133], [21, 0.349], [22, 0.486], [24, 0.753], [26, 0.922], [29, 0.988],
    [32, 0.953], [34, 0.89], [36, 0.796], [38, 0.698], [43, 0.482], [48, 0.329], [58, 0.153], [77, 0.035], [120, 0],
    [511, 0],
  ];
  function fresnelTexels() {
    const out = new Uint8Array(512 * 2);
    const k = FRESNEL_KNOTS;
    for (let i = 0; i < 512; i++) {
      let j = 0;
      while (j < k.length - 2 && i > k[j + 1][0]) j++;
      const t = (i - k[j][0]) / (k[j + 1][0] - k[j][0]);
      const p0 = k[Math.max(j - 1, 0)][1], p1 = k[j][1], p2 = k[j + 1][1], p3 = k[Math.min(j + 2, k.length - 1)][1];
      const v = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
      out[2 * i] = Math.round(255 * clamp01(v));
      out[2 * i + 1] = 255;
    }
    return out;
  }

  function createTexture(gl, format, width, height, data, wrapS) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const internal = format === gl.RED ? gl.R8 : gl.RG8;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  window.createSplineLayer = function createSplineLayer(gl, canvas) {
    const settings = window.SPLINE_SETTINGS;
    if (!settings) throw new Error('Missing SPLINE_SETTINGS');
    if (!window.PS3WaveReverse) throw new Error('Missing PS3WaveReverse');

    // lines1.vpo and lines1.fpo, re-authored from RPCS3's decompilation. The vertex program takes the position as it
    // comes, already in clip space, and works out m, the cell's size on screen; the fragment program reads the
    // stripes and the fresnel table with it, and writes the light as _Encode holds it - 4096 texels over the light
    // from 0 to 1, read from the nearest: red the fine part, 2 (n mod 32), green the coarse one, 4 floor(n / 32) - 1
    // up to 255, a light of 0.5. The console's table runs 2n - 1 in its first 32 texels, as here, and strays from
    // 2 (n mod 32) by one here and there, a 1/8160 of light, which is left out. The composite reads it back.
    const waveProg = link(
      gl,
      `#version 300 es
       precision highp float;
       in vec4 aPos;
       in vec4 aNormal;
       in vec2 aUv;
       uniform float uMipmapBias;
       uniform float uBrightness;
       uniform float uFresnel;
       out vec2 vCoord;
       out vec4 vParams;
       void main() {
         float invLen = inversesqrt(max(dot(aPos.xyz, aPos.xyz), 1e-10));
         vec3 e = aPos.xyz * invLen;
         vec3 n = aNormal.xyz * inversesqrt(max(dot(aNormal.xyz, aNormal.xyz), 1e-10));
         float m = abs(dot(e, aNormal.xyz)) * invLen * uMipmapBias;
         vCoord = vec2(aUv.x, m);
         vParams = vec4(uFresnel * m, uBrightness * m, abs(dot(e, n)) * m, aUv.y);
         gl_Position = aPos;
       }`,
      `#version 300 es
       precision highp float;
       in vec2 vCoord;
       in vec4 vParams;
       uniform sampler2D uStripes;
       uniform sampler2D uFresLut;
       uniform float uSpacing;
       uniform float uThinness;
       out vec4 oColor;
       void main() {
         // Across a stripe's period, past its dark part. At THINNESS 1 the console divides 0 by 0; this reads x = 0.
         float span = 1.0 - uThinness;
         float x = span > 0.0 ? clamp(fract(vCoord.x * uSpacing) - uThinness, 0.0, 1.0) / span : 0.0;
         float stripe = texture(uStripes, vec2(x, vCoord.y)).r;
         vec2 fres = texture(uFresLut, vParams.zw).rg;
         float light = (fres.x * vParams.x + fres.y * vParams.y * stripe) * vParams.w;
         float n = clamp(floor(light * 4096.0), 0.0, 4095.0);
         float block = floor(n / 32.0);
         float step = n - block * 32.0;
         float fine = block == 0.0 ? max(0.0, 2.0 * step - 1.0) : 2.0 * step;
         float coarse = block == 0.0 ? 0.0 : min(255.0, 4.0 * block - 1.0);
         oColor = vec4(fine / 255.0, coarse / 255.0, 0.0, 0.0);
       }`
    );

    const wave = window.PS3WaveReverse.createWave();
    const record = window.PS3WaveReverse.RECORD * 4;

    const waveVAO = gl.createVertexArray();
    gl.bindVertexArray(waveVAO);
    const meshBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, wave.mesh.byteLength, gl.DYNAMIC_DRAW);
    const posLoc = aloc(gl, waveProg, 'aPos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 4, gl.FLOAT, false, record, 0);
    const normalLoc = aloc(gl, waveProg, 'aNormal');
    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 4, gl.FLOAT, false, record, 16);
    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, wave.texcoords, gl.STATIC_DRAW);
    const uvLoc = aloc(gl, waveProg, 'aUv');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
    const indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wave.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const stripesTex = createTexture(gl, gl.RED, 16, 4, stripeTexels(), gl.REPEAT);
    const fresLutTex = createTexture(gl, gl.RG, 512, 1, fresnelTexels(), gl.CLAMP_TO_EDGE);

    const waveU = {
      mipmapBias: uloc(gl, waveProg, 'uMipmapBias'),
      brightness: uloc(gl, waveProg, 'uBrightness'),
      fresnel: uloc(gl, waveProg, 'uFresnel'),
      stripes: uloc(gl, waveProg, 'uStripes'),
      fresLut: uloc(gl, waveProg, 'uFresLut'),
      spacing: uloc(gl, waveProg, 'uSpacing'),
      thinness: uloc(gl, waveProg, 'uThinness'),
    };
    const backdrop = window.PS3Backdrop.create(gl);
    const post = window.PS3PostProcess.create(gl);

    const surface = { settings, wave, mesh: wave.mesh, aspect: 16 / 9 };
    let lastTime = null;
    let lastSequence = 'none';

    // `moment` is the moment the scene last handed the backdrop (`xmbBackdropMoment`), and `sequence` the boot sequence
    // playing: the XMB's start resets the lines, as the cold boot's handlers do (0x1b05c).
    function render(timeSec, moment, sequence) {
      const dtSec = lastTime === null ? 0 : Math.max(0, timeSec - lastTime);
      lastTime = timeSec;
      if (sequence !== undefined && sequence !== lastSequence) {
        lastSequence = sequence;
        if (sequence === 'coldboot') wave.reset();
      }
      surface.aspect = canvas.width / Math.max(1, canvas.height);
      wave.update(settings, dtSec, surface.aspect);
      window.__PS3_WAVE_STATE = wave.state;

      // A hidden page can report an empty canvas, which has nothing to draw into.
      if (!canvas.width || !canvas.height) return;
      gl.disable(gl.DEPTH_TEST);

      // The backdrop, into its own 64 x 32 buffer.
      post.drawBackdrop(function (target) { backdrop.draw(settings, moment, dtSec, target); });

      // The wave adds its light into its own buffer, with no depth test (ONE, ONE).
      post.drawWave(canvas.width, canvas.height, function () {
        gl.useProgram(waveProg);
        gl.bindVertexArray(waveVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, wave.mesh);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stripesTex);
        gl.uniform1i(waveU.stripes, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, fresLutTex);
        gl.uniform1i(waveU.fresLut, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1f(waveU.mipmapBias, settings.mipmapBias);
        gl.uniform1f(waveU.brightness, settings.brightness);
        gl.uniform1f(waveU.fresnel, settings.fresnel);
        gl.uniform1f(waveU.spacing, settings.spacing);
        gl.uniform1f(waveU.thinness, settings.thinness);
        gl.drawElements(gl.TRIANGLE_STRIP, wave.indices.length, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
      });

      // The composite, the tone curve and the glare, into the canvas.
      post.present(settings, canvas.width, canvas.height);
    }

    // The mesh is rewritten in place every frame, so the surface always holds what was drawn.
    return { render, surface };
  };
})();
