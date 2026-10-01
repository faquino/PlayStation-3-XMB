# PlayStation 3 XMB wave: reverse engineering notes

The goal is a faithful reimplementation of the XMB's wave: its shape, how it moves, how it is lit,
and how the parameter sets and the day cycle change it. What is still open is listed under
[Still missing](#still-missing).

Everything here comes from firmware 4.93 as installed in RPCS3, analysed with the tools in
[`tools/re/`](tools/re/README.md). **Verified** means checked against the firmware files or
against what RPCS3 recorded while running the XMB; anything else is marked as inferred.
**Modelled** marks what the implementation in `ps3xmbwave/` supplies until the code is found.

[`SPLINE_REVERSE_ENGINEER.md`](SPLINE_REVERSE_ENGINEER.md) is upstream's reading of `spline.elf`,
done in Ghidra, which `ps3xmbwave/spline-reverse.js` ported until this pass replaced it with
`wave-reverse.js`. It stays as upstream wrote it, apart from two corrections made during the
particle pass - see [A note on the spline
document](docs/particles/history.md#a-note-on-the-spline-document). What this pass confirms or
overturns there is said here and in the topics.

The notes are split by topic under [`docs/wave/`](docs/wave/), and this file is their index. Read
it first, then only the topics the task needs - see [Keeping these notes](#keeping-these-notes).

## Topics

| File | What it covers |
|---|---|
| [`output.md`](docs/wave/output.md) | The wave as the RSX draws it: the two buffers, the 128 × 128 mesh, its normal and texture coordinates |
| [`spu-task.md`](docs/wave/spu-task.md) | `spline.elf` step by step: three DMAs in, a free-form deformation, a matrix, and the bicubic B-spline surface over 19 × 19 control points that is the wave |
| [`inputs.md`](docs/wave/inputs.md) | What the PPU sends the task: the job's parameters, the matrix, the grid of 19 lines, the deformation's lattice |
| [`lines.md`](docs/wave/lines.md) | The PPU's simulation of the 19 lines: the object, the baked state each cold boot resets them to, the 60 Hz steps, the springs, the noise, the anchored ends, and the shaping of what the task receives |
| [`ffd.md`](docs/wave/ffd.md) | The deformation's lattice: `ffd_shader1.fpo` on the GPU, its formula and clock, and how the PPU turns its output into the lattice |
| [`shading.md`](docs/wave/shading.md) | How the RSX lights the mesh: the draw, `lines1.vpo` and `lines1.fpo` with their uniforms, the stripes `THINNESS` switches off, and the three textures |
| [`implementation.md`](docs/wave/implementation.md) | What `ps3xmbwave/` ports and models, and how it compares with the console |
| [`history.md`](docs/wave/history.md) | Superseded readings, closed investigations and dead ends, for reopening a question |

## Status

What `ps3xmbwave/` ports as verified and what it models, file by file;
[`implementation.md`](docs/wave/implementation.md) has the detail.

| File | Verified | Modelled |
|---|---|---|
| `wave-reverse.js` | The lines, from their 60 Hz steps to the grid the task receives; the lattice; the deformation, the matrix and the B-spline surface, into the 128 × 128 mesh `spline.elf` writes; its texture coordinates and index buffer. Each checked against the savestates. | The lines' start, made by running them; at most four steps a frame; the deformation divides exactly. |
| `spline.js` | `lines1.vpo` and `lines1.fpo`, re-authored, and the additive blend. | `_Stripes` and `_FresLUT`, fitted; `_Encode` and the passes after the wave, as one gain, `exposure`. |
| `spline-settings.js` | `LINE1.mnu`'s parameters under their own names, with the base set's values. | `exposure`. |

## Still missing

The implementation models all of these. They are listed roughly by how much each one changes the
wave on screen:

- **The passes after the wave.** Some thirty full-screen passes run between the wave and the
  particles, and read back what `_Encode` wrote - see [The draw](docs/wave/shading.md#the-draw).
  `HDR.mnu` probably drives them (inferred). Also where `_Stripes` and `_Encode` are made, where
  `FALLOFF` goes, since no uniform of the two programs is named for it, and `_Gamma`, which the
  scene sends the wave's renderer too (`0x70bf8`).
- **The sets.** Every override carries its own `LINE1.mnu`, and the music's moves the wave up and
  forward - see [The music set](docs/particles/parameter-sets.md#the-music-set). The day cycle
  blends the wave's set by the particles' factor - see [Themes blend over
  hours](docs/particles/day-cycle.md#themes-blend-over-hours) - and the cold boot resets the lines
  and holds their noise back - see [From the start](docs/wave/lines.md#from-the-start). The page
  runs the base set.
- **The FFD's other programs.** `ffd_alpha_blend.fpo`, drawn every frame after `ffd_shader1`,
  and `ffd_shader0`, 2 and 3, which no set picks - see [The draws](docs/wave/ffd.md#the-draws).
- **The clock's wrap.** What `0x47af0` does when the lines' clock passes 10 and starts again,
  about every 14 minutes at night's `TIMESTEP`, and with the time a reset hands it - see [A
  step](docs/wave/lines.md#a-step) and [The time](docs/wave/ffd.md#the-time). No savestate has run
  that long since a cold boot. Also what, beyond the cold boot's ramp of `PERTURBATION`, keeps a run
  from the reset from landing on a savestate - see [From the start](docs/wave/lines.md#from-the-start).
- **The fade.** How the wave's renderer uses `_Color` (`0x4fe2c`) - see [The particles'
  fade](docs/particles/scene-events.md#the-particles-fade).

## Keeping these notes

The rules for the three sets of notes are in [CLAUDE.md](CLAUDE.md#keeping-the-notes). These notes
add one:

- **Leave upstream's notes alone.** `SPLINE_REVERSE_ENGINEER.md` is not edited. A topic that relies
  on one of its readings links to it. When this pass overturns one, the topic that covers it gives
  the right reading, and the old one gets a line under
  [Ruled out](docs/wave/history.md#ruled-out).
