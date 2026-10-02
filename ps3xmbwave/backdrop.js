'use strict';
// The backdrop's pass: back_colours0.fpo over the month textures' fits (`background-months.js`) or back_colours1.fpo,
// re-authored, eased in from a snapshot of the backdrop as the console's are, or one of the gradient presets. Used by
// `spline.js`, which draws it at the moment `scene-themes.js` hands it into the buffer `postprocess.js` lays under the wave.

(function () {
  // The ease a change of program takes (0x21a4c hands 0x4fdf0 two seconds).
  const SHADER_FADE = 2;
  // _DayTime under COLOUR SHADER 1: the time of day times a thousand over 24 (0x92e64).
  const MUSIC_CLOCK = 1000 / 24;

  // The scene's smoothstep (0x3e980, and 0x453ac for _Alpha).
  function smoothstep(edge0, edge1, x) {
    if (x < edge0) return 0;
    if (x > edge1) return 1;
    const u = (x - edge0) / (edge1 - edge0);
    return u * u * (3 - 2 * u);
  }

  // The months' lengths as the scene keeps them (0x91cb0): February has 28 days in every year.
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // The month's position, from 0 at the start of the 1st to 30 at its end, and the two months' indices: the day less
  // one over the month's length, as the scene works it out (0x10900) - February's 29th counts as its 28th.
  function monthOf(date) {
    const month = date.getMonth();
    const days = MONTH_DAYS[month];
    const day = Math.min(date.getDate(), days);
    return { thisMonth: month, nextMonth: (month + 1) % 12, monthTime: (30 * (day - 1)) / days };
  }

  // What the scene hands the backdrop's program at `date` (custom_render_plugin's 0x52ad8), from BACKGROUND.mnu's
  // settings, under COLOUR SHADER `shader`. t is the time of day, 0 to 1. _NightTime is 2400 times the time since noon;
  // _DayTime 2400 times a cubic of t through 0 and 1 whose slope at both ends is DAYSPREAD (0x52a28, a Hermite curve),
  // so it runs fast through the night and slowly about noon - or, under 1 (back_colours1, which reads nothing else),
  // t times a thousand over 24; _NightDayBlend is 1 less NIGHT BLEND times what is left of the day's two smoothsteps,
  // NIGHT2DAY's up and DAY2NIGHT's down (in hours); _NightBrightness is NIGHT WHIT BIAS.
  function uniforms(settings, date, shader) {
    const t = (date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600) / 24;
    const s = settings.dayspread;
    const hermite = -2 * t * t * t + 3 * t * t + s * (2 * t * t * t - 3 * t * t + t);
    const up = smoothstep(settings.night2dayBegin / 24, settings.night2dayEnd / 24, t);
    const down = smoothstep(settings.day2nightBegin / 24, settings.day2nightEnd / 24, t);
    const m = monthOf(date);
    return {
      dayTime: shader === 1 ? t * MUSIC_CLOCK : 2400 * hermite,
      nightTime: 2400 * ((t + 0.5) % 1),
      nightDayBlend: 1 - settings.nightBlend * (1 - up * (1 - down)),
      nightBrightness: settings.nightWhitBias,
      monthTime: m.monthTime,
      thisMonth: m.thisMonth,
      nextMonth: m.nextMonth,
    };
  }

  const VS = `#version 300 es
    in vec2 aPos;
    out vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  // back_colours0.fpo, re-authored from RPCS3's decompilation and checked against it to float precision. uv is the
  // buffer's, v from the bottom of the screen, which is also where the textures' first rows land.
  const CONSOLE_FS = `#version 300 es
    precision highp float;
    uniform vec3 uDay1[10];
    uniform vec3 uDay2[10];
    uniform vec3 uNight1[10];
    uniform vec3 uNight2[10];
    uniform float uDayTime;
    uniform float uNightTime;
    uniform float uMonthTime;
    uniform float uNightBrightness;
    uniform float uNightDayBlend;
    uniform float uAlpha;
    in vec2 vUv;
    out vec4 oColor;

    // A month's texture, from its cubic fit.
    vec3 month(vec3 k[10], vec2 st) {
      float u = st.x, v = st.y;
      vec3 c = k[0] + k[1] * u + k[2] * v + k[3] * u * v + k[4] * u * u + k[5] * v * v + k[6] * u * u * u
        + k[7] * v * v * v + k[8] * u * u * v + k[9] * u * v * v;
      return clamp(c, 0.0, 1.0);
    }

    // The textures are read through a quintic step across each of their 64 x 32 texels.
    vec2 smoothCoord(vec2 uv) {
      vec2 size = vec2(64.0, 32.0);
      vec2 t = uv * size + 0.5;
      vec2 i = floor(t);
      vec2 f = t - i;
      return (i + f * f * f * (f * (f * 6.0 - 15.0) + 10.0) - 0.5) / size;
    }

    vec3 rgb2hsv(vec3 c) {
      float mx = max(c.r, max(c.g, c.b));
      float mn = min(c.r, min(c.g, c.b));
      if (mx == mn) return vec3(0.0, 0.0, mx);
      vec3 d = (mx - c) / (6.0 * (mx - mn)) + 0.5;
      float h;
      if (c.r == mx) h = d.b - d.g;
      else if (c.g == mx) h = 1.0 / 3.0 + d.r - d.b;
      else h = 2.0 / 3.0 + d.g - d.r;
      if (h < 0.0) h += 1.0;
      if (h > 1.0) h -= 1.0;
      return vec3(h, (mx - mn) / mx, mx);
    }

    vec3 hsv2rgb(vec3 hsv) {
      float v = hsv.z;
      float s = hsv.y;
      if (s == 0.0) return vec3(v);
      float h6 = clamp(hsv.x - 0.0001, 0.0, 1.0) * 6.0;
      float f = fract(h6);
      float p = v * (1.0 - s);
      float q = v * (1.0 - s * f);
      float t = v * (1.0 - s * (1.0 - f));
      if (h6 < 1.0) return vec3(v, t, p);
      if (h6 < 2.0) return vec3(q, v, p);
      if (h6 < 3.0) return vec3(p, v, t);
      if (h6 < 4.0) return vec3(p, q, v);
      if (h6 < 5.0) return vec3(t, p, v);
      return vec3(v, p, q);
    }

    // (1 + tanh(k)) / 2, k held within +-10.
    float rise(float k) {
      float e = exp(2.0 * clamp(k, -10.0, 10.0));
      return 0.5 + 0.5 * (e - 1.0) / (e + 1.0);
    }

    // A clock's light between 600 and 1800 on it: from rise(a (clock - 600)) to rise(b (1800 - clock)).
    float window(float clock, float a, float b) {
      return rise(a * (clock - 600.0)) * rise(b * (1800.0 - clock));
    }

    // A clock's two glows, as 0.2 and 0.19 of the light: a broad one low in the middle, widest when the clock is
    // at 1200, and a small one that goes round an ellipse as the clock does.
    float glow(float clock, vec2 uv) {
      float a = (clock - 600.0) * 3.14159265 / 1200.0;
      float dx = uv.x - 0.5 - 0.4 * cos(a);
      float broad = 4.0 * (uv.y - 0.05) * (uv.y - 0.05) + dx * dx / (1.0 + exp(-0.008 * (clock - 1200.0) * (clock - 1200.0)));
      float ex = uv.x - 0.5 + 0.8 * cos(a);
      float ey = uv.y - 0.99 * sin(a);
      return 0.2 * exp(-4.0 * broad) + 0.19 * exp(-8.0 * (1.25 * ey * ey + ex * ex));
    }

    void main() {
      vec2 uv = vUv;
      vec2 st = smoothCoord(uv);

      // The day's two months through hue, saturation and value: the value lit by the day's window, fading up the
      // screen outside it, and by the glows; the saturation pushed up where the light is low, less in mid-month,
      // and down in the glows.
      float dayGlow = glow(uDayTime, uv);
      float mid = exp(-0.01 * (uMonthTime - 15.0) * (uMonthTime - 15.0));
      float value = window(uDayTime, 0.005, 0.01) * exp(-6.4 * uv.y * (1.0 - window(uDayTime, 0.005, 0.005)))
        * (dayGlow + 0.6);
      float saturation = (2.0 - exp(-6.4 * uv.y * (1.0 - window(uDayTime, 0.01, 0.01))) - 0.25 * mid) * (0.9 - dayGlow);
      vec3 hsv1 = rgb2hsv(month(uDay1, st));
      vec3 hsv2 = rgb2hsv(month(uDay2, st));
      vec3 day1 = clamp(hsv2rgb(vec3(hsv1.x, hsv1.y * saturation, hsv1.z * value)), 0.0, 1.0);
      vec3 day2 = clamp(hsv2rgb(vec3(hsv2.x, hsv2.y * saturation, hsv2.z * value)), 0.0, 1.0);

      // Next month comes in from the bottom of the screen up, its edge soft in mid-month and sharp at the ends.
      float m = uMonthTime;
      float edge = clamp((uv.y + 1.0 - 0.1 * m) * (0.1 + (0.4 / 9.0) * (m - 15.0) * (m - 15.0)), -10.0, 10.0);
      float next = 1.0 - rise(edge);
      vec3 day = mix(day1, day2, next);

      // The night's textures, under the night's own light, which never goes below _NightBrightness.
      float level = window(uNightTime, 0.005, 0.01) * exp(-6.4 * uv.y * (1.0 - window(uNightTime, 0.005, 0.005)))
        * (glow(uNightTime, uv) + 0.6);
      level = clamp(max(level, uNightBrightness), 0.0, 1.0);
      vec3 night = level * mix(month(uNight1, st), month(uNight2, st), next);

      oColor = vec4(mix(night, day, uNightDayBlend), uAlpha);
    }`;

  // back_colours1.fpo, re-authored from RPCS3's decompilation and checked against it to float precision: no texture,
  // a light that fades down the screen in each channel, a broad glow from beyond its top right corner, a small one low
  // on the left whose red tightens and loosens with the clock, and a soft edge that darkens the bottom left.
  const MUSIC_FS = `#version 300 es
    precision highp float;
    uniform float uDayTime;
    uniform float uAlpha;
    in vec2 vUv;
    out vec4 oColor;
    void main() {
      float u = vUv.x;
      float v = vUv.y;
      float far = exp(-0.5 * ((u - 1.5) * (u - 1.5) + (v - 1.5) * (v - 1.5)));
      float low = (u - 0.4) * (u - 0.4) / 6.0 + (v - 0.1) * (v - 0.1);
      float pulse = 1.0 + 0.5 * cos(uDayTime);
      vec3 c = vec3(
        0.4 * exp(-0.4 * (1.0 - v)) + 0.6 * exp(-16.0 * pulse * low) + 0.375 * far,
        0.3 * exp(-0.2 * (1.0 - v)) + 0.25 * exp(-12.0 * low) + 0.3 * far,
        0.5 * exp(-0.1 * (1.0 - v)) + 0.45 * exp(-8.0 * low) + 0.6 * far);
      float e = exp(2.0 * clamp(2.5 * (v - 0.2 * u - 0.4), -10.0, 10.0));
      oColor = vec4(c * 0.4 * (1.0 + (e - 1.0) / (e + 1.0)), uAlpha);
    }`;

  // back_colours_cpy.fpo: a texture as it is, texel for texel.
  const COPY_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc;
    in vec2 vUv;
    out vec4 oColor;
    void main() {
      oColor = texture(uSrc, vUv);
    }`;

  // A preset: one month's fitted gradient, or the RGB sliders', drawn as it is.
  const PRESET_FS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 oColor;
    uniform vec3 uColorStart;
    uniform vec3 uColorEnd;
    uniform vec2 uDir;
    uniform float uTMin;
    uniform float uTSpan;
    void main() {
      vec2 uvYDown = vec2(vUv.x, 1.0 - vUv.y);
      float t = dot(uvYDown, uDir);
      float u = clamp((t - uTMin) / max(uTSpan, 1e-6), 0.0, 1.0);
      float g = u * u * (3.0 - 2.0 * u);
      oColor = vec4(mix(uColorStart, uColorEnd, g), 1.0);
    }`;

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

  function program(gl, fsSrc, names) {
    const prog = gl.createProgram();
    const vs = compile(gl, VS, gl.VERTEX_SHADER);
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
    names.forEach(function (name) { u[name] = gl.getUniformLocation(prog, name); });
    return { prog, u };
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // A preset's gradient, as the page drew the backdrop before the console's pass.
  function presetGradient(settings) {
    const presets = window.BG_GRADIENT_PRESETS || {};
    const selected = presets[String(settings.gradientPreset || 'default')];
    let start;
    let end;
    let dir;
    if (selected && !selected.legacy && selected.colorStart && selected.colorEnd) {
      const rad = ((selected.angleDeg || 0) * Math.PI) / 180;
      dir = [Math.cos(rad), Math.sin(rad)];
      start = selected.colorStart.map(function (c) { return clamp01((c || 0) / 255); });
      end = selected.colorEnd.map(function (c) { return clamp01((c || 0) / 255); });
    } else {
      const c = [settings.colorR / 255, settings.colorG / 255, settings.colorB / 255];
      start = [c[0] * settings.gradientTopMul, c[1] * settings.gradientTopMul, c[2] * settings.gradientTopMul * 1.2];
      end = [c[0] * settings.gradientBotMul, c[1] * settings.gradientBotMul, c[2] * settings.gradientBotMul];
      dir = [0, 1];
    }
    const corners = [0, dir[0], dir[1], dir[0] + dir[1]];
    const tMin = Math.min.apply(null, corners);
    return { start, end, dir, tMin, tSpan: Math.max(1e-6, Math.max.apply(null, corners) - tMin) };
  }

  function createBackdrop(gl) {
    const fits = window.BG_MONTH_FITS;
    if (!fits) throw new Error('Missing BG_MONTH_FITS');
    const consolePass = program(gl, CONSOLE_FS, ['uDay1', 'uDay2', 'uNight1', 'uNight2', 'uDayTime', 'uNightTime',
      'uMonthTime', 'uNightBrightness', 'uNightDayBlend', 'uAlpha']);
    const musicPass = program(gl, MUSIC_FS, ['uDayTime', 'uAlpha']);
    const copyPass = program(gl, COPY_FS, ['uSrc']);
    const preset = program(gl, PRESET_FS, ['uColorStart', 'uColorEnd', 'uDir', 'uTMin', 'uTSpan']);
    const flat = function (channels) {
      const out = [];
      for (let k = 0; k < 10; k++) out.push(channels[0][k], channels[1][k], channels[2][k]);
      return out;
    };
    const months = { day: fits.day.map(flat), night: fits.night.map(flat) };

    const quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // The console's state for the backdrop (what 0x4fc40 sets up): the program COLOUR SHADER picked, the moment last
    // handed over, and the ease into what the program draws from the snapshot - how far into it, and how long it takes.
    const state = { shader: 0, date: null, serial: undefined, timer: 0, fade: 0 };
    let snapshot = null;

    // The snapshot's buffer, in the target's format.
    function snapshotFor(target) {
      if (snapshot) return snapshot;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (target.float) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, target.width, target.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, target.width, target.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      snapshot = { tex, fbo };
      return snapshot;
    }

    function copy(src) {
      gl.useProgram(copyPass.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(copyPass.u.uSrc, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Draws the backdrop into `target`, the bound 64 x 32 buffer, `dtSec` after the last frame: the console's pass on
    // 'auto', otherwise the preset. `moment` is the last moment the scene handed the backdrop (0x10900, through 0x4fe04
    // and 0x4fe18), over how long, and a count of the hand-overs.
    //
    // A moment handed over, or a change of program (0x4fdf0), starts an ease afresh: in its first frame the buffer is
    // copied aside as it stands (0x52784), and every frame then draws that copy and the program over it by _Alpha, the
    // smoothstep of the frame time since over the ease's length (0x52ef0, 0x453ac), which stops counting at one and a
    // half times that length. The scene hands its clock's moment over a second, each second, so at rest the backdrop
    // trails its program by at most a second.
    function draw(settings, moment, dtSec, target) {
      gl.bindVertexArray(quad);
      if (String(settings.gradientPreset) !== 'auto') {
        const g = presetGradient(settings);
        gl.useProgram(preset.prog);
        gl.uniform3fv(preset.u.uColorStart, g.start);
        gl.uniform3fv(preset.u.uColorEnd, g.end);
        gl.uniform2fv(preset.u.uDir, g.dir);
        gl.uniform1f(preset.u.uTMin, g.tMin);
        gl.uniform1f(preset.u.uTSpan, g.tSpan);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        return;
      }

      const m = moment || { date: new Date(), seconds: 0, serial: null };
      // COLOUR SHADER is a whole number, which a change of set puts in at once. The page's first frame takes it as it
      // is, as if the XMB had been running.
      const shader = Math.round(settings.colourShader) === 1 ? 1 : 0;
      if (state.date === null) state.shader = shader;
      if (m.serial === null || m.serial !== state.serial) {
        state.serial = m.serial;
        state.date = m.date;
        state.fade = m.seconds;
        state.timer = 0;
      }
      if (shader !== state.shader) {
        state.shader = shader;
        state.fade = SHADER_FADE;
        state.timer = 0;
      }
      const shot = snapshotFor(target);
      if (state.timer === 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shot.fbo);
        copy(target.tex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      copy(shot.tex);

      const alpha = state.timer === state.fade ? 1 : smoothstep(0, state.fade, state.timer);
      const u = uniforms(settings, state.date, shader);
      if (shader === 1) {
        gl.useProgram(musicPass.prog);
        gl.uniform1f(musicPass.u.uDayTime, u.dayTime);
        gl.uniform1f(musicPass.u.uAlpha, alpha);
      } else {
        const p = consolePass;
        gl.useProgram(p.prog);
        gl.uniform3fv(p.u.uDay1, months.day[u.thisMonth]);
        gl.uniform3fv(p.u.uDay2, months.day[u.nextMonth]);
        gl.uniform3fv(p.u.uNight1, months.night[u.thisMonth]);
        gl.uniform3fv(p.u.uNight2, months.night[u.nextMonth]);
        gl.uniform1f(p.u.uDayTime, u.dayTime);
        gl.uniform1f(p.u.uNightTime, u.nightTime);
        gl.uniform1f(p.u.uMonthTime, u.monthTime);
        gl.uniform1f(p.u.uNightBrightness, u.nightBrightness);
        gl.uniform1f(p.u.uNightDayBlend, u.nightDayBlend);
        gl.uniform1f(p.u.uAlpha, alpha);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
      if (state.timer < 1.5 * state.fade) state.timer += dtSec;
    }

    return { draw, state };
  }

  window.PS3Backdrop = { create: createBackdrop, uniforms };
})();
