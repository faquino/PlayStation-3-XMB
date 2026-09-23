'use strict';
// Theme parameter sets: how each firmware override/<theme>/PARTICLES.mnu differs from the base one, plus the blend
// that walks the day. Read at load time by `particles-settings.js`, applied from `index.html`.

// Sets that are duplicates of another are left out: welcome_2 equals welcome_1, coldboot2 equals coldboot1, and
// gameboot4 is gameboot3 with `global alpha` 0, like black is music with it.
window.PARTICLE_THEMES = {
  yoake: { farFocus: 12.0064, farFocusDist: 4.02735, glare: 0.180536 },
  day: { sizeMiddle: 0.0464771, farFocus: 12.2008, farFocusDist: 4.02735, glare: 0.201367 },
  higure: { sizeMiddle: 0.0464771, farFocus: 12.6869, farFocusDist: 4.02735, glare: 0.18748 },
  night: { farFocusDist: 4.09678 },
  music: { sizeMiddle: 0.0464771, farFocus: 12.0064, glare: 0.201367 },
  black: { globalAlpha: 0, sizeMiddle: 0.0464771, farFocus: 12.0064, glare: 0.201367 },
  coldboot: {
    emitVelMul: 3.7496, globalAlpha: 0, sizeMiddle: 0.0464771, farFocus: 12.0064, glare: 0.201367,
  },
  gameboot: {
    emitVelMin: 0.029756, emitVelMul: 1.52761, agingSpeed: 0.0034476, agingVariance: 0, deltaTime: 0.08,
    windDirX: -5.34058e-05, windScale: 0.000152351, brownianScale: 0.0556335, sizeMiddle: 0.073865,
    sizeNear: 0.186308, sizeFar: 0.0389094, nearFocus: 7, nearFocusDist: 2.4303, nearFocusPow: 3.05,
    nearDarkness: 6.63954, farFocus: 9.81914, farFocusDist: 0.138874, farFocusPow: 1.72, glare: 0.423566,
  },
  welcome: {
    emitVelMin: 0.131537, emitVelMul: 4.16622, emitVelZscale: 0.208311, emitPerFrame: 70.5765, emitProb: 0.493003,
    agingSpeed: 0.00101112, agingVariance: 0.5, friction: 0.0619405, spinTimeScale: 2.99327, deltaTime: 0.0172207,
    windDirX: 0.361019, windDirY: -0.0347719, windScale: 0.000544572, brownianScale: 0.0794061,
    specularPower: 29.3486, sizeMiddle: 0.073865, sizeNear: 0.0143576, sizeFar: 0.00746469, nearFocusDist: 1.59705,
    nearFocusPow: 2.22209, nearDarkness: 5.49606, farFocus: 7, farFocusDist: 6.31877, farFocusPow: 1.63882,
    farDarkness: 4.46526, nearAlign: 0.118043, sizeAlign: 14.1652, glare: 0.222198, glareScale: 6.22156,
    glareP1: 1.6344, glareP2: 8.41834,
  },
};

window.PARTICLE_THEME_OPTIONS = [
  { value: 'base', label: 'Base (PARTICLES.mnu)' },
  { value: 'auto', label: 'Auto (time of day)' },
  { value: 'yoake', label: 'Dawn (yoake)' },
  { value: 'day', label: 'Day' },
  { value: 'higure', label: 'Dusk (higure)' },
  { value: 'night', label: 'Night' },
  { value: 'music', label: 'Music' },
  { value: 'black', label: 'Black (hidden)' },
  { value: 'coldboot', label: 'Cold boot (hidden)' },
  { value: 'gameboot', label: 'Game boot' },
  { value: 'welcome', label: 'Welcome' },
];

(function () {
  // The day runs on four-hour smoothsteps that start every six hours, each followed by two hours of one set. All
  // four are measured, from frame captures and savestates: night into dawn from 01:00, dawn into day from 07:00,
  // day into dusk from 13:00, and dusk into night from 19:00.
  const CYCLE = [
    { from: 'night', to: 'yoake', start: 1, end: 5 },
    { from: 'yoake', to: 'day', start: 7, end: 11 },
    { from: 'day', to: 'higure', start: 13, end: 17 },
    { from: 'higure', to: 'night', start: 19, end: 23 },
  ];

  const TOUCHED = [];
  Object.keys(window.PARTICLE_THEMES).forEach(function (key) {
    Object.keys(window.PARTICLE_THEMES[key]).forEach(function (name) {
      if (TOUCHED.indexOf(name) === -1) TOUCHED.push(name);
    });
  });

  let base = null; // the firmware defaults, taken before the first theme is applied
  let appliedPair = null;
  let appliedMix = -1;

  function smoothstep(u) {
    const t = Math.min(Math.max(u, 0), 1);
    return t * t * (3 - 2 * t);
  }

  function dayCycle(date) {
    const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    let held = CYCLE[CYCLE.length - 1].to; // before the first window of the day, last night's set still holds
    for (let i = 0; i < CYCLE.length; i++) {
      const c = CYCLE[i];
      if (hour >= c.start && hour < c.end) {
        return { from: c.from, to: c.to, mix: smoothstep((hour - c.start) / (c.end - c.start)) };
      }
      if (hour >= c.end) held = c.to;
    }
    return { from: held, to: held, mix: 0 };
  }

  function valueOf(name, theme) {
    const set = window.PARTICLE_THEMES[theme];
    return set && name in set ? set[name] : base[name];
  }

  // Writes a theme into the live settings, or the day's blend of two when `theme` is 'auto'. It only writes when the
  // theme or the blend has moved, so edits made by hand survive. Returns true when it wrote.
  window.applyParticleTheme = function applyParticleTheme(settings, theme, date) {
    if (!base) {
      base = {};
      TOUCHED.forEach(function (name) { base[name] = settings[name]; });
    }

    let from = theme;
    let to = theme;
    let mix = 0;
    if (theme === 'auto') {
      const c = dayCycle(date || new Date());
      from = c.from;
      to = c.to;
      mix = c.mix;
    }

    const pair = from + '>' + to;
    const step = Math.round(mix * 500) / 500;
    if (pair === appliedPair && step === appliedMix) return false;
    appliedPair = pair;
    appliedMix = step;

    TOUCHED.forEach(function (name) {
      const a = valueOf(name, from);
      const b = valueOf(name, to);
      settings[name] = a + (b - a) * step;
    });
    return true;
  };
})();
