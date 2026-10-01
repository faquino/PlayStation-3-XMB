'use strict';
// The backdrop's and the wave's settings: LINE1.mnu's parameters under their own names, with the firmware's values.
// Read by `spline.js` and `wave-reverse.js`, and shown by `settings-panels.js`; declarative only, no runtime logic.

window.SPLINE_SETTINGS = {
  gradientPreset: 'auto',

  colorR: 37,
  colorG: 89,
  colorB: 179,

  gradientTopMul: 0.09,
  gradientBotMul: 0.62,

  // LINE1.mnu, the base set. The keys are its parameters' names in camelCase.
  damping: 0.0001,
  length: 0.306001,
  tension: 0.25,
  timestep: 4,
  perturbation: 0.0998587,
  endX: 3,
  endY: 0.4,
  endZ: 0.2,
  posX: -7.67933,
  posY: -1.08844,
  posZ: -6.40287,
  angX: -0.994157,
  angY: 0.0867576,
  angZ: 0.065364,
  angRot: 18.1208,
  ffdScale1X: 5.67726,
  ffdScale1Y: 1.00077,
  ffdScale1Z: 1,
  ffdScale2X: 2.82755,
  ffdScale2Y: 1.27579,
  ffdScale2Z: 2.88782,
  ffdOffsetX: 0,
  ffdOffsetY: -0.469999,
  ffdOffsetZ: 0,
  ffdParam1: -1.33509,
  brightness: 0.701917,
  mipmapBias: 1.86707,
  fresnel: 0.638971,
  falloff: 1.00318,
  spacing: 407.658,
  thinness: 1,

  // Modelled: what the console's passes after the wave make of its light.
  exposure: 1.5,
};

