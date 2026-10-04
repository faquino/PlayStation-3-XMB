'use strict';
// The scene's parameter sets: how each firmware override/<set>/PARTICLES.mnu, LINE1.mnu, HDR.mnu and BACKGROUND.mnu
// differs from the base one, and the blend that walks the day, the boot sequences, the music and the scene's clock,
// which put them into the particles' and the wave's settings. Read at load by `particles-settings.js`, applied from
// `index.html`, which also hands the backdrop (`spline.js`) the clock and both layers the scene's fade.

// The particle side. Some numbered sets repeat there: welcome_2's particles equal welcome_1's, coldboot2's equal
// coldboot1's, and gameboot4 is gameboot3 with `global alpha` 0, like black is music with it - so the repeats are
// left out. The numbering is a sequence, not a duplicate: those sets differ from each other in `LINE1.mnu`,
// `BACKGROUND.mnu` and `HDR.mnu`.
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

// The wave's side, LINE1.mnu, then HDR.mnu and BACKGROUND.mnu, which the passes after the wave read (`postprocess.js`),
// under the same names: `music` is music_1, `coldboot` coldboot1, `gameboot` gameboot3 and `welcome` welcome_1, whose
// LINE1.mnu welcome_2 repeats, as day's does too. THINNESS is 1 in every set. The day's sets share the base
// BACKGROUND.mnu's colours, and day's HDR.mnu is the base one; night's HDR.mnu is black's and gameboot2's too. The base
// BACKGROUND.mnu leaves out the backdrop's day and night parameters, so the code's defaults stand for them, and the
// sets that leave them out too (music_1, black, gameboot2) keep those.
window.WAVE_THEMES = {
  yoake: {
    spacing: 407.671, brightness: 1.12108, mipmapBias: 1.86511, fresnel: 0.463044, falloff: 0.294154, timestep: 2,
    perturbation: 0.1, posX: -8.2, ffdScale2X: 3.2, ffdScale2Y: 1.27473, ffdScale2Z: 2.88939, ffdParam1: -1.34164,
    exposure: 1.1, whiteLevel: 0.999878, glareLevel: 1.5, glareThresh: 0.8, gaussianRadR: 1.23638,
    gaussianRadG: 1.43047, gaussianRadB: 1.55683, glareSumPow: 0.5,
    nightBlend: 0.499947, night2dayBegin: 0, night2dayEnd: 5.16611, day2nightBegin: 18.498, day2nightEnd: 20.3312,
    dayspread: 2.68038, nightWhitBias: 0.486059,
  },
  day: {
    timestep: 2, posX: -8.2, ffdScale2X: 3.2,
    nightBlend: 0.499947, night2dayBegin: 0, night2dayEnd: 5.16611, day2nightBegin: 18.498, day2nightEnd: 20.3312,
    dayspread: 2.68038, nightWhitBias: 0.486059,
  },
  higure: {
    spacing: 408.298, brightness: 1.06, mipmapBias: 1.75802, fresnel: 0.501002, falloff: 0.048, timestep: 2,
    perturbation: 0.1, posX: -8.2, ffdScale2X: 3.2, ffdScale2Y: 1.2, ffdScale2Z: 3, ffdParam1: -1.83395,
    exposure: 1.2, whiteLevel: 0.999878, glareLevel: 1.1, glareThresh: 0.8, gaussianRadR: 1.1, gaussianRadG: 1.36,
    gaussianRadB: 1.5, glareSumPow: 0.5,
    nightBlend: 0.499947, night2dayBegin: 0, night2dayEnd: 5.16611, day2nightBegin: 18.498, day2nightEnd: 20.3312,
    dayspread: 2.68038, nightWhitBias: 0.486059,
  },
  night: {
    spacing: 408.298, brightness: 0.9, mipmapBias: 1.75802, fresnel: 0.52, falloff: 0.048, timestep: 2,
    perturbation: 0.1, posX: -8.2, angRot: 10, ffdScale2X: 3.2, ffdScale2Y: 1.2, ffdScale2Z: 3, ffdParam1: -1.83395,
    exposure: 1.41, whiteLevel: 0.999878, glareLevel: 1.33, glareThresh: 0.699812, gaussianRadR: 1.1,
    gaussianRadG: 1.36, gaussianRadB: 1.5, glareSumPow: 0.5,
    nightBlend: 0.499947, night2dayBegin: 0, night2dayEnd: 5.16611, day2nightBegin: 18.498, day2nightEnd: 20.3312,
    dayspread: 2.68038, nightWhitBias: 0.486059,
  },
  music: {
    timestep: 3.72102, posX: -7.5, posY: 0, posZ: -5.2, angY: 0.796751, angZ: 0.190364, angRot: 13.1208,
    ffdScale1X: 5.13725, ffdScale2X: 3.2, ffdScale2Y: 0.99579, ffdScale2Z: 3.41782,
    exposure: 1.51, whiteLevel: 0.999878, glareLevel: 2.46, glareThresh: 0.260814, gaussianRadR: 2, gaussianRadG: 2.2,
    gaussianRadB: 2.5, glareSumPow: 0.738001,
    colour1Red: 0.579004, colour1Green: 0.435001, colour1Blue: 0.472, colour2Red: 0, colour2Green: 0, colour2Blue: 0,
    colour3Red: 1.2, colour3Green: 1, colour3Blue: 1.1, colour4Red: 0.5, colour4Green: 0, colour4Blue: 0.5,
    colourShader: 1,
  },
  black: {
    damping: 0.0003, spacing: 402.611, brightness: 0.506754, mipmapBias: 2.72688, fresnel: 1.05552, falloff: 2.27705,
    perturbation: 0.1, ffdScale1Y: 1.01926, ffdScale2Y: 1.94378, ffdScale2Z: 1.99926, ffdParam1: -0.908607,
    exposure: 1.41, whiteLevel: 0.999878, glareLevel: 1.33, glareThresh: 0.699812, gaussianRadR: 1.1,
    gaussianRadG: 1.36, gaussianRadB: 1.5, glareSumPow: 0.5,
    colour1Red: 0, colour1Green: 0, colour1Blue: 0, colour2Red: 0, colour2Green: 0, colour2Blue: 0,
    colour3Red: 0, colour3Green: 0, colour3Blue: 0, colour4Red: 0, colour4Green: 0, colour4Blue: 0,
  },
  // The cold boot starts black: coldboot1's colours put the backdrop at a five-hundredth and the wave at nothing.
  coldboot: {
    spacing: 357.46, brightness: 0.512099, mipmapBias: 1.90518, fresnel: 2, falloff: 0.900768, timestep: 2,
    perturbation: 0, posZ: -7, ffdScale2Y: 0.999999, ffdScale2Z: 2.85341, ffdParam1: -2,
    exposure: 1.64, whiteLevel: 1, glareLevel: 1.74, glareThresh: 0.2,
    colour1Red: 0.0021302, colour1Green: 0.00213025, colour1Blue: 0.00213032, colour2Red: 0.00213051,
    colour2Green: 0.00213051, colour2Blue: 0.00213082,
    colour3Red: 0, colour3Green: 0, colour3Blue: 0, colour4Red: 0, colour4Green: 0, colour4Blue: 0,
    day2nightBegin: 18.498, day2nightEnd: 24, dayspread: 2.73593, nightWhitBias: 0.513834,
  },
  gameboot: {
    brightness: 0, fresnel: 0, timestep: 2, posZ: -2.40287,
    exposure: 1, whiteLevel: 1, glareLevel: 1, glareThresh: 1, gaussianRadR: 1.1, gaussianRadG: 1.36,
    gaussianRadB: 1.5, glareSumPow: 0.5,
    colour1Red: 0, colour1Green: 0, colour1Blue: 0, colour2Red: 0, colour2Green: 0, colour2Blue: 0,
    colour3Red: 0, colour3Green: 0, colour3Blue: 0, colour4Red: 0, colour4Green: 0, colour4Blue: 0,
    nightBlend: 0, dayspread: 1, nightWhitBias: 0.513834,
  },
  // Its HDR.mnu also changes the flags the page leaves out: TEX SIZE and TEX MAX MIP 7, TONEBEFORE 0, BLUR 1.
  welcome: {
    timestep: 2, posX: -8.2, ffdScale2X: 3.2,
    exposure: 3.40362, whiteLevel: 1000, glareLevel: 100, glareThresh: 100, gaussianRadR: 2.9, gaussianRadG: 2.9,
    gaussianRadB: 2.9, glareSumPow: 100,
    colour1Red: 0.343163, colour1Green: 1.15655, colour1Blue: 10, colour2Red: 0.440692, colour2Green: 1.81381,
    colour2Blue: 10, colour3Red: 0.557667, colour3Green: 0.624199, colour3Blue: 0.859806, colour4Red: 0.774938,
    colour4Green: 1.81381, colour4Blue: 0.696515,
    colourShader: 1, nightBlend: 0.499947, night2dayBegin: 0, night2dayEnd: 5.16611, day2nightBegin: 18.498,
    day2nightEnd: 20.3312, nightWhitBias: 0.486059,
  },
};

