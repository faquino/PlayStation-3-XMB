'use strict';
// Theme parameter sets: how each firmware override/<theme>/PARTICLES.mnu differs from the base one, plus the blend
// that walks the day and the boot sequences. Read at load time by `particles-settings.js`, applied from `index.html`.

// Only the particle side is here, and on that side some numbered sets repeat: welcome_2's particles equal
// welcome_1's, coldboot2's equal coldboot1's, and gameboot4 is gameboot3 with `global alpha` 0, like black is music
// with it - so the repeats are left out. The numbering is a sequence, not a duplicate: those sets differ from each
// other in `BACKGROUND.mnu` and `HDR.mnu`, which this file does not carry.
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

  // The boot sequences, read out of the scene's own custom_render_plugin.rco and the handlers its events call (see
  // the notes): each step puts a set in at a time into the sequence, blended over its own time from wherever the
  // parameters stand (0x39728). 'theme' is the set `theme` gives, the day cycle's on 'auto'. A launch ends as the
  // content takes the screen, and the XMB then comes back through its start, as the console's does when the content
  // quits. The curve of a blend between two sets runs in qglbase and is not traced: here it is the day's smoothstep.
  const SEQUENCES = {
    // anim_coldboot2, which event 1 starts: BootBG2 at 0, coldboot1 at once (and coldboot2, whose particles are the
    // same, over 3 s); NormalBG2 at 4 s, the cycle's set over 7.5 s. The scene starts in black, and coldboot1 is black
    // too for the particles bar `emit vel mul`.
    coldboot: { steps: [[0, 'coldboot', 0], [4, 'theme', 7.5]], end: 11.5, next: 'none' },
    // anim_gameboot, event 2: BG2 at 0, gameboot2 (the base particles) over 0.25 s; BG3 at 0.5 s, gameboot3 over
    // 1.25 s; the game takes the screen at 2.8 s.
    gameboot: { steps: [[0, 'base', 0.25], [0.5, 'gameboot', 1.25]], end: 2.8, next: 'coldboot' },
    // anim_otherboot, event 3: BG3 at 0, gameboot3 over 0.2 s; BG4 at 0.2 s, gameboot4 over 0.3 s; the content takes
    // the screen at 0.5 s.
    otherboot: { steps: [[0, 'gameboot', 0.2], [0.2, 'gameboot4', 0.3]], end: 0.5, next: 'coldboot' },
  };
  // gameboot4 is gameboot3 with `global alpha` 0.
  const SEQUENCE_SETS = { gameboot4: Object.assign({}, window.PARTICLE_THEMES.gameboot, { globalAlpha: 0 }) };

  const TOUCHED = [];
  Object.keys(window.PARTICLE_THEMES).forEach(function (key) {
    Object.keys(window.PARTICLE_THEMES[key]).forEach(function (name) {
      if (TOUCHED.indexOf(name) === -1) TOUCHED.push(name);
    });
  });

  let base = null; // the firmware defaults, taken before the first theme is applied
  let appliedPair = null;
  let appliedMix = -1;
  let playing = null; // the sequence playing: its name, when it started, and the step it is on

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
    const set = SEQUENCE_SETS[theme] || window.PARTICLE_THEMES[theme];
    return set && name in set ? set[name] : base[name];
  }

  // What `theme` asks for now: one set, or on 'auto' the day's blend of two, `mix` of the way from one to the other.
  function themeBlend(theme, date) {
    if (theme !== 'auto') return { from: theme, to: theme, mix: 0 };
    return dayCycle(date || new Date());
  }

  // Plays the sequence `settings.sequence` names, and hands over to the next one, or to the theme, when it is over.
  // Returns true when it wrote.
  function playSequence(settings, theme, date) {
    const clock = date ? date.getTime() : typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = clock / 1000;
    let wrote = false;
    for (;;) {
      const wanted = SEQUENCES[settings.sequence] ? settings.sequence : null;
      if (wanted !== (playing && playing.name)) {
        playing = wanted ? { name: wanted, start: now, step: -1, from: {}, at: 0, set: null, blend: 0 } : null;
        appliedPair = null; // the theme writes again when the sequence is over
      }
      if (!playing) return wrote;
      if (now - playing.start < SEQUENCES[playing.name].end) break;
      settings.sequence = SEQUENCES[playing.name].next;
      wrote = true;
    }

    // A step starts from where the one before it stood at the step's own time, whenever the next frame comes.
    const seq = SEQUENCES[playing.name];
    const t = now - playing.start;
    while (playing.step + 1 < seq.steps.length && t >= seq.steps[playing.step + 1][0]) {
      const next = seq.steps[++playing.step];
      if (playing.step > 0) writeStep(settings, theme, date, next[0]);
      TOUCHED.forEach(function (name) { playing.from[name] = settings[name]; });
      playing.at = next[0];
      playing.set = next[1];
      playing.blend = next[2];
    }
    if (playing.step < 0) return wrote;
    writeStep(settings, theme, date, t);
    return true;
  }

  // The step playing, `t` seconds into its sequence.
  function writeStep(settings, theme, date, t) {
    const mix = playing.blend > 0 ? smoothstep((t - playing.at) / playing.blend) : 1;
    const goal = playing.set === 'theme' ? themeBlend(theme, date) : { from: playing.set, to: playing.set, mix: 0 };
    TOUCHED.forEach(function (name) {
      const a = valueOf(name, goal.from);
      const b = a + (valueOf(name, goal.to) - a) * goal.mix;
      settings[name] = playing.from[name] + (b - playing.from[name]) * mix;
    });
  }

  // Writes a theme into the live settings, or the day's blend of two when `theme` is 'auto', and plays the boot
  // sequence `settings.sequence` names on top of it. The theme only writes when it or its blend has moved, so edits
  // made by hand survive. Returns true when it wrote.
  window.applyParticleTheme = function applyParticleTheme(settings, theme, date) {
    if (!base) {
      base = {};
      TOUCHED.forEach(function (name) { base[name] = settings[name]; });
    }
    if (playSequence(settings, theme, date)) return true;
    if (playing) return false;

    const c = themeBlend(theme, date);
    const pair = c.from + '>' + c.to;
    const step = Math.round(c.mix * 500) / 500;
    if (pair === appliedPair && step === appliedMix) return false;
    appliedPair = pair;
    appliedMix = step;

    TOUCHED.forEach(function (name) {
      const a = valueOf(name, c.from);
      const b = valueOf(name, c.to);
      settings[name] = a + (b - a) * step;
    });
    return true;
  };
})();
