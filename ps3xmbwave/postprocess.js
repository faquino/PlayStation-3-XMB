'use strict';
// The passes the console runs between the wave and the particles: the wave's light, decoded, laid over the backdrop
// under BACKGROUND.mnu's colours, exposed and tone-mapped into the screen (LinesController), and HDR.mnu's glare drawn
// out of it and added back (GlareSourcePre, the Gaussian chain, AccGlare, ToneApplyDisplay). Used by `spline.js`,
// which draws the backdrop and the wave into its targets; `particles.js` then draws over the screen it leaves.

(function () {
  // The glare's textures, as the console sizes them: the screen squeezed to 128 x 540, then 128 x 64 and five halvings.
  const GLARE_W = 128;
  const GLARE_H = 64;
  const PRE_H = 540;
  const LEVELS = 6;
  // The backdrop's own buffer, which the composite stretches over the screen.
  const BACK_W = 64;
  const BACK_H = 32;
  // preexpose_Noise: 32 x 32 texels of white noise, 0 to 7 in all three channels, drawn afresh at each boot.
  const NOISE_SIZE = 32;

  // HDR.mnu's and BACKGROUND.mnu's settings as the passes' uniforms, worked out the way the console's are (each read
  // back out of every frame capture; see the wave notes' postprocess.md):
  // - the tone curve x (1 + x / W^2) / (1 + x), W being WHITE LEVEL, at EXPOSURE times the light;
  // - each channel's Gaussian, exp(-k^2 / 2 RAD^2) normalised over |k| <= floor(3 RAD - 1), at most 7 texels;
  // - the six levels' weights, GLARE LEVEL^2 SUM POW^l / (1 + SUM POW + ... + SUM POW^5), l = 0 the finest;
  // - _GlareWeight, 1 in every set;
  // - BACKGROUND.mnu's four colours times the renderer's fade, `fade`, as each frame sets them (0x4fec8 to 0x50000).
  function uniforms(settings, fade) {
    const f = fade === undefined ? 1 : fade;
    const white = settings.whiteLevel;
    const gauss = [];
    ['gaussianRadR', 'gaussianRadG', 'gaussianRadB'].forEach(function (name, channel) {
      const sigma = settings[name];
      const reach = sigma > 0 ? Math.max(0, Math.min(7, Math.floor(3 * sigma - 1))) : 0;
      const w = [];
      let total = 0;
      for (let k = 0; k < 8; k++) {
        w[k] = k <= reach && sigma > 0 ? Math.exp(-(k * k) / (2 * sigma * sigma)) : k === 0 ? 1 : 0;
        total += k === 0 ? w[k] : 2 * w[k];
      }
      for (let k = 0; k < 8; k++) gauss[3 * k + channel] = w[k] / total;
    });
    const pow = settings.glareSumPow;
    let sum = 0;
    for (let l = 0; l < LEVELS; l++) sum += Math.pow(pow, l);
    const finest = (settings.glareLevel * settings.glareLevel) / sum;
    const levels = [];
    for (let l = 0; l < LEVELS; l++) levels[l] = finest * Math.pow(pow, l);
    return {
      exposure: settings.exposure,
      whiteSqrRcp: white !== 0 ? 1 / (white * white) : 0,
      threshold: settings.glareThresh,
      gauss,
      levels,
      glareWeight: 1,
      colours: [1, 2, 3, 4].map(function (i) {
        return ['Red', 'Green', 'Blue'].map(function (c) { return settings['colour' + i + c] * f; });
      }),
    };
  }

  function noiseTexels() {
    const out = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
    for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
      const n = Math.floor(Math.random() * 8);
      out[4 * i] = out[4 * i + 1] = out[4 * i + 2] = n;
    }
    return out;
  }

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

  const FULLSCREEN_VS = `#version 300 es
    in vec2 aPos;
    out vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  function program(gl, fsSrc, uniformNames) {
    const prog = gl.createProgram();
    const vs = compile(gl, FULLSCREEN_VS, gl.VERTEX_SHADER);
    const fs = compile(gl, fsSrc, gl.FRAGMENT_SHADER);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog) || 'program link failed';
      gl.deleteProgram(prog);
      throw new Error(info);
    }
    const u = {};
    uniformNames.forEach(function (name) { u[name] = gl.getUniformLocation(prog, name); });
    return { prog, u };
  }

  // LinesController.fpo, re-authored. The backdrop, times the vertical gradient from BACKGROUND.mnu's colour 2 at the
  // bottom to colour 1 at the top, plus the wave's light, read back out of _Encode's two channels a quarter of a pixel
  // up and right (_ScreenOffset) and times the horizontal gradient from colour 3 at the left to colour 4 at the right
  // (LinesController.vpo). Then the preexpose tables: each holds the tone curve at EXPOSURE times 16 i / 127 for its
  // texel i, and is read at 8 times the light, so half a texel short of it - which takes 1/16 off the light before it
  // is exposed, and is why faint light only shows where the backdrop already has some (verified against RPCS3's
  // screenshots). Red, green and blue each go through the curve; alpha, the glare's mask, is (y - GLARE THRESH) y /
  // (8 min(y, 1)) of the brightest one. Noise of up to 7/8 of a step dithers the screen it all lands on, 8 bits.
  const COMPOSITE_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uBack;
    uniform sampler2D uWave;
    uniform sampler2D uNoise;
    uniform vec2 uScreen;
    uniform vec3 uColour1;
    uniform vec3 uColour2;
    uniform vec3 uColour3;
    uniform vec3 uColour4;
    uniform float uExposure;
    uniform float uWhiteSqrRcp;
    uniform float uThreshold;
    out vec4 oColor;
    vec3 tone(vec3 x) { return x * (1.0 + x * uWhiteSqrRcp) / (1.0 + x); }
    void main() {
      vec2 uv = gl_FragCoord.xy / uScreen;
      vec3 back = texture(uBack, uv).rgb * mix(uColour2, uColour1, uv.y);
      vec2 code = texture(uWave, (gl_FragCoord.xy + 0.25) / uScreen).rg;
      float light = code.r * 0.03125 + code.g * 0.5;
      vec3 lit = back + light * mix(uColour3, uColour4, uv.x);
      vec3 texel = clamp(lit * 8.0 - 0.5, 0.0, 127.0);
      vec3 y = tone(uExposure * (16.0 / 127.0) * texel);
      float top = tone(vec3(uExposure * (16.0 / 127.0) * max(texel.r, max(texel.g, texel.b)))).r;
      float mask = top > 0.0 ? (top - uThreshold) * top / (8.0 * min(top, 1.0)) : 0.0;
      vec3 noise = texture(uNoise, gl_FragCoord.xy / 32.0).rgb;
      oColor = vec4(y + noise * 0.125, mask);
    }`;

  // GlareSourcePre.fpo: the screen, read between texels into 128 x 540, times its mask, times 8. Its alpha, the
  // light's luminance, feeds a copy the CPU reads back, and nothing on screen.
  const SOURCE_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc;
    in vec2 vUv;
    out vec4 oColor;
    void main() {
      vec4 s = texture(uSrc, vUv);
      oColor = vec4(s.rgb * s.a * 8.0, 0.0);
    }`;

  // Copy.fpo: the 128 x 64 level out of 128 x 540, and each level out of the one before, read between four texels.
  const COPY_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc;
    in vec2 vUv;
    out vec4 oColor;
    void main() { oColor = texture(uSrc, vUv); }`;

  // Gaussian.fpo and Gaussian.vpo: the texel itself and up to seven on either side along one axis (_Offset, one texel
  // of the level), each channel with its own weights. The chain's textures are set to CLAMP, which RPCS3 runs as
  // clamp-to-edge (VKFormats.cpp's vk_wrap_mode), so a tap past the edge reads the edge's texel - its screenshots under
  // the music, bright up to the top right corner, show it; the RSX's own CLAMP would blend the edge with the border.
  const GAUSSIAN_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc;
    uniform vec2 uStep;
    uniform vec3 uWeights[8];
    in vec2 vUv;
    out vec4 oColor;
    void main() {
      vec3 sum = texture(uSrc, vUv).rgb * uWeights[0];
      for (int k = 1; k < 8; k++) {
        vec2 d = uStep * float(k);
        sum += (texture(uSrc, vUv + d).rgb + texture(uSrc, vUv - d).rgb) * uWeights[k];
      }
      oColor = vec4(sum, 0.0);
    }`;

  // AccGlare.fpo: the six blurred levels, each times its weight, added up at 128 x 64 (the console adds them one draw
  // at a time, coarsest first, over a cleared target).
  const ACCUMULATE_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uLevel[6];
    uniform float uWeight[6];
    in vec2 vUv;
    out vec4 oColor;
    void main() {
      vec3 sum = vec3(0.0);
      sum += texture(uLevel[0], vUv).rgb * uWeight[0];
      sum += texture(uLevel[1], vUv).rgb * uWeight[1];
      sum += texture(uLevel[2], vUv).rgb * uWeight[2];
      sum += texture(uLevel[3], vUv).rgb * uWeight[3];
      sum += texture(uLevel[4], vUv).rgb * uWeight[4];
      sum += texture(uLevel[5], vUv).rgb * uWeight[5];
      oColor = vec4(sum, 0.0);
    }`;

  // ToneApplyDisplay.fpo: the glare, stretched over the screen, times _GlareWeight, less the noise again, added to the
  // screen (ONE, ONE, after the program's output is clamped).
  const DISPLAY_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uScreenTex;
    uniform sampler2D uGlare;
    uniform sampler2D uNoise;
    uniform vec2 uScreen;
    uniform float uGlareWeight;
    uniform float uGlareOn;
    out vec4 oColor;
    void main() {
      vec3 screen = texelFetch(uScreenTex, ivec2(gl_FragCoord.xy), 0).rgb;
      vec3 glare = texture(uGlare, gl_FragCoord.xy / uScreen).rgb * uGlareWeight;
      vec3 noise = texture(uNoise, gl_FragCoord.xy / 32.0).rgb;
      oColor = vec4(screen + uGlareOn * clamp(glare - noise * 0.125, 0.0, 1.0), 1.0);
    }`;

  function createPostProcess(gl) {
    // The glare's chain needs float targets, as the console's are; without them the screen goes out without it.
    const floats = !!gl.getExtension('EXT_color_buffer_float');
    if (!floats) console.warn('postprocess: no EXT_color_buffer_float, the glare is left out');

    const quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    function texture(width, height, internal, format, type, filter, wrap, data) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data || null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return tex;
    }

    function target(width, height, float) {
      const tex = float
        ? texture(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, gl.CLAMP_TO_EDGE)
        : texture(width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, width, height, float: !!float };
    }

    function release(t) {
      if (!t) return;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }

    const noiseTex = texture(NOISE_SIZE, NOISE_SIZE, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, gl.REPEAT,
      noiseTexels());

    const back = target(BACK_W, BACK_H, floats);
    const glare = floats ? {
      pre: target(GLARE_W, PRE_H, true),
      pyramid: [],
      across: [],
      down: [],
      acc: target(GLARE_W, GLARE_H, true),
    } : null;
    if (glare) {
      for (let l = 0; l < LEVELS; l++) {
        const w = GLARE_W >> l;
        const h = GLARE_H >> l;
        glare.pyramid.push(target(w, h, true));
        glare.across.push(target(w, h, true));
        glare.down.push(target(w, h, true));
      }
    }
    let wave = null;
    let screen = null;

    const composite = program(gl, COMPOSITE_FS, ['uBack', 'uWave', 'uNoise', 'uScreen', 'uColour1', 'uColour2',
      'uColour3', 'uColour4', 'uExposure', 'uWhiteSqrRcp', 'uThreshold']);
    const source = program(gl, SOURCE_FS, ['uSrc']);
    const copy = program(gl, COPY_FS, ['uSrc']);
    const gaussian = program(gl, GAUSSIAN_FS, ['uSrc', 'uStep', 'uWeights']);
    const accumulate = program(gl, ACCUMULATE_FS, ['uLevel', 'uWeight']);
    const display = program(gl, DISPLAY_FS, ['uScreenTex', 'uGlare', 'uNoise', 'uScreen', 'uGlareWeight',
      'uGlareOn']);

    // The screen-sized targets: the wave's encoded light and the screen the composite writes, 8 bits a channel as on
    // the console.
    function resize(width, height) {
      if (wave && wave.width === width && wave.height === height) return;
      release(wave);
      release(screen);
      wave = target(width, height, false);
      screen = target(width, height, false);
    }

    function bind(t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
      gl.viewport(0, 0, t.width, t.height);
    }

    function draw(pass, t, textures) {
      bind(t);
      gl.useProgram(pass.prog);
      textures.forEach(function (tex, unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Draws the backdrop, with `fn`, into its 64 x 32 buffer, which `fn` is handed: its texture, its framebuffer, its
    // size and whether it holds half floats.
    function drawBackdrop(fn) {
      bind(back);
      gl.disable(gl.BLEND);
      fn(back);
    }

    // Draws the wave, with `fn`, into its own buffer: cleared, its light added (ONE, ONE), red and green only - the
    // two channels of _Encode `spline.js` writes it in, which saturate at 8 bits as the console's do.
    function drawWave(width, height, fn) {
      resize(width, height);
      bind(wave);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.colorMask(true, true, false, false);
      fn();
      gl.colorMask(true, true, true, true);
    }

    // Runs the passes and leaves the result in the canvas, at `width` x `height`, for the particles to draw over, with
    // the colours dimmed by the renderer's fade, `fade`.
    function present(settings, width, height, fade) {
      resize(width, height);
      const u = uniforms(settings, fade);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(quad);

      gl.useProgram(composite.prog);
      gl.uniform1i(composite.u.uBack, 0);
      gl.uniform1i(composite.u.uWave, 1);
      gl.uniform1i(composite.u.uNoise, 2);
      gl.uniform2f(composite.u.uScreen, width, height);
      ['uColour1', 'uColour2', 'uColour3', 'uColour4'].forEach(function (name, i) {
        gl.uniform3fv(composite.u[name], u.colours[i]);
      });
      gl.uniform1f(composite.u.uExposure, u.exposure);
      gl.uniform1f(composite.u.uWhiteSqrRcp, u.whiteSqrRcp);
      gl.uniform1f(composite.u.uThreshold, u.threshold);
      draw(composite, screen, [back.tex, wave.tex, noiseTex]);

      if (glare) {
        gl.useProgram(source.prog);
        gl.uniform1i(source.u.uSrc, 0);
        draw(source, glare.pre, [screen.tex]);
        gl.useProgram(copy.prog);
        gl.uniform1i(copy.u.uSrc, 0);
        draw(copy, glare.pyramid[0], [glare.pre.tex]);
        for (let l = 1; l < LEVELS; l++) draw(copy, glare.pyramid[l], [glare.pyramid[l - 1].tex]);

        gl.useProgram(gaussian.prog);
        gl.uniform1i(gaussian.u.uSrc, 0);
        gl.uniform3fv(gaussian.u.uWeights, u.gauss);
        for (let l = 0; l < LEVELS; l++) {
          const t = glare.pyramid[l];
          gl.uniform2f(gaussian.u.uStep, 1 / t.width, 0);
          draw(gaussian, glare.across[l], [t.tex]);
          gl.uniform2f(gaussian.u.uStep, 0, 1 / t.height);
          draw(gaussian, glare.down[l], [glare.across[l].tex]);
        }

        gl.useProgram(accumulate.prog);
        gl.uniform1iv(accumulate.u.uLevel, [0, 1, 2, 3, 4, 5]);
        gl.uniform1fv(accumulate.u.uWeight, u.levels);
        draw(accumulate, glare.acc, glare.down.map(function (t) { return t.tex; }));
      }

      gl.useProgram(display.prog);
      gl.uniform1i(display.u.uScreenTex, 0);
      gl.uniform1i(display.u.uGlare, 1);
      gl.uniform1i(display.u.uNoise, 2);
      gl.uniform2f(display.u.uScreen, width, height);
      gl.uniform1f(display.u.uGlareWeight, u.glareWeight);
      gl.uniform1f(display.u.uGlareOn, glare ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(display.prog);
      [screen.tex, glare ? glare.acc.tex : noiseTex, noiseTex].forEach(function (tex, unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
    }

    return { drawBackdrop, drawWave, present, glare: !!glare };
  }

  window.PS3PostProcess = { create: createPostProcess, uniforms };
})();
