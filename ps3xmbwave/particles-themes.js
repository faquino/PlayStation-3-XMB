'use strict';
// Theme parameter sets: how each firmware override/<theme>/PARTICLES.mnu differs from the base one, plus the blend
// that walks the day, the boot sequences, the music and the scene's clock. Read at load by `particles-settings.js`,
// applied from `index.html`, which also hands the backdrop (`spline.js`) the clock.

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
  // The day runs on four-hour smoothsteps that start every six hours, each followed by two hours of one set: night
  // into dawn from 01:00, dawn into day from 07:00, day into dusk from 13:00, and dusk into night from 19:00. The
  // scene keeps them as a table of times and sets (0x9c98c), takes how far into its window the moment is, a straight
  // line, and blends the window's two sets by that much with the smoothstep below (0x11600, 0x39d6c). All four are
  // measured too, from frame captures and savestates.
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
  // quits. Every blend between two sets is a smoothstep over its time: qgl_base's blend mode, which the scene leaves
  // at 2 (0x1e8c8), bar the cold boot's first 4 s, where coldboot2 comes in by an exponential approach - with the same
  // particles as coldboot1, so the page leaves it out.
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

  // The music: event 4, which the scene sends itself as playback starts and stops. Starting puts music_1 in over
  // 5.5 s (0x16198). Stopping puts in the set with an empty name, the base as the name reads, over 5.5 s, and when
  // those 5.5 s are up lets the clock go (0x15694, 0x10658); until then the clock is held (0x11c58), so the hour does
  // not move the particles.
  const MUSIC_IN = 5.5;
  const MUSIC_OUT = 5.5;
  // The scene's clock ticks every second and puts the moment it shows in over 1 s (0x12284), and Theme Settings'
  // Colour puts its own in over 1 s too (sub-event 6).
  const TICK = 1;

  const TOUCHED = [];
  Object.keys(window.PARTICLE_THEMES).forEach(function (key) {
    Object.keys(window.PARTICLE_THEMES[key]).forEach(function (name) {
      if (TOUCHED.indexOf(name) === -1) TOUCHED.push(name);
    });
  });
  // The settings a theme or a sequence can write, which the particle panel lets a value set by hand be locked on.
  window.PARTICLE_THEME_KEYS = TOUCHED.slice();

  let base = null; // the firmware defaults, taken before the first theme is applied
  let appliedPair = null;
  let appliedMix = -1;
  let playing = null; // the sequence playing: its name, when it started, and the step it is on
  // What the theme or the sequence last wrote into each setting, and what it would write now. The two differ only
  // where a setting was locked when they moved it.
  const written = {};
  const aim = {};
  let music = 'off'; // 'in' while music_1 is in, 'out' while the base goes in after the music stops
  let musicStopped = 0; // when it stopped, in seconds
  let playback = 'stopped';
  let lastColor = '0'; // the colour Theme Settings held last time
  let fade = null; // a change of set on its way: where the parameters stood, when it started, and how long it takes

  // Writes a value the theme or the sequence has for a setting, if it moves the setting: one it leaves where it was
  // keeps whatever it holds, a value set by hand included, and one locked in `keep` is left alone either way. Returns
  // true when it wrote.
  function put(settings, name, value, keep) {
    aim[name] = value;
    if (keep && keep.has(name)) return false;
    if (name in written && written[name] === value) return false;
    settings[name] = value;
    written[name] = value;
    return true;
  }

  // A setting that was locked and is back to what was last written into it - Reset puts that back - catches up with
  // what the theme or the sequence has for it now. Returns true when it wrote.
  function catchUp(settings, keep) {
    let wrote = false;
    TOUCHED.forEach(function (name) {
      if (!(name in aim) || aim[name] === written[name] || settings[name] !== written[name]) return;
      if (keep && keep.has(name)) return;
      settings[name] = aim[name];
      written[name] = aim[name];
      wrote = true;
    });
    return wrote;
  }

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

  // The moment the scene shows: the clock's, or, while Theme Settings' Colour holds a month, noon on the 1st of that
  // month (0x11c58), which stops it. `index.html` hands the same moment to the backdrop.
  window.xmbSceneDate = function xmbSceneDate(color, date) {
    const now = date || new Date();
    const month = Math.round(Number(color)) || 0;
    if (month < 1 || month > 12) return now;
    return new Date(now.getFullYear(), month - 1, 1, 12, 0, 0);
  };

  // What the theme layer asks for now: music_1 while the music is in, the base while it goes out, and otherwise what
  // `theme` gives at the moment the scene's clock shows.
  function layerGoal(settings, theme, date) {
    if (music === 'in') return { from: 'music', to: 'music', mix: 0 };
    if (music === 'out') return { from: 'base', to: 'base', mix: 0 };
    return themeBlend(theme, window.xmbSceneDate(settings.themeColor, date));
  }

  // Seconds, on `date` when one is given and on the page's clock otherwise.
  function clockOf(date) {
    return (date ? date.getTime() : typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  // Sets off towards what the theme layer asks for, over `seconds`, from wherever the parameters stand: where the
  // theme or the sequence had them, not where a value set by hand holds them.
  function startFade(settings, now, seconds) {
    const from = {};
    TOUCHED.forEach(function (name) { from[name] = name in aim ? aim[name] : settings[name]; });
    fade = { from: from, start: now, seconds: seconds };
  }

  // Follows the music and Theme Settings' Colour as the settings name them. Music starting again while the base goes
  // in puts music_1 back over 5.5 s, as the console's does; a colour picked while the music holds the clock comes in
  // when it lets go.
  function followScene(settings, now) {
    const wanted = settings.musicPlayback === 'playing' ? 'playing' : 'stopped';
    if (wanted !== playback) {
      playback = wanted;
      if (wanted === 'playing' && music !== 'in') {
        music = 'in';
        startFade(settings, now, MUSIC_IN);
      } else if (wanted === 'stopped' && music === 'in') {
        music = 'out';
        musicStopped = now;
        startFade(settings, now, MUSIC_OUT);
      }
    }
    if (music === 'out' && now - musicStopped >= MUSIC_OUT) {
      music = 'off';
      startFade(settings, now, TICK); // the clock's next tick, which the page takes at once
    }
    const pinned = String(settings.themeColor || '0');
    if (pinned !== lastColor) {
      lastColor = pinned;
      if (music === 'off') startFade(settings, now, TICK);
    }
  }

  // Plays the sequence `settings.sequence` names, and hands over to the next one, or to the theme, when it is over.
  // Returns true when it wrote.
  function playSequence(settings, theme, date, keep) {
    const now = clockOf(date);
    let wrote = false;
    for (;;) {
      const wanted = SEQUENCES[settings.sequence] ? settings.sequence : null;
      if (wanted !== (playing && playing.name)) {
        // Handing back to the theme, the clock's next tick puts the moment it shows in over a second: the cold boot
        // reads the clock whatever the colour (0x11b20), so a colour comes in only then.
        if (!wanted && playing) startFade(settings, now, TICK);
        playing = wanted ? { name: wanted, start: now, step: -1, from: {}, at: 0, set: null, blend: 0 } : null;
        appliedPair = null; // the theme writes again when the sequence is over
      }
      if (!playing) return wrote;
      if (now - playing.start < SEQUENCES[playing.name].end) break;
      settings.sequence = SEQUENCES[playing.name].next;
      wrote = true;
    }

    // A step starts from where the one before it stood at the step's own time, whenever the next frame comes: where
    // the sequence had it, not where a value set by hand holds it.
    const seq = SEQUENCES[playing.name];
    const t = now - playing.start;
    while (playing.step + 1 < seq.steps.length && t >= seq.steps[playing.step + 1][0]) {
      const next = seq.steps[++playing.step];
      if (playing.step > 0) writeStep(settings, theme, date, next[0], keep);
      TOUCHED.forEach(function (name) { playing.from[name] = name in aim ? aim[name] : settings[name]; });
      playing.at = next[0];
      playing.set = next[1];
      playing.blend = next[2];
    }
    if (playing.step < 0) return wrote;
    writeStep(settings, theme, date, t, keep);
    return true;
  }

  // The step playing, `t` seconds into its sequence.
  function writeStep(settings, theme, date, t, keep) {
    const mix = playing.blend > 0 ? smoothstep((t - playing.at) / playing.blend) : 1;
    const goal = playing.set === 'theme' ? themeBlend(theme, date) : { from: playing.set, to: playing.set, mix: 0 };
    TOUCHED.forEach(function (name) {
      const a = valueOf(name, goal.from);
      const b = a + (valueOf(name, goal.to) - a) * goal.mix;
      put(settings, name, playing.from[name] + (b - playing.from[name]) * mix, keep);
    });
  }

  // Writes a theme into the live settings, or the day's blend of two when `theme` is 'auto', and plays the boot
  // sequence `settings.sequence` names on top of it. The music (`settings.musicPlayback`) takes the theme's place
  // while it holds the clock, and Theme Settings' Colour (`settings.themeColor`) stops the clock 'auto' reads. The
  // theme only writes when it or its blend has moved, and then only the settings it moves, so a value set by hand
  // survives until the theme moves that very setting; one locked in `keep` (a Set of names, the particle panel's
  // locks) survives that too, and once it is back to what was last written - Reset puts that back - it catches up at
  // once. Returns who wrote, 'theme', 'music' or 'sequence', or false when nothing did.
  window.applyParticleTheme = function applyParticleTheme(settings, theme, date, keep) {
    if (!base) {
      base = {};
      TOUCHED.forEach(function (name) { base[name] = settings[name]; });
    }
    const now = clockOf(date);
    followScene(settings, now);
    if (playSequence(settings, theme, date, keep)) return 'sequence';
    if (playing) return false;

    const writer = music === 'off' ? 'theme' : 'music';
    const c = layerGoal(settings, theme, date);
    const pair = c.from + '>' + c.to;
    const step = Math.round(c.mix * 500) / 500;
    const moved = pair !== appliedPair || step !== appliedMix;
    if (!moved && !fade) return catchUp(settings, keep) && writer;
    appliedPair = pair;
    appliedMix = step;

    // A change of set eases in from where the parameters stood, on qgl_base's smoothstep (0x1e8c8).
    const k = fade ? smoothstep((now - fade.start) / fade.seconds) : 1;
    let wrote = false;
    TOUCHED.forEach(function (name) {
      const a = valueOf(name, c.from);
      const b = a + (valueOf(name, c.to) - a) * step;
      if (put(settings, name, k < 1 ? fade.from[name] + (b - fade.from[name]) * k : b, keep)) wrote = true;
    });
    if (k >= 1) fade = null;
    return (moved || wrote) && writer;
  };
})();
