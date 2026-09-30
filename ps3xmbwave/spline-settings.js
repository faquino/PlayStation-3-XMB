'use strict';
// Central parameter source for the spline/wave system, including artistic controls and reverse-pipeline tuning knobs.
// Read by `spline.js` and the settings UI in `settings-panels.js`, which shows each meta's `help` as its label's
// tooltip; this file is intentionally declarative (no runtime logic).

window.SPLINE_SETTINGS = {
  gradientPreset: 'auto',

  colorR: 37,
  colorG: 89,
  colorB: 179,

  gradientTopMul: 0.09,
  gradientBotMul: 0.62,

  flowSpeed: 0.18,
  tension: 0.12,
  damping: 0.0001,
  length: 0.306001,
  spacing: 407.658,
  timeStep: 1.0,

  bandAmplitude: 0.200,
  bandSecondaryFreq: 7.0,
  bandSecondaryAmp: 0.025,

  travelSpeed1: 0.25,
  travelAmp1: 0.014,
  travelSpeed2: 0.15,
  travelAmp2: 0.008,

  perturbation: 0.0998587,
  perturbationScale: 0.07,
  waveCosAmp: 0.09,
  waveBias: -0.1,
  waveHeightScale: 0.5,
  waveSoftClip: 0.22,

  rePipelineBlend: 0.45,
  reDescriptorStrength: 0.7,
  reSyntheticDescriptorSeed: 1337,
  reSyntheticDescriptorMotion: 0.65,
  reKernelGain: 0.04,
  reNormalizeGain: 0.08,
  reKernelPhaseStep: 0.45,
  reIndexJitter: 0.006,
  reTemporalSmooth: 0.84,

  fresnelPower: 4.0,
  fresnelScale: 0.5,
  opacity: 0.7,
  brightness: 0.98,
  zDetailScale: 0.08,

  ffdScale1X: 5.67726,
  ffdScale1Y: 1.00077,
  ffdScale1Z: 1.0,
  ffdScale2X: 2.82755,
  ffdScale2Y: 1.27579,
  ffdScale2Z: 2.88782,
  ffdOffsetX: 0.0,
  ffdOffsetY: -0.469999,
  ffdOffsetZ: 0.0,
  ffdYAmp: 0.05,
  ffdZAmp: 0.06,
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
  flowSpeed: {
    min: 0, max: 1.2, step: 0.005,
    help: "Speed of the wave's flow. Almost everything that moves on the wave moves with it; the broad cosine and " +
      "the kernel's lookups do not.\n" +
      'Hand-tuned wave: the shader and the pipeline alike',
  },
  tension: {
    min: 0, max: 0.5, step: 0.005,
    help: 'Height of a long, slow undulation along the wave. It also scales the first travelling wave of the ' +
      'hand-tuned sum, and weights the traced spline table as a synthetic input.\n' +
      'Hand-tuned wave shader; synthetic b300 input to the traced pipeline',
  },
  damping: {
    min: 0, max: 0.002, step: 0.00001,
    help: 'Flattens the broad cosine by this fraction, which the default barely does. It also weights the traced ' +
      'spline table as a synthetic input.\n' +
      'Hand-tuned wave shader; synthetic b300 input to the traced pipeline',
  },
  length: {
    min: 0.05, max: 1.2, step: 0.001,
    help: 'Frequency along the wave of the long undulation and of the ripples. It also weights the traced spline ' +
      'table as a synthetic input.\n' +
      'Hand-tuned wave shader; synthetic b300 input to the traced pipeline',
  },
  spacing: {
    min: 10, max: 800, step: 1, decimals: 0,
    help: 'Frequency of the ripples (Perturbation). It also weights the traced spline table as a synthetic input, ' +
      'divided by 1000.\n' +
      'Hand-tuned wave shader; synthetic b300 input to the traced pipeline',
  },
  timeStep: {
    min: 0.1, max: 4, step: 0.05,
    help: "Speed of the wave's animation, alongside Flow Speed: it scales the same motions except the wobbles, and " +
      'also drives the broad cosine.\n' +
      'Hand-tuned wave: the shader and the pipeline alike',
  },
  bandAmplitude: {
    min: 0, max: 0.6, step: 0.002,
    help: "Height of the main band in the traced pipeline's control points: a sine along the wave that drifts with " +
      'the flow.\n' +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  bandSecondaryFreq: {
    min: 0.5, max: 16, step: 0.1,
    help: "Frequency across the wave's depth of the secondary band in the traced pipeline's control points.\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  bandSecondaryAmp: {
    min: 0, max: 0.12, step: 0.002,
    help: "Height of the secondary band in the traced pipeline's control points.\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  travelSpeed1: {
    min: 0, max: 1.5, step: 0.01,
    help: 'Speed of the first travelling wave of the hand-tuned sum.\n' +
      'Hand-tuned wave sum (spline-reverse.js)',
  },
  travelAmp1: {
    min: 0, max: 0.08, step: 0.001,
    help: 'Height of the first travelling wave of the hand-tuned sum, times Tension.\n' +
      'Hand-tuned wave sum (spline-reverse.js)',
  },
  travelSpeed2: {
    min: 0, max: 1.5, step: 0.01,
    help: 'Speed of the second travelling wave of the hand-tuned sum.\n' +
      'Hand-tuned wave sum (spline-reverse.js)',
  },
  travelAmp2: {
    min: 0, max: 0.08, step: 0.001,
    help: 'Height of the second travelling wave of the hand-tuned sum.\n' +
      'Hand-tuned wave sum (spline-reverse.js)',
  },
  perturbation: {
    min: 0, max: 0.3, step: 0.001,
    help: 'Strength of the ripples over the wave, times Perturbation Scale.\n' +
      'Hand-tuned wave shader and sum (spline.js, spline-reverse.js)',
  },
  perturbationScale: {
    min: 0, max: 0.3, step: 0.001,
    help: "Second factor of the ripples' strength, with Perturbation.\n" +
      'Hand-tuned wave shader and sum (spline.js, spline-reverse.js)',
  },
  waveCosAmp: {
    min: 0, max: 0.3, step: 0.001,
    help: 'Height of the broad cosine that bends the whole wave.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  waveBias: {
    min: -0.3, max: 0.3, step: 0.001,
    help: 'Added to that cosine: raises or lowers the whole wave.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  waveHeightScale: {
    min: 0, max: 1, step: 0.005,
    help: 'Scales everything the shader bends the wave by - the cosine, the undulation and the ripples - before the ' +
      'soft clip.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  waveSoftClip: {
    min: 0.05, max: 0.5, step: 0.005,
    help: 'The most the shader may bend the wave: a smooth limit, so lower flattens its peaks.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  rePipelineBlend: {
    min: 0, max: 1, step: 0.01,
    help: "Mix, for each control point, between the traced pipeline's core (1) and the older hand-tuned sum (0).\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  reDescriptorStrength: {
    min: 0, max: 2, step: 0.01,
    help: "How much the synthetic descriptor's waves weigh against its noise. The descriptor stands in for the " +
      "console's b380 data, never captured, and is only rebuilt when the seed changes.\n" +
      'Synthetic input to the traced pipeline (spline-reverse.js)',
  },
  reSyntheticDescriptorSeed: {
    min: 0, max: 100000, step: 1, decimals: 0,
    help: "Seed of the synthetic descriptor's noise: another seed gives another wave, and rebuilds the descriptor.\n" +
      'Synthetic input to the traced pipeline (spline-reverse.js)',
  },
  reSyntheticDescriptorMotion: {
    min: 0, max: 5, step: 0.05,
    help: "How fast the synthetic descriptor's coefficients drift with the flow.\n" +
      'Synthetic input to the traced pipeline (spline-reverse.js)',
  },
  reKernelGain: {
    min: 0, max: 1, step: 0.005,
    help: "Weight of the traced kernel's output in the pipeline's control points.\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  reNormalizeGain: {
    min: 0, max: 2, step: 0.01,
    help: "Gain before the spline table's traced tanh normalisation: the higher, the more the table saturates.\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  reKernelPhaseStep: {
    min: 0, max: 8, step: 0.05,
    help: "How fast the kernel's lookups into the table, and the blends between them, change with time.\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  reIndexJitter: {
    min: 0, max: 0.5, step: 0.001,
    help: "How far the kernel's lookups wander from their traced indices, as a fraction of the table.\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  reTemporalSmooth: {
    min: 0, max: 0.98, step: 0.01,
    help: "Smoothing of the kernel's output from frame to frame: 0 none, near 1 very slow to change.\n" +
      'Traced pipeline, hand-tuned knob (spline-reverse.js)',
  },
  fresnelPower: {
    min: 0.2, max: 8, step: 0.05,
    help: "Exponent of the fresnel term the wave's glow comes from: the higher, the tighter and more contrasted the " +
      'glow.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  fresnelScale: {
    min: 0, max: 2, step: 0.01,
    help: 'Strength of that fresnel glow.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  opacity: {
    min: 0, max: 1, step: 0.005,
    help: 'Overall opacity of the wave.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  brightness: {
    min: 0, max: 2, step: 0.01,
    help: 'Brightness of the wave. It is drawn white over the backdrop, so this works on its opacity, as Opacity ' +
      'does.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  zDetailScale: {
    min: 0, max: 0.25, step: 0.001,
    help: "Depth relief from a scrolling copy of the wave's displacement.\n" +
      'Hand-tuned wave shader (spline.js)',
  },
  ffdScale1X: {
    min: 0, max: 8, step: 0.01,
    help: 'Frequency along the wave of a height wobble.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  ffdScale1Y: {
    min: 0, max: 3, step: 0.01,
    help: 'No effect: only the X of Ffd Scale1 is used.\n' +
      'Unused',
  },
  ffdScale1Z: {
    min: 0, max: 3, step: 0.01,
    help: 'No effect: only the X of Ffd Scale1 is used.\n' +
      'Unused',
  },
  ffdScale2X: {
    min: 0, max: 8, step: 0.01,
    help: 'No effect: only the Z of Ffd Scale2 is used, and the pipeline never reads the b300 slot it fills.\n' +
      'Unused',
  },
  ffdScale2Y: {
    min: 0, max: 3, step: 0.01,
    help: 'No effect: only the Z of Ffd Scale2 is used.\n' +
      'Unused',
  },
  ffdScale2Z: {
    min: 0, max: 6, step: 0.01,
    help: "Frequency across the wave's depth of a depth wobble.\n" +
      'Hand-tuned wave shader (spline.js)',
  },
  ffdOffsetX: {
    min: -2, max: 2, step: 0.01,
    help: 'Phase of the height wobble.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  ffdOffsetY: {
    min: -2, max: 2, step: 0.01,
    help: 'No effect: the wobbles only use X and Z, and the pipeline never reads the b300 slot it fills.\n' +
      'Unused',
  },
  ffdOffsetZ: {
    min: -2, max: 2, step: 0.01,
    help: 'Phase of the depth wobble.\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  ffdYAmp: {
    min: 0, max: 0.3, step: 0.001,
    help: 'Height of the wobble along the wave (Ffd Scale1 X).\n' +
      'Hand-tuned wave shader (spline.js)',
  },
  ffdZAmp: {
    min: 0, max: 0.3, step: 0.001,
    help: 'Depth of the wobble across the wave (Ffd Scale2 Z).\n' +
      'Hand-tuned wave shader (spline.js)',
  },
};
