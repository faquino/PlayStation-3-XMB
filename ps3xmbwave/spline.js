'use strict';
// Spline layer renderer: draws the backdrop (`backdrop.js`), at the moment the scene hands it, and the wave
// `wave-reverse.js` builds each frame, into the targets of `postprocess.js`, which lays them out on the screen under the
// scene's fade. Consumes `SPLINE_SETTINGS` + `PS3WaveReverse` + `PS3Backdrop` + `PS3PostProcess`; `index.html` hands its
// `surface` to `particles.js`.

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

  // The wave's three textures, generated here: _Stripes and _Encode as the scene's lines renderer makes them at
  // start-up, both in the PPU's single precision and every capture's to the byte; _FresLUT from a fit, its file being
  // the firmware's and left out of the repository.
  // _Stripes, 16 x 4 (powf(2, 4), 0xa0f58), one stripe's profile across its period, row r for a step of the cell's
  // size on screen (0x4bad0): texel c of it is 255 min(1, (1.01 - 4 (c / 15 - 1/2)^2)^(20 (r / 3)^3) (1 + r / 3) / 2),
  // truncated, the power taken in double precision - the first row flat at 127, the others peaking at 170, 219 and 255,
  // each narrower than the last. Only the column at x = 0 is read while THINNESS is 1: 127, 5, 0, 0.
  const STRIPES_W = 16;
  function stripeTexels() {
    const f = Math.fround;
    const out = new Uint8Array(STRIPES_W * 4);
    for (let r = 0; r < 4; r++) {
      const r3 = f(r / 3);
      const power = f(f(f(r3 * 20) * r3) * r3);
      const scale = f(r3 * 0.5 + 0.5);
      for (let c = 0; c < STRIPES_W; c++) {
        const x = f(f(c / (STRIPES_W - 1)) - 0.5);
        const base = f(-4 * x * x + f(1.01));
        out[STRIPES_W * r + c] = Math.trunc(f(Math.min(1, f(Math.pow(base, power) * scale)) * 255));
      }
    }
    return out;
  }
  // _Encode, 4096 texels over the light from 0 to 1 (0x4b928): texel n splits v = 128 n / 4095 into its whole part w
  // and its fraction q, and holds a fine part, 255 q / 4, and a coarse one, 255 min(1, w / 64), both truncated - 2n - 1
  // and 0 in the first 32 texels, then near 2 (n mod 32) and 4 floor(n / 32) - 1, the coarse part at 255 from texel
  // 2048. Laid out here 64 x 64, red the fine part and green the coarse, as the program writes them.
  const ENCODE_SIDE = 64;
  function encodeTexels() {
    const f = Math.fround;
    const out = new Uint8Array(ENCODE_SIDE * ENCODE_SIDE * 2);
    for (let n = 0; n < ENCODE_SIDE * ENCODE_SIDE; n++) {
      const v = f(f(f(n / 4095) * 32) * 4);
      const w = Math.floor(v);
      out[2 * n] = Math.trunc(Math.min(255, f(f((v - w) * 0.25) * 255)));
      out[2 * n + 1] = Math.trunc(Math.min(255, f(f(w * 0.015625) * 255)));
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
    // stripes and the fresnel table with it, and writes the light as _Encode holds it, read from the nearest of its
    // 4096 texels over the light from 0 to 1 - its coarse part saturating at a light of 0.5. The composite reads it
    // back.
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
       uniform highp sampler2D uEncode;
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
         int n = int(clamp(floor(light * 4096.0), 0.0, 4095.0));
         oColor = vec4(texelFetch(uEncode, ivec2(n % 64, n / 64), 0).rg, 0.0, 0.0);
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

    const stripesTex = createTexture(gl, gl.RED, STRIPES_W, 4, stripeTexels(), gl.REPEAT);
    const fresLutTex = createTexture(gl, gl.RG, 512, 1, fresnelTexels(), gl.CLAMP_TO_EDGE);
    const encodeTex = createTexture(gl, gl.RG, ENCODE_SIDE, ENCODE_SIDE, encodeTexels(), gl.CLAMP_TO_EDGE);

    const waveU = {
      mipmapBias: uloc(gl, waveProg, 'uMipmapBias'),
      brightness: uloc(gl, waveProg, 'uBrightness'),
      fresnel: uloc(gl, waveProg, 'uFresnel'),
      stripes: uloc(gl, waveProg, 'uStripes'),
      fresLut: uloc(gl, waveProg, 'uFresLut'),
      encode: uloc(gl, waveProg, 'uEncode'),
      spacing: uloc(gl, waveProg, 'uSpacing'),
      thinness: uloc(gl, waveProg, 'uThinness'),
    };
    const backdrop = window.PS3Backdrop.create(gl);
    const post = window.PS3PostProcess.create(gl);

    const surface = { settings, wave, mesh: wave.mesh, aspect: 16 / 9 };
    let lastTime = null;
    let lastSequence = 'none';

    // The renderer's fade (0x4fe2c), which event 0 starts with the particles' (0x1afdc): three animations, one a
    // channel, from where each stands towards the grey sent, over its seconds, eased by a smoothstep (0x4fb8c, 0x5334c,
    // 0x453ac). Each frame moves them on by the frame's time before anything is drawn (0x56f1c), and BACKGROUND.mnu's
    // four colours reach the composite multiplied by them, so the backdrop and the wave's light fade as one. Every grey
    // sent is grey, so one level stands for the three. The console's animations start at black (0x4fb54) until the XMB
    // first sends event 0; the page's stand at the scene's brightness from its first frame, as if the XMB had been
    // running.
    const fade = { value: 1, from: 1, to: 1, time: 0, duration: 0, serial: null };
    function fadeFrame(sent, dtSec) {
      if (sent && sent.serial !== fade.serial) {
        fade.serial = sent.serial;
        fade.from = fade.value;
        fade.to = sent.target;
        fade.time = 0;
        fade.duration = sent.seconds;
      }
      fade.time += dtSec;
      if (fade.time >= fade.duration) fade.value = fade.to;
      else {
        const u = fade.time / fade.duration;
        fade.value = fade.from + (fade.to - fade.from) * u * u * (3 - 2 * u);
      }
    }

    // `moment` is the moment the scene last handed the backdrop (`xmbBackdropMoment`), `sequence` the boot sequence
    // playing - the XMB's start resets the lines, as the cold boot's handlers do (0x1b05c) - and `sent` the fade the
    // scene last sent (`xmbSceneFade`).
    function render(timeSec, moment, sequence, sent) {
      const dtSec = lastTime === null ? 0 : Math.max(0, timeSec - lastTime);
      lastTime = timeSec;
      if (sequence !== undefined && sequence !== lastSequence) {
        lastSequence = sequence;
        if (sequence === 'coldboot') wave.reset();
      }
      surface.aspect = canvas.width / Math.max(1, canvas.height);
      wave.update(settings, dtSec, surface.aspect);
      window.__PS3_WAVE_STATE = wave.state;
      fadeFrame(sent, dtSec);

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
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, encodeTex);
        gl.uniform1i(waveU.encode, 2);
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
      post.present(settings, canvas.width, canvas.height, fade.value);
    }

    // The mesh is rewritten in place every frame, so the surface always holds what was drawn.
    return { render, surface };
  };
})();
