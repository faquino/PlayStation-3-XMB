'use strict';
// Particle layer renderer: draws `PS3ParticlesReverse` in the XMB's two passes, lit iridescent flakes then glare,
// with shaders re-authored from particles_quads / particles_second. Created by `index.html` with the spline surface.

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

  // proc_iridescent.tga rebuilt: its colour depends only on a spiral phase around the centre,
  // t = (angle - 0.025 r - 0.00006 r^2) / 2pi with r in texels, read from 16 colours fitted to the firmware texture
  // (periodic Catmull-Rom, RMS error 13/255).
  const IRIDESCENT_TABLE = [
    [247, 249, 189], [243, 220, 96], [220, 153, 60], [192, 106, 73], [212, 72, 138], [206, 52, 190],
    [150, 76, 222], [99, 138, 244], [53, 124, 233], [73, 109, 231], [109, 132, 236], [164, 130, 245],
    [218, 133, 216], [197, 139, 115], [182, 168, 86], [179, 187, 160],
  ];

  function createIridescentTexture(gl) {
    const size = 128;
    const n = IRIDESCENT_TABLE.length;
    const c = (size - 1) / 2;
    const px = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const dx = i - c;
        const dy = c - j;
        const r = Math.hypot(dx, dy);
        const phase = (Math.atan2(dy, dx) - 0.025 * r - 0.00006 * r * r) / (2 * Math.PI);
        const u = (phase - Math.floor(phase)) * n - 0.5;
        const k = Math.floor(u);
        const f = u - k;
        const p0 = IRIDESCENT_TABLE[(k - 1 + n) % n];
        const p1 = IRIDESCENT_TABLE[(k + n) % n];
        const p2 = IRIDESCENT_TABLE[(k + 1) % n];
        const p3 = IRIDESCENT_TABLE[(k + 2) % n];
        const o = (j * size + i) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const v = 0.5 * (2 * p1[ch] + (p2[ch] - p0[ch]) * f +
            (2 * p0[ch] - 5 * p1[ch] + 4 * p2[ch] - p3[ch]) * f * f +
            (3 * p1[ch] - p0[ch] - 3 * p2[ch] + p3[ch]) * f * f * f);
          px[o + ch] = Math.max(0, Math.min(255, Math.round(v)));
        }
        px[o + 3] = 255;
      }
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return tex;
  }

  // Column-major matrices for the XMB camera: the eye at uEye looking down -z, unrotated.
  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
  }

  function translation(out, x, y, z) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    out[12] = x;
    out[13] = y;
    out[14] = z;
  }

  function multiply(out, a, b) {
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
        out[col * 4 + row] = s;
      }
    }
  }

  // Shared by both vertex shaders: attributes, the lens terms (focus, size, fade band) and the opacity.
  const VS_COMMON = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 aCorner;     // quad corner, 0..1
    layout(location = 1) in vec4 aPos;        // position, opacity over the particle's life
    layout(location = 2) in vec4 aRot;        // orientation quaternion
    uniform mat4 uMVP;
    uniform mat4 uModelView;
    uniform vec3 uEye;
    uniform vec3 uSpot;
    uniform float uSpecPower;
    uniform vec3 uLifeMin;
    uniform vec3 uLifeMax;
    uniform vec4 uFocus;          // near focus, its end, far focus, its end (distance to the eye)
    uniform vec3 uFocusCurves;    // near and far blur exponents, vertical field of view
    uniform vec3 uParticleSize;   // in focus, nearest, farthest
    uniform vec2 uDarkness;       // near, far
    uniform vec4 uNearControl;    // size align, near fuzziness, near align
    uniform vec4 uFrontFacing;    // orientation of a quad facing the camera
    uniform vec2 uTransparency;   // fresnel exponent, global alpha
    uniform vec4 uGlare;          // strength, scale, falloff exponent, falloff rate
    out vec2 vUv;
    out vec2 vBlur;
    out float vAlpha;
    out vec3 vNormal;
    out vec3 vWorld;
    out vec3 vViewNormal;

    vec3 axisX(vec4 q) {
      return vec3(1.0 - 2.0 * (q.y * q.y + q.z * q.z), 2.0 * (q.x * q.y + q.w * q.z), 2.0 * (q.x * q.z - q.w * q.y));
    }
    vec3 axisY(vec4 q) {
      return vec3(2.0 * (q.x * q.y - q.w * q.z), 1.0 - 2.0 * (q.x * q.x + q.z * q.z), 2.0 * (q.y * q.z + q.w * q.x));
    }
    vec3 axisZ(vec4 q) {
      return vec3(2.0 * (q.x * q.z + q.w * q.y), 2.0 * (q.y * q.z - q.w * q.x), 1.0 - 2.0 * (q.x * q.x + q.y * q.y));
    }
    float ramp(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }

    struct Lens {
      vec3 view;        // unit vector to the eye
      float nearBlur;   // 1 up to the near focus, 0 past its end
      float farBlur;    // 0 up to the far focus, 1 past its end
      float nearCurve;
      float farCurve;
      float size;       // world size of the quad
      float apparent;   // angular size, as a fraction of the field of view
      float band;       // opacity dip just in front of the far focus
      float bandAlign;  // the turn to face the camera that the dip hides
    };

    Lens lens(vec3 p) {
      Lens l;
      vec3 toEye = uEye - p;
      float dist = length(toEye);
      l.view = toEye / dist;
      l.nearBlur = 1.0 - ramp(dist, uFocus.x, uFocus.y);
      l.farBlur = ramp(dist, uFocus.z, uFocus.w);
      l.nearCurve = pow(max(l.nearBlur, 1e-10), uFocusCurves.x);
      l.farCurve = pow(max(l.farBlur, 1e-10), uFocusCurves.y);
      l.size = mix(mix(uParticleSize.x, uParticleSize.y, l.nearCurve), uParticleSize.z, l.farCurve);
      l.apparent = 2.0 * atan(l.size / dist) / uFocusCurves.z;
      float ff = uFocus.z;
      l.band = 1.0 + ramp(dist, ff - 0.2, ff) - ramp(dist, ff - 0.6, ff - 0.4);
      l.bandAlign = ramp(dist, ff - 0.4, ff - 0.2);
      return l;
    }

    float opacity(vec3 p, Lens l, vec3 quadNormal) {
      vec3 wall = min(p - uLifeMin, uLifeMax - p);
      float s = clamp(5.0 * min(min(wall.x, wall.y), wall.z), 0.0, 1.0);
      float wallFade = s * s * (3.0 - 2.0 * s);
      float facing = 1.0 - pow(max(1.0 - abs(dot(l.view, quadNormal)), 1e-10), uTransparency.x);
      float farDark = clamp(l.farBlur * l.apparent * uDarkness.y, 0.0, 1.0);
      float nearDark = clamp(l.nearBlur * l.apparent * uDarkness.x, 0.0, 1.0);
      return facing * uTransparency.y * aPos.w * l.band * (1.0 - farDark) * (1.0 - nearDark) * wallFade;
    }
  `;

  // particles_quads: the flake itself, turned towards the camera as it grows or blurs.
  const VS_QUADS = VS_COMMON + `
    void main() {
      vec3 p = aPos.xyz;
      vec4 q = normalize(aRot);
      Lens l = lens(p);
      float align = clamp(l.apparent * uNearControl.x + l.nearCurve * uNearControl.z + l.bandAlign, 0.0, 1.0);
      vec4 qa = normalize(q + align * (uFrontFacing - q));
      vec2 c = aCorner - 0.5;
      vec3 world = p + (axisX(qa) * c.x + axisY(qa) * c.y) * l.size;
      gl_Position = uMVP * vec4(world, 1.0);
      vAlpha = opacity(p, l, axisZ(qa));
      vUv = aCorner;
      vBlur = vec2(l.nearCurve, l.farCurve);
      vNormal = axisZ(q);
      vWorld = world;
      vViewNormal = mat3(uModelView) * vNormal;
    }
  `;

  // particles_second: a camera-facing glare sprite that only grows while the flake mirrors the spot into the eye.
  const VS_GLARE = VS_COMMON + `
    void main() {
      vec3 p = aPos.xyz;
      vec4 q = normalize(aRot);
      Lens l = lens(p);
      vec3 n = axisZ(q);
      vec3 h = normalize(normalize(uSpot - p) + l.view);
      float glint = pow(max(abs(dot(n, h)), 1e-10), uSpecPower);
      vec2 c = aCorner - 0.5;
      vec3 world = p + (axisX(uFrontFacing) * c.x + axisY(uFrontFacing) * c.y) * (l.size * uGlare.y * glint);
      gl_Position = uMVP * vec4(world, 1.0);
      vAlpha = opacity(p, l, axisZ(uFrontFacing));
      vUv = aCorner;
      vBlur = vec2(l.nearCurve, l.farCurve);
      vNormal = n;
      vWorld = world;
      vViewNormal = mat3(uModelView) * n;
    }
  `;

  const FS_COMMON = `#version 300 es
    precision highp float;
    in vec2 vUv;
    in vec2 vBlur;
    in float vAlpha;
    in vec3 vNormal;
    in vec3 vWorld;
    in vec3 vViewNormal;
    out vec4 oColor;
    uniform sampler2D uIridescent;
    uniform vec3 uEye;
    uniform vec3 uSpot;
    uniform vec3 uAttn;           // constant, linear and quadratic attenuation of the spot
    uniform vec4 uLight;          // lambert coefficient, specular coefficient, exposure, specular power
    uniform float uIridescentExp;
    uniform vec4 uNearControl;
    uniform vec4 uGlare;
    uniform vec3 uColor;
    uniform float uGamma;

    // Thin-film colour, looked up by the flake's normal as the camera sees it.
    vec3 iridescence() {
      return pow(texture(uIridescent, vViewNormal.xy * 0.5 + 0.5).rgb, vec3(uIridescentExp));
    }

    float lightDistance() { return length(uSpot - vWorld); }

    float specular() {
      vec3 l = normalize(uSpot - vWorld);
      vec3 v = normalize(uEye - vWorld);
      return pow(abs(dot(vNormal, normalize(l + v))), uLight.w);
    }

    float attenuation() {
      float d = lightDistance();
      return uAttn.x + (uAttn.y + uAttn.z * d) * d;
    }
  `;

  // Diffuse plus iridescent specular, exposed, on a disc that widens and softens into a bokeh with blur.
  const FS_QUADS = FS_COMMON + `
    void main() {
      vec3 l = normalize(uSpot - vWorld);
      vec3 light = (abs(dot(vNormal, l)) * uLight.x + specular() * uLight.y * iridescence()) / attenuation();
      vec3 exposed = 1.0 - exp(-uLight.z * light);
      float blur = clamp(vBlur.x + vBlur.y, 0.0, 1.0);
      float rho = length(vUv * 2.0 - 1.0);
      float e = clamp((rho - (0.45 - 0.6345 * blur)) / (0.1 + 1.269 * blur), 0.0, 1.0);
      float disc = 1.0 - e * e * (3.0 - 2.0 * e);
      float fuzz = mix(0.85, uNearControl.y, vBlur.x);
      float shape = disc + blur * (1.0 - disc - exp(-disc * fuzz));
      vec3 color = exposed * (shape * vAlpha);
      oColor = vec4(color * uColor * uGamma, color.r);
    }
  `;

  // Iridescent specular only, with a sharp exponential falloff from the sprite's centre.
  const FS_GLARE = FS_COMMON + `
    void main() {
      float rho = min(length(vUv * 2.0 - 1.0), 1.0);
      float falloff = exp(-uGlare.w * pow(rho, uGlare.z));
      vec3 light = specular() * uLight.y * iridescence() / attenuation();
      vec3 exposed = (1.0 - exp(-uLight.z * light)) * vAlpha;
      oColor = vec4(exposed * uColor * (falloff * uGlare.x * uGamma), exposed.r);
    }
  `;

  const UNIFORMS = [
    'uMVP', 'uModelView', 'uEye', 'uSpot', 'uSpecPower', 'uLifeMin', 'uLifeMax', 'uFocus', 'uFocusCurves',
    'uParticleSize', 'uDarkness', 'uNearControl', 'uFrontFacing', 'uTransparency', 'uGlare', 'uIridescent',
    'uAttn', 'uLight', 'uIridescentExp', 'uColor', 'uGamma',
  ];

  function uniformMap(gl, program) {
    const map = {};
    UNIFORMS.forEach(function (name) { map[name] = gl.getUniformLocation(program, name); });
    return map;
  }

  window.createParticlesLayer = function createParticlesLayer(gl, canvas, options) {
    const settings = window.PARTICLE_SETTINGS;
    if (!settings) throw new Error('Missing PARTICLE_SETTINGS');
    if (!window.PS3ParticlesReverse) throw new Error('Missing PS3ParticlesReverse');
    const surface = options && options.surface;
    if (!surface) throw new Error('createParticlesLayer needs the spline layer surface');
    const input = (options && options.input) || null;

    const RE = window.PS3ParticlesReverse;
    const system = RE.createSystem({ capacity: 4096 });
    const passes = [
      { program: link(gl, VS_QUADS, FS_QUADS) },
      { program: link(gl, VS_GLARE, FS_GLARE) },
    ];
    passes.forEach(function (pass) { pass.u = uniformMap(gl, pass.program); });
    const iridescentTex = createIridescentTexture(gl);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const instanceBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, system.output.byteLength, gl.DYNAMIC_DRAW);
    const strideBytes = RE.OUT_STRIDE * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strideBytes, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, strideBytes, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    const proj = new Float32Array(16);
    const modelView = new Float32Array(16);
    const mvp = new Float32Array(16);
    const eye = RE.CAMERA.eye;

    function setUniforms(u, s) {
      gl.uniformMatrix4fv(u.uMVP, false, mvp);
      gl.uniformMatrix4fv(u.uModelView, false, modelView);
      gl.uniform3f(u.uEye, eye[0], eye[1], eye[2]);
      gl.uniform3f(u.uSpot, s.spotPosX, s.spotPosY, s.spotPosZ);
      gl.uniform3f(u.uAttn, s.spotAttnX, s.spotAttnY, s.spotAttnZ);
      gl.uniform4f(u.uLight, s.lambertCoeff, s.specularCoeff, s.exposure, s.specularPower);
      gl.uniform1f(u.uSpecPower, s.specularPower);
      gl.uniform3f(u.uLifeMin, RE.LIFE_MIN[0], RE.LIFE_MIN[1], RE.LIFE_MIN[2]);
      gl.uniform3f(u.uLifeMax, RE.LIFE_MAX[0], RE.LIFE_MAX[1], RE.LIFE_MAX[2]);
      gl.uniform4f(u.uFocus, s.nearFocus, s.nearFocus + s.nearFocusDist, s.farFocus, s.farFocus + s.farFocusDist);
      gl.uniform3f(u.uFocusCurves, s.nearFocusPow, s.farFocusPow, RE.CAMERA.fovy);
      gl.uniform3f(u.uParticleSize, s.sizeMiddle, s.sizeNear, s.sizeFar);
      gl.uniform2f(u.uDarkness, s.nearDarkness, s.farDarkness);
      gl.uniform4f(u.uNearControl, s.sizeAlign, s.nearFuzziness, s.nearAlign, 0);
      gl.uniform4f(u.uFrontFacing, 0, 0, 0, 1);
      gl.uniform2f(u.uTransparency, s.fresnel, s.globalAlpha);
      gl.uniform4f(u.uGlare, s.glare, s.glareScale, s.glareP1, s.glareP2);
      gl.uniform1f(u.uIridescentExp, s.iridescentExp);
      // _Color ran as (1, 1, 1) with `color_control` 1; tying the two together is inferred.
      gl.uniform3f(u.uColor, s.colorControl, s.colorControl, s.colorControl);
      gl.uniform1f(u.uGamma, 1);
      gl.uniform1i(u.uIridescent, 0);
    }

    function render(waveTimeSec, dtSec) {
      // A hidden page can report an empty canvas; emitting then would put every particle on the axis.
      if (!canvas.width || !canvas.height) return;
      const aspect = canvas.width / canvas.height;
      system.update(settings, surface, input, waveTimeSec, dtSec, aspect);
      window.__PS3_PARTICLES_STATE = system.stats;
      const count = system.count;
      if (!count) return;

      perspective(proj, RE.CAMERA.fovy, aspect, RE.CAMERA.near, RE.CAMERA.far);
      translation(modelView, -eye[0], -eye[1], -eye[2]);
      multiply(mvp, proj, modelView);

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, system.output, 0, count * RE.OUT_STRIDE);

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, iridescentTex);
      gl.bindVertexArray(vao);
      passes.forEach(function (pass) {
        gl.useProgram(pass.program);
        setUniforms(pass.u, settings);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      });
      gl.bindVertexArray(null);
    }

    return { render, system };
  };
})();
