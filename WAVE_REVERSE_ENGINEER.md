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
| [`output.md`](docs/wave/output.md) | The wave as the RSX draws it: the two buffers, the 128 × 128 mesh, its normal and texture coordinates, the bicubic B-spline patch it points to, the draw's uniforms |
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

- **The control points.** If the mesh's reading holds, a 19 × 19 grid of points drives the wave
  every frame - see [A bicubic B-spline
  patch](docs/wave/output.md#a-bicubic-b-spline-patch). Still needed: `b300` (16 floats) and `b380`
  (`0x2200` bytes) as they arrive, and the code in `custom_render_plugin` that fills them from
  `LINE1.mnu`'s `DAMPING`, `TENSION`, `LENGTH`, `TIMESTEP`, `PERTURBATION`, `END` and free-form
  deformation.
- **The kernel.** Whether `spline.elf` evaluates that patch, and what upstream's executor for `b380`
  does - see [b380 and the descriptor
  executor](SPLINE_REVERSE_ENGINEER.md#b380-and-the-descriptor-executor).
- **The placement.** `POS`, `ANG` and `ANG ROT` place and turn the wave, and the camera projects
  it. The vertices arrive in clip space, so this happens before the RSX, on the PPU or the SPU.
- **The time.** How fast the wave's clock runs: `TIMESTEP` is 4 in the base set and 2 in the day
  cycle's. A savestate's two buffers are taken as 1/60 s apart, and which one is newer is not known.
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