window.SPLINE_SETTINGS_META = {
  gradientPreset: {
    type: 'select',
    options: window.BG_GRADIENT_PRESET_OPTIONS || [{ value: 'default', label: 'Original (RGB Sliders)' }],
    help: "Colours of the backdrop: Auto walks the months' gradients with the date and the time of day, a month " +
      'picks one of them, and the original preset uses the RGB sliders below.\n' +
      'Backdrop: BACKGROUND_REVERSE_ENGINEER.md',
  },
  colorR: {
    min: 0, max: 255, step: 1, decimals: 0,
    help: "Red of the backdrop's colour, 0 to 255, for the original (RGB sliders) preset only.\n" +
      'Backdrop, hand-tuned',
  },
  colorG: {
    min: 0, max: 255, step: 1, decimals: 0,
    help: "Green of the backdrop's colour, 0 to 255, for the original preset only.\n" +
      'Backdrop, hand-tuned',
  },
  colorB: {
    min: 0, max: 255, step: 1, decimals: 0,
    help: "Blue of the backdrop's colour, 0 to 255, for the original preset only.\n" +
      'Backdrop, hand-tuned',
  },
  gradientTopMul: {
    min: 0, max: 0.3, step: 0.005,
    help: "Brightness of the backdrop's top edge, as a multiple of its colour (blue gets a fifth more). Original " +
      'preset only.\n' +
      'Backdrop, hand-tuned',
  },
  gradientBotMul: {
    min: 0.2, max: 1.2, step: 0.005,
    help: "Brightness of the backdrop's bottom edge, as a multiple of its colour. Original preset only.\n" +
      'Backdrop, hand-tuned',
  },
  damping: {
    min: 0, max: 0.002, step: 0.00001, decimals: 5,
    help: "How fast the lines lose their speed: each step takes DAMPING x TIMESTEP of each point's velocity off.\n" +
      'LINE1.mnu: DAMPING',
  },
  length: {
    min: 0.05, max: 1, step: 0.001,
    help: "Rest length of the springs between neighbouring points, along a line and across the lines; those two " +
      'apart rest at twice it.\n' +
      'LINE1.mnu: LENGTH',
  },
  tension: {
    min: 0, max: 1, step: 0.005,
    help: 'Stiffness of the springs between neighbouring points; those two apart are ten times as stiff.\n' +
      'LINE1.mnu: TENSION',
  },
  timestep: {
    min: 0, max: 8, step: 0.05,
    help: "Speed of the wave's time: how far each of the 60 steps a second moves the points, the clocks and the " +
      'lattice.\n' +
      'LINE1.mnu: TIMESTEP',
  },
  perturbation: {
    min: 0, max: 0.5, step: 0.001,
    help: "Strength of the noise added to every point's velocity each step.\n" +
      'LINE1.mnu: PERTURBATION',
  },
  endX: {
    min: 0, max: 6, step: 0.05,
    help: 'No effect: the step sets the anchored ends at x = 0 and reads only END Y and END Z.\n' +
      'LINE1.mnu: END X',
  },
  endY: {
    min: 0, max: 2, step: 0.01,
    help: "Height of the anchored ends' swing, line after line along the wave.\n" +
      'LINE1.mnu: END Y',
  },
  endZ: {
    min: 0, max: 2, step: 0.01,
    help: "Depth of the anchored ends' swing.\n" +
      'LINE1.mnu: END Z',
  },
  posX: {
    min: -15, max: 5, step: 0.01,
    help: "Where the wave sits in the XMB's world, across the screen.\n" +
      'LINE1.mnu: POS X',
  },
  posY: {
    min: -5, max: 5, step: 0.01,
    help: "Where the wave sits in the XMB's world, up the screen.\n" +
      'LINE1.mnu: POS Y',
  },
  posZ: {
    min: -15, max: 0, step: 0.01,
    help: "Where the wave sits in the XMB's world, in depth; the camera is at z = 2.\n" +
      'LINE1.mnu: POS Z',
  },
  angX: {
    min: -1, max: 1, step: 0.001,
    help: 'X of the axis the wave is turned about (normalised).\n' +
      'LINE1.mnu: ANG X',
  },
  angY: {
    min: -1, max: 1, step: 0.001,
    help: 'Y of the axis the wave is turned about (normalised).\n' +
      'LINE1.mnu: ANG Y',
  },
  angZ: {
    min: -1, max: 1, step: 0.001,
    help: 'Z of the axis the wave is turned about (normalised).\n' +
      'LINE1.mnu: ANG Z',
  },
  angRot: {
    min: -90, max: 90, step: 0.1,
    help: 'How far the wave is turned about that axis, in degrees.\n' +
      'LINE1.mnu: ANG ROT',
  },
  ffdScale1X: {
    min: 0.5, max: 10, step: 0.01,
    help: "Size of the deformation's lattice along x: the points are normalised by it before they are deformed, " +
      "and the lattice's own points are scaled by it.\n" +
      'LINE1.mnu: FFD SCALE1 X',
  },
  ffdScale1Y: {
    min: 0.1, max: 4, step: 0.01,
    help: "Size of the deformation's lattice along y, and the scale of its moving curve.\n" +
      'LINE1.mnu: FFD SCALE1 Y',
  },
  ffdScale1Z: {
    min: 0.1, max: 4, step: 0.01,
    help: "Size of the deformation's lattice along z.\n" +
      'LINE1.mnu: FFD SCALE1 Z',
  },
  ffdScale2X: {
    min: 0, max: 6, step: 0.01,
    help: 'Scale of the deformed wave along x.\n' +
      'LINE1.mnu: FFD SCALE2 X',
  },
  ffdScale2Y: {
    min: 0, max: 4, step: 0.01,
    help: 'Scale of the deformed wave along y: the height of its swell.\n' +
      'LINE1.mnu: FFD SCALE2 Y',
  },
  ffdScale2Z: {
    min: 0, max: 6, step: 0.01,
    help: 'Scale of the deformed wave along z: its depth.\n' +
      'LINE1.mnu: FFD SCALE2 Z',
  },
  ffdOffsetX: {
    min: -3, max: 3, step: 0.01,
    help: "Where the deformation's lattice starts along x, and the offset of its points.\n" +
      'LINE1.mnu: FFD OFFSET X',
  },
  ffdOffsetY: {
    min: -3, max: 3, step: 0.01,
    help: "Where the deformation's lattice starts along y, and the offset of its points.\n" +
      'LINE1.mnu: FFD OFFSET Y',
  },
  ffdOffsetZ: {
    min: -3, max: 3, step: 0.01,
    help: "Where the deformation's lattice starts along z, and the offset of its points.\n" +
      'LINE1.mnu: FFD OFFSET Z',
  },
  ffdParam1: {
    min: -5, max: 5, step: 0.01,
    help: "Where along the lines their spread settles: the grid sent to the SPU has its height and depth scaled by " +
      '1.3 - cos((x - P) pi/2) (1 - smoothstep((x - P) / 5)), widest near the anchors, 1.3 from five units past P ' +
      'on, and 0.3 before P.\n' +
      'LINE1.mnu: FFD PARAM 1',
  },
  brightness: {
    min: 0, max: 3, step: 0.01,
    help: "Weight of the wave's even light, times the size of each cell on screen.\n" +
      'LINE1.mnu: BRIGHTNESS (lines1.vpo _Brightness)',
  },
  mipmapBias: {
    min: 0, max: 5, step: 0.01,
    help: "Scale of each cell's size on screen, which the light, the fresnel table and the stripes' blur all " +
      'follow.\n' +
      'LINE1.mnu: MIPMAP BIAS (lines1.vpo _MipmapBias)',
  },
  fresnel: {
    min: 0, max: 4, step: 0.01,
    help: "Weight of the wave's rim light, from the fresnel table at the angle it is seen at.\n" +
      'LINE1.mnu: FRESNEL (lines1.vpo _Fresnel)',
  },
  falloff: {
    min: 0, max: 2, step: 0.01,
    help: 'No effect: neither of the programs the wave is drawn with takes it.\n' +
      'LINE1.mnu: FALLOFF',
  },
  spacing: {
    min: 10, max: 800, step: 1, decimals: 0,
    help: 'How many stripes run along the wave, across its lines. They show only with Thinness below 1.\n' +
      'LINE1.mnu: SPACING (lines1.fpo _Spacing)',
  },
  thinness: {
    min: 0, max: 1, step: 0.01,
    help: "How much of each stripe's period is dark. At 1, as in every set, there are no stripes and the wave is " +
      'lit evenly.\n' +
      'LINE1.mnu: THINNESS (lines1.fpo _Thinness)',
  },
  exposure: {
    min: 0, max: 20, step: 0.1,
    help: "How bright the wave's light comes out on screen. The console encodes it (_Encode) and runs it through " +
      'some thirty passes before the particles are drawn, which this stands in for.\n' +
      'Modelled (spline.js)',
  },
};
