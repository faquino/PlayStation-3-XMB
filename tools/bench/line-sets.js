'use strict';
// How the day cycle's sets differ from LINE1.mnu's base in what moves or places the wave (override/<set>/LINE1.mnu),
// for the benches: the page runs on the base set, and the console's columns were read under the day cycle's.
module.exports = {
  base: {},
  night: {
    timestep: 2, perturbation: 0.1, posX: -8.2, angRot: 10, ffdScale2X: 3.2, ffdScale2Y: 1.2, ffdScale2Z: 3,
    ffdParam1: -1.83395,
  },
  day: { timestep: 2, posX: -8.2, ffdScale2X: 3.2 },
};