window.PARTICLE_THEME_OPTIONS = [
  { value: 'base', label: 'Base (no override)' },
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
  // the notes): each step puts a set into every layer at a time into the sequence, from wherever the parameters stand
  // (0x39728). 'theme' is the set `theme` gives, the day cycle's on 'auto'. A step blends over its `seconds` along
  // qgl_base's blend mode 2, a smoothstep, where the scene leaves the mode (0x1e8c8) - bar the cold boot's first 4 s,
  // under mode 1, where each frame takes the parameters `approach` of the way to the set, which the page does at the
  // console's 60 frames a second. A launch ends as the content takes the screen, and the XMB then comes back through
  // its start, as the console's does when the content quits.
  const SEQUENCES = {
    // anim_coldboot2, which event 1 starts. BootBG2 at 0 starts the wave's lines afresh, which `spline.js` does as the
    // sequence starts, puts coldboot1 in at once and coldboot2 under mode 1; NormalBG2 at 4 s puts mode 2 back and the
    // cycle's set in over 7.5 s. Those 7.5 s are never run out: ShowGUI lets go of the scene's clock at 5.5 s, and its
    // next tick stops the sequence and puts the cycle's set in over a second from where the parameters stand (0x11600,
    // 0x39d6c), so the sequence ends on that tick (`onTick`). The scene starts in black, and coldboot1 is black too for
    // the particles bar `emit vel mul`.
    coldboot: {
      steps: [
        { at: 0, set: 'coldboot', seconds: 0 },
        { at: 0, set: 'coldboot2', approach: 0.01 },
        { at: 4, set: 'theme', seconds: 7.5 },
      ],
      onTick: true,
      next: 'none',
    },
    // anim_gameboot, event 2: BG2 at 0, gameboot2 over 0.25 s; BG3 at 0.5 s, gameboot3 over 1.25 s; the game takes
    // the screen at 2.8 s.
    gameboot: {
      steps: [{ at: 0, set: 'gameboot2', seconds: 0.25 }, { at: 0.5, set: 'gameboot', seconds: 1.25 }],
      end: 2.8,
      next: 'coldboot',
    },
    // anim_otherboot, event 3: BG3 at 0, gameboot3 over 0.2 s; BG4 at 0.2 s, gameboot4 over 0.3 s; the content takes
    // the screen at 0.5 s.
    otherboot: {
      steps: [{ at: 0, set: 'gameboot', seconds: 0.2 }, { at: 0.2, set: 'gameboot4', seconds: 0.3 }],
      end: 0.5,
      next: 'coldboot',
    },
  };
  const FRAME_HZ = 60;
  // ShowGUI, 5.5 s into the XMB's start, lets go of the scene's clock, which the start holds (0x11c58); the clock's
  // next tick ends the start.
  const BOOT_CLOCK_HOLD = 5.5;
  // As it begins, the XMB's start hands the backdrop 10:00 of the day, over 7.5 s (BootBG2, 0x110dc).
  const BOOT_HOUR = 10;
  const BOOT_EASE = 7.5;

  // The music: the music player's visualizer starts and stops it through an interface the scene builds for it
  // (0x3408), whose calls have the scene send itself event 4 (0x16808, 0x1672c). Starting puts music_1 in over 5.5 s
  // (0x16198); then the visualizer hands the scene its visualization, 0 for the XMB's own scene, and a new one puts
  // music_1 in again over 2 s from where the parameters stand (0x37c8, 0x16a68) - VISUALIZER_DELAY after the start in
  // the capture of the music coming in, whose backdrop changed its program that long before the 2 s began. Stopping
  // puts in the set with an empty name, the base as the name reads, over 5.5 s, and when those 5.5 s are up lets the
  // clock go (0x15694, 0x10658); until then the clock is held (0x11c58), so the hour does not move the scene. Stopping
  // also forgets the visualization (0x1672c), so the next start takes the 2 s again.
  const MUSIC_IN = 5.5;
  const MUSIC_OUT = 5.5;
  const VISUALIZER_IN = 2;
  const VISUALIZER_DELAY = 0.09;
  // The scene's clock ticks every second and puts the moment it shows in over 1 s (0x12284), and Theme Settings'
  // Colour puts its own in over 1 s too (sub-event 6).
  const TICK = 1;

  // The settings whose parameter is a whole number, which a set puts in at once rather than blending (the parameter's
  // own blend does nothing, 0x1de90): COLOUR SHADER. A frame capture of the music coming in has its program changed
  // 15% of the way into the set's crossfade.
  const WHOLE = { colourShader: true };

  // The settings whose parameter a set can take outside its range, which the scene holds it to whenever it sets it
  // (0x1dd78, which every blend calls): DAYSPREAD, registered with a default of 0 below its range of 1 to 3 (0x23a54),
  // so the sets that leave it out - the base, the music's, black - hold it at 1, as a capture of the music's way out
  // reads. A blend runs from the value held towards the set's own and holds each step.
  const RANGES = { dayspread: [1, 3] };
  function held(name, value) {
    const range = RANGES[name];
    return range ? Math.min(range[1], Math.max(range[0], value)) : value;
  }

  // A layer of the scene: its sets, the settings they write, and its own state - the firmware defaults, taken before
  // the first write; what the theme or the sequence last wrote into each setting and what it would write now, which
  // differ only where a setting was locked when they moved it; and where each stood as the last change of set and
  // the last step of a sequence began.
  function createLayer(themes, sequenceSets) {
    const keys = [];
    [themes, sequenceSets].forEach(function (table) {
      Object.keys(table).forEach(function (set) {
        Object.keys(table[set]).forEach(function (name) {
          if (keys.indexOf(name) === -1) keys.push(name);
        });
      });
    });
    return { themes, sequenceSets, keys, base: null, written: {}, aim: {}, fadeFrom: {}, stepFrom: {} };
  }

  // Each layer's sets, and the ones only a sequence puts in. On the particle side gameboot2 carries no PARTICLES.mnu,
  // so the base particles stand in for it, coldboot2's are coldboot1's, and gameboot4 is gameboot3 with `global
  // alpha` 0. The wave's coldboot2 is day's LINE1.mnu again, with the base HDR.mnu and BACKGROUND.mnu; gameboot2 and
  // gameboot4 carry night's HDR.mnu, and colours that dim the backdrop and take the wave away, then both.
  const LAYERS = {
    particles: createLayer(window.PARTICLE_THEMES, {
      coldboot2: window.PARTICLE_THEMES.coldboot,
      gameboot2: {},
      gameboot4: Object.assign({}, window.PARTICLE_THEMES.gameboot, { globalAlpha: 0 }),
    }),
    wave: createLayer(window.WAVE_THEMES, {
      coldboot2: window.WAVE_THEMES.day,
      gameboot2: {
        timestep: 2, posZ: -4.40287,
        exposure: 1.41, whiteLevel: 0.999878, glareLevel: 1.33, glareThresh: 0.699812, gaussianRadR: 1.1,
        gaussianRadG: 1.36, gaussianRadB: 1.5, glareSumPow: 0.5,
        colour1Red: 0.8, colour1Green: 0.8, colour1Blue: 0.8, colour2Red: 0.8, colour2Green: 0.8, colour2Blue: 0.8,
        colour3Red: 0, colour3Green: 0, colour3Blue: 0, colour4Red: 0, colour4Green: 0, colour4Blue: 0,
      },
      gameboot4: {
        spacing: 408.299, brightness: 1.06, mipmapBias: 1.75802, fresnel: 0.501002, falloff: 0.048,
        perturbation: 0.1, ffdScale2Y: 1.2, ffdScale2Z: 3, ffdParam1: -1.83395,
        exposure: 1.41, whiteLevel: 0.999878, glareLevel: 1.33, glareThresh: 0.699812, gaussianRadR: 1.1,
        gaussianRadG: 1.36, gaussianRadB: 1.5, glareSumPow: 0.5,
        colour1Red: 0, colour1Green: 0, colour1Blue: 0, colour2Red: 0, colour2Green: 0, colour2Blue: 0,
        colour3Red: 0, colour3Green: 0, colour3Blue: 0, colour4Red: 0, colour4Green: 0, colour4Blue: 0,
        nightBlend: 0, dayspread: 1, nightWhitBias: 0.513834,
      },
    }),
  };
  // The settings a theme or a sequence can write, which each panel lets a value set by hand be locked on.
  window.PARTICLE_THEME_KEYS = LAYERS.particles.keys.slice();
  window.WAVE_THEME_KEYS = LAYERS.wave.keys.slice();

  // The scene's own state, shared by its layers.
  let appliedPair = null;
  let appliedMix = -1;
  let playing = null; // the sequence playing: its name, when it started, and the step it is on
  let music = 'off'; // 'in' while music_1 is in, 'out' while the base goes in after the music stops
  let musicStopped = 0; // when it stopped, in seconds
  let visualization = -1; // the visualization the scene was last handed, -1 for none (0x9c930)
  let visualizerAt = null; // when the visualizer's call reaches the scene, while one is on its way
  let playback = 'stopped';
  let lastColor = '0'; // the colour Theme Settings held last time
  let fade = null; // a change of set on its way: when it started, and how long it takes

  // Writes a value the theme or the sequence has for a setting, if it moves the setting: one it leaves where it was
  // keeps whatever it holds, a value set by hand included, and one locked in the layer's `keep` is left alone either
  // way. Returns true when it wrote.
  function put(layer, name, raw) {
    const L = layer.state;
    const value = held(name, raw);
    L.aim[name] = value;
    if (layer.keep && layer.keep.has(name)) return false;
    if (name in L.written && L.written[name] === value) return false;
    layer.settings[name] = value;
    L.written[name] = value;
    return true;
  }

  // A setting that was locked and is back to what was last written into it - Reset puts that back - catches up with
  // what the theme or the sequence has for it now. Returns true when it wrote.
  function catchUp(layer) {
    const L = layer.state;
    let wrote = false;
    L.keys.forEach(function (name) {
      if (!(name in L.aim) || L.aim[name] === L.written[name] || layer.settings[name] !== L.written[name]) return;
      if (layer.keep && layer.keep.has(name)) return;
      layer.settings[name] = L.aim[name];
      L.written[name] = L.aim[name];
      wrote = true;
    });
    return wrote;
  }

  // Where each setting stands: where the theme or the sequence had it, not where a value set by hand holds it.
  function standing(layer) {
    const L = layer.state;
    const at = {};
    L.keys.forEach(function (name) { at[name] = name in L.aim ? L.aim[name] : layer.settings[name]; });
    return at;
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

  // A setting's value in one of the layer's sets; 'base', and any set that leaves the setting out, give the default.
  function valueOf(L, name, set) {
    const values = L.sequenceSets[set] || L.themes[set];
    return values && name in values ? values[name] : L.base[name];
  }

  // A setting's value in what a goal asks for: one set, or `mix` of the way from one to another.
  function goalValue(L, name, goal) {
    if (WHOLE[name]) return valueOf(L, name, goal.mix > 0 ? goal.to : goal.from);
    const a = valueOf(L, name, goal.from);
    return a + (valueOf(L, name, goal.to) - a) * goal.mix;
  }

  // Where a setting stands `k` of the way from `from` to `to`: a whole number is at `to` from the start.
  function between(name, from, to, k) {
    return WHOLE[name] ? to : from + (to - from) * k;
  }

  // What `theme` asks for now: one set, or on 'auto' the day's blend of two, `mix` of the way from one to the other.
  function themeBlend(theme, date) {
    if (theme !== 'auto') return { from: theme, to: theme, mix: 0 };
    return dayCycle(date || new Date());
  }

  // The moment the scene shows: the clock's, or, while Theme Settings' Colour holds a month, noon on the 1st of that
  // month (0x11c58), which stops it. The backdrop is handed it on the clock's ticks - see `xmbBackdropMoment`.
  window.xmbSceneDate = function xmbSceneDate(color, date) {
    const now = date || new Date();
    const month = Math.round(Number(color)) || 0;
    if (month < 1 || month > 12) return now;
    return new Date(now.getFullYear(), month - 1, 1, 12, 0, 0);
  };

  // The moment last handed to the backdrop (0x10900, through 0x1adc8 and 0x1b090), how long it takes to ease in, and
  // a count of the hand-overs. The scene's clock hands it the moment it shows on each of its ticks, a second apart
  // (0x12284, 0x11c58), over a second, but not while something holds the clock: the XMB's start until ShowGUI, a
  // content's boot, or the music while its set is in or on its way out. The XMB's start hands it 10:00 of the day
  // over 7.5 s as it begins (BootBG2) - the cold boot's captures read the backdrop's clocks at 10:00 3.9 s in, and the
  // hour 7.5 s in. The page's first frame hands the moment at once, as if the XMB had been running.
  let handed = null;
  let lastTick = null;
  let bootHanded = null;
  window.xmbBackdropMoment = function xmbBackdropMoment(scene, date) {
    const now = clockOf(date);
    const tick = Math.floor(now);
    const at = date || new Date();
    function hand(moment, seconds) {
      handed = { date: moment, seconds: seconds, serial: handed ? handed.serial + 1 : 0 };
    }
    if (playing && playing.name === 'coldboot' && bootHanded !== playing.start) {
      bootHanded = playing.start;
      hand(new Date(at.getFullYear(), at.getMonth(), at.getDate(), BOOT_HOUR, 0, 0), BOOT_EASE);
    } else if (!handed) {
      hand(window.xmbSceneDate(scene.themeColor, date), 0);
    } else if (tick !== lastTick && !clockHeld(now)) {
      hand(window.xmbSceneDate(scene.themeColor, date), TICK);
    }
    lastTick = tick;
    return handed;
  };

  // Whether something holds the scene's clock, so that its ticks do nothing (0x11c58).
  function clockHeld(now) {
    if (music !== 'off') return true;
    if (!playing) return false;
    return playing.name !== 'coldboot' || now - playing.start < BOOT_CLOCK_HOLD;
  }

  // Event 0 of the scene's interface, as the XMB sends it and the scene's handler (0x15330) turns it into the grey the
  // scene fades to and how long it takes, which one call hands the particles' _Color and the wave's renderer alike
  // (0x1afdc). Theme Settings' Brightness (sub-event 7) sets the scene's brightness to 1 - BRIGHTNESS_STEP x its
  // level, 0 to BRIGHTNESS_LEVEL_MAX, and fades to it over BRIGHTNESS_SEC; the background given away (sub-event 3)
  // fades to black, and taken back (sub-event 2) to the brightness, over the milliseconds sent with it, which
  // `backgroundFadeMs` stands for. Returns the fade last sent, with a count of them, or null before the first.
  const BRIGHTNESS_STEP = 0.15;
  const BRIGHTNESS_LEVEL_MAX = 5;
  const BRIGHTNESS_SEC = 1;
  let sent = null;
  let brightness = 1; // the scene's, 1 until Theme Settings sets it (0x4050, 0xa03bc)
  let brightnessLevel = 0;
  let backgroundHidden = false;
  window.xmbSceneFade = function xmbSceneFade(scene) {
    function send(target, seconds) {
      sent = { target: target, seconds: seconds, serial: sent ? sent.serial + 1 : 0 };
    }
    const level = Math.max(0, Math.min(BRIGHTNESS_LEVEL_MAX, Math.round(Number(scene.themeBrightness) || 0)));
    if (level !== brightnessLevel) {
      brightnessLevel = level;
      brightness = 1 - BRIGHTNESS_STEP * level;
      send(brightness, BRIGHTNESS_SEC);
    }
    const hidden = scene.xmbBackground === 'hidden';
    if (hidden !== backgroundHidden) {
      backgroundHidden = hidden;
      send(hidden ? 0 : brightness, Math.max(0, Number(scene.backgroundFadeMs) || 0) / 1000);
    }
    return sent;
  };

  // What the theme asks for now: music_1 while the music is in, the base while it goes out, and otherwise what
  // `theme` gives at the moment the scene's clock shows.
  function sceneGoal(scene, date) {
    if (music === 'in') return { from: 'music', to: 'music', mix: 0 };
    if (music === 'out') return { from: 'base', to: 'base', mix: 0 };
    return themeBlend(scene.theme, window.xmbSceneDate(scene.themeColor, date));
  }

  // Seconds, on `date` when one is given and on the page's clock otherwise.
  function clockOf(date) {
    return (date ? date.getTime() : typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  // Sets every layer off towards what the theme asks for, over `seconds`, from wherever its parameters stand.
  function startFade(layers, now, seconds) {
    layers.forEach(function (layer) { layer.state.fadeFrom = standing(layer); });
    fade = { start: now, seconds: seconds };
  }

  // Follows the music and Theme Settings' Colour as the scene's settings name them. Music starting again while the
  // base goes in puts music_1 back, as the console's does; a colour picked while the music holds the clock comes in
  // when it lets go.
  function followScene(scene, layers, now) {
    const wanted = scene.musicPlayback === 'playing' ? 'playing' : 'stopped';
    if (wanted !== playback) {
      playback = wanted;
      if (wanted === 'playing' && music !== 'in') {
        music = 'in';
        startFade(layers, now, MUSIC_IN);
        visualizerAt = now + VISUALIZER_DELAY;
      } else if (wanted === 'stopped' && music === 'in') {
        music = 'out';
        musicStopped = now;
        startFade(layers, now, MUSIC_OUT);
        visualization = -1;
        visualizerAt = null;
      }
    }
    if (visualizerAt !== null && now >= visualizerAt) {
      visualizerAt = null;
      if (visualization !== 0) {
        visualization = 0;
        startFade(layers, now, VISUALIZER_IN);
      }
    }
    if (music === 'out' && now - musicStopped >= MUSIC_OUT) {
      music = 'off';
      startFade(layers, now, TICK); // the clock's next tick, which the page takes at once
    }
    const pinned = String(scene.themeColor || '0');
    if (pinned !== lastColor) {
      lastColor = pinned;
      if (music === 'off') startFade(layers, now, TICK);
    }
  }

  // When the sequence playing is over: at its `end`, or, for the XMB's start, on the scene clock's first tick once
  // ShowGUI has let go of it - the tick `xmbBackdropMoment` hands the backdrop the moment on, at a whole second.
  function sequenceEnd(p) {
    const seq = SEQUENCES[p.name];
    return seq.onTick ? Math.ceil(p.start + BOOT_CLOCK_HOLD) : p.start + seq.end;
  }

  // Plays the sequence `scene.sequence` names, and hands over to the next one, or to the theme, when it is over.
  // Returns true when it wrote, the hand-over into `scene.sequence` included.
  function playSequence(scene, layers, date, now) {
    let wrote = false;
    for (;;) {
      const wanted = SEQUENCES[scene.sequence] ? scene.sequence : null;
      if (wanted !== (playing && playing.name)) {
        // Handing back to the theme, the clock's next tick puts the moment it shows in over a second: the cold boot
        // reads the clock whatever the colour (0x11b20), so a colour comes in only then.
        if (!wanted && playing) startFade(layers, now, TICK);
        playing = wanted ? { name: wanted, start: now, step: -1 } : null;
        appliedPair = null; // the theme writes again when the sequence is over
      }
      if (!playing) return wrote;
      if (now < sequenceEnd(playing)) break;
      scene.sequence = SEQUENCES[playing.name].next;
      wrote = true;
    }

    // A step starts from where the one before it stood at the step's own time, whenever the next frame comes: where
    // the sequence had it, not where a value set by hand holds it.
    const seq = SEQUENCES[playing.name];
    const t = now - playing.start;
    while (playing.step + 1 < seq.steps.length && t >= seq.steps[playing.step + 1].at) {
      const next = seq.steps[++playing.step];
      layers.forEach(function (layer) {
        if (playing.step > 0) writeStep(layer, scene.theme, date, next.at);
        layer.state.stepFrom = standing(layer);
      });
      playing.current = next;
    }
    if (playing.step < 0) return wrote;
    layers.forEach(function (layer) { writeStep(layer, scene.theme, date, t); });
    return true;
  }

  // The step playing, `t` seconds into its sequence.
  function writeStep(layer, theme, date, t) {
    const step = playing.current;
    const since = t - step.at;
    let mix = 1;
    if (step.approach) mix = 1 - Math.pow(1 - step.approach, since * FRAME_HZ);
    else if (step.seconds > 0) mix = smoothstep(since / step.seconds);
    const goal = step.set === 'theme' ? themeBlend(theme, date) : { from: step.set, to: step.set, mix: 0 };
    const L = layer.state;
    L.keys.forEach(function (name) {
      const b = goalValue(L, name, goal);
      const from = name in L.stepFrom ? L.stepFrom[name] : b;
      put(layer, name, between(name, from, b, mix));
    });
  }

  // Writes the theme into each layer's live settings, or the day's blend of two when `scene.theme` is 'auto', and
  // plays the boot sequence `scene.sequence` names on top of it. `scene` is the settings that hold the scene's state -
  // the theme, the sequence, the music (`musicPlayback`), which takes the theme's place while it holds the clock, and
  // Theme Settings' Colour (`themeColor`), which stops the clock 'auto' reads. `layers` names each layer's settings
  // and the Set of names locked on it (`keep`, its panel's locks): `particles` and `wave`.
  //
  // The theme only writes when it or its blend has moved, and then only the settings it moves, so a value set by hand
  // survives until the theme moves that very setting; one locked survives that too, and once it is back to what was
  // last written - Reset puts that back - it catches up at once. Returns, for each layer, who wrote - 'theme',
  // 'music' or 'sequence' - or false when nothing did.
  window.applySceneThemes = function applySceneThemes(scene, layers, date) {
    const active = [];
    Object.keys(layers).forEach(function (name) {
      const L = LAYERS[name];
      const given = layers[name];
      if (!L || !given || !given.settings) return;
      if (!L.base) {
        L.base = {};
        L.keys.forEach(function (key) { L.base[key] = given.settings[key]; });
      }
      active.push({ name: name, state: L, settings: given.settings, keep: given.keep || null });
    });
    const result = {};
    const now = clockOf(date);
    followScene(scene, active, now);
    if (playSequence(scene, active, date, now)) {
      active.forEach(function (layer) { result[layer.name] = 'sequence'; });
      return result;
    }
    if (playing) {
      active.forEach(function (layer) { result[layer.name] = false; });
      return result;
    }

    const writer = music === 'off' ? 'theme' : 'music';
    const goal = sceneGoal(scene, date);
    const pair = goal.from + '>' + goal.to;
    const mix = Math.round(goal.mix * 500) / 500;
    const moved = pair !== appliedPair || mix !== appliedMix;
    appliedPair = pair;
    appliedMix = mix;

    // A change of set eases in from where the parameters stood, on qgl_base's smoothstep (0x1e8c8).
    const k = fade ? smoothstep((now - fade.start) / fade.seconds) : 1;
    const settled = { from: goal.from, to: goal.to, mix: mix };
    active.forEach(function (layer) {
      if (!moved && !fade) {
        result[layer.name] = catchUp(layer) && writer;
        return;
      }
      const L = layer.state;
      let wrote = false;
      L.keys.forEach(function (name) {
        const b = goalValue(L, name, settled);
        const from = name in L.fadeFrom ? L.fadeFrom[name] : b;
        if (put(layer, name, k < 1 ? between(name, from, b, k) : b)) wrote = true;
      });
      result[layer.name] = (moved || wrote) && writer;
    });
    if (k >= 1) fade = null;
    return result;
  };
})();
