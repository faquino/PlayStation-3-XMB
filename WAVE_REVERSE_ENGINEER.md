# PlayStation 3 XMB wave: reverse engineering notes

The goal is a faithful reimplementation of the XMB's wave: its shape, how it moves, how it is lit,
and how the parameter sets and the day cycle change it. What is still open is listed under
[Still missing](#still-missing).

Everything here comes from firmware 4.93 as installed in RPCS3, analysed with the tools in
[`tools/re/`](tools/re/README.md). **Verified** means checked against the firmware files or
against what RPCS3 recorded while running the XMB; anything else is marked as inferred.
**Modelled** marks what the implementation in `ps3xmbwave/` supplies until the code is found.

[`SPLINE_REVERSE_ENGINEER.md`](SPLINE_REVERSE_ENGINEER.md) is upstream's reading of `spline.elf`,
done in Ghidra, and `ps3xmbwave/spline-reverse.js` ports it. It stays as upstream wrote it, apart
from two corrections made during the particle pass - see [A note on the spline
document](docs/particles/history.md#a-note-on-the-spline-document). What this pass confirms or
overturns there is said here and in the topics.

The notes are split by topic under [`docs/wave/`](docs/wave/), and this file is their index. Read
it first, then only the topics the task needs - see [Keeping these notes](#keeping-these-notes).

## Topics

| File | What it covers |
|---|---|
| [`output.md`](docs/wave/output.md) | The wave as the RSX draws it: the two buffers, the 128 × 128 mesh, its normal and texture coordinates, the draw's uniforms |
| [`spu-task.md`](docs/wave/spu-task.md) | `spline.elf` step by step: three DMAs in, a free-form deformation, a matrix, and the bicubic B-spline surface over 19 × 19 control points that is the wave |
| [`inputs.md`](docs/wave/inputs.md) | What the PPU sends the task: the job's parameters, the matrix, the grid of 19 lines, the deformation's lattice |
| [`lines.md`](docs/wave/lines.md) | The PPU's simulation of the 19 lines: the object, the 60 Hz steps, the springs, the noise, the anchored ends, and the shaping of what the task receives |
| [`ffd.md`](docs/wave/ffd.md) | The deformation's lattice: `ffd_shader1.fpo` on the GPU, its formula and clock, and how the PPU turns its output into the lattice |
| [`implementation.md`](docs/wave/implementation.md) | What `ps3xmbwave/` models, and how it compares with the console |
| [`history.md`](docs/wave/history.md) | Superseded readings, closed investigations and dead ends, for reopening a question |

## Status

What `ps3xmbwave/` ports as verified and what it models, file by file;
[`implementation.md`](docs/wave/implementation.md) has the detail.

| File | Verified | Modelled |
|---|---|---|
| `spline-reverse.js` | Only constants: the kernel's 8 iterations and where its eight stores go, which `spu_disasm.py` reproduces from `spline.elf`. | Every use of them. `b300` and `b380` are synthesised from the settings, and the result is cross-faded with a hand-tuned sum of waves. |
| `spline.js` | | The wave: a 100 × 100 grid in clip space with no camera, its blending and its glow. |
| `wave-surface-cpu.js` | | A CPU copy of `spline.js`'s wave vertex shader, so the particles are born on the wave that is drawn. |
| `spline-settings.js` | | `LINE1.mnu`'s names and some of its values, in roles of the page's own. |

## Still missing

The implementation models all of these. They are listed roughly by how much each one changes the
wave on screen:

- **The FFD's other programs.** `ffd_alpha_blend.fpo`, drawn every frame after `ffd_shader1`,
  and `ffd_shader0`, 2 and 3, which no set picks - see [The draws](docs/wave/ffd.md#the-draws).
- **The lines' start.** Where the constructor puts the points before the first step, and what
  `0x47af0` does when the clock wraps at 10 - see [The lines](docs/wave/lines.md). The springs and
  the noise are read in the code but not checked yet: running the lines from their start to a
  savestate's step count would check them.
- **The shading.** `lines1.fpo`, with its `_Stripes` and `_FresLUT` textures and `_Spacing` and
  `_Thinness`. Also where `FALLOFF` goes, since no uniform of the two programs is named for it,
  and `_Gamma`, which the scene sends the wave's renderer too (`0x70bf8`).
- **The sets.** Every override carries its own `LINE1.mnu`, and the music's moves the wave up and
  forward - see [The music set](docs/particles/parameter-sets.md#the-music-set). The day cycle
  blends the wave's set by the particles' factor - see [Themes blend over
  hours](docs/particles/day-cycle.md#themes-blend-over-hours).
- **The fade.** How the wave's renderer uses `_Color` (`0x4fe2c`) - see [The particles'
  fade](docs/particles/scene-events.md#the-particles-fade).

## Keeping these notes

The rules for the three sets of notes are in [CLAUDE.md](CLAUDE.md#keeping-the-notes). These notes
add one:

- **Leave upstream's notes alone.** `SPLINE_REVERSE_ENGINEER.md` is not edited. A topic that relies
  on one of its readings links to it. When this pass overturns one, the topic that covers it gives
  the right reading, and the old one gets a line under
  [Ruled out](docs/wave/history.md#ruled-out).
