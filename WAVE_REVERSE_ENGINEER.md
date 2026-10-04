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
| [`postprocess.md`](docs/wave/postprocess.md) | The passes after the wave: the composite with `BACKGROUND.mnu`'s colours, the tone curve read half a texel short, and the glare `HDR.mnu` drives |
| [`implementation.md`](docs/wave/implementation.md) | What `ps3xmbwave/` ports and models, and how it compares with the console |
| [`history.md`](docs/wave/history.md) | Superseded readings, closed investigations and dead ends, for reopening a question |

## Status

What `ps3xmbwave/` ports as verified and what it models, file by file;
[`implementation.md`](docs/wave/implementation.md) has the detail.

| File | Verified | Modelled |
|---|---|---|
| `wave-reverse.js` | The lines, from their 60 Hz steps to the grid the task receives; the lattice, and its crossing over as the clock goes back to 0; the deformation, the matrix and the B-spline surface, into the 128 × 128 mesh `spline.elf` writes; its texture coordinates and index buffer. Each checked against the savestates. | The lines' start, made as the console's was - run at a `TIMESTEP` of 7.4 up to its clock, the first and last lines averaged - with the console's mean place and velocity; at most four steps a frame; the crossing over's frames at 60 a second; the deformation divides exactly. |
| `spline.js` | `lines1.vpo` and `lines1.fpo`, re-authored, and the additive blend. `_Stripes` and `_Encode`, made as the console makes them, every capture's to the byte. The lines start afresh as the XMB's start begins. The renderer's fade. | `_FresLUT`, fitted. The fade's start, at the scene's brightness. |
| `postprocess.js` | `LinesController`, the preexpose tables, `GlareSourcePre`, the levels, `Gaussian`, `AccGlare` and `ToneApplyDisplay`, re-authored; their uniforms from the sets, checked against the captures, the four colours times the scene's fade. The noise, drawn every frame as the HDR renderer draws it, every capture's to the texel. | The wave's buffer read bilinearly, not through a convolution; the glare's levels added in one pass; its textures clamped to their edge, as RPCS3 runs them. `_Gamma` held at 1, as the particles' is. |
| `spline-settings.js` | `LINE1.mnu`'s, `HDR.mnu`'s and `BACKGROUND.mnu`'s parameters under their own names, with the base set's values. | |
| `scene-themes.js` | Every set's `LINE1.mnu`, `HDR.mnu` and `BACKGROUND.mnu`, as their differences from the base, put in as the particles' sets are: the day cycle, the boot sequences, the music. The cold boot's ramp, and its end on the clock's first tick after `ShowGUI`, checked against the captures. The scene's fade, sent to the wave and the particles alike. | The blends' windows on the page's seconds. |

## Still missing

The implementation models all of these. They are listed roughly by how much each one changes the
wave on screen:

- **The lines' start.** The console's, baked into its module, is firmware data, and from it the
  page draws the console's wave frame by frame - see [Against the
  console](docs/wave/implementation.md#against-the-console). The start the page makes has its
  energy and stretch, and the wave's pace and depth at rest match; for the first minutes after
  the reset its band is about a tenth thinner, and at first nearer.
- **The glare's edges on the RSX.** Its textures are set to CLAMP, which RPCS3 runs as
  clamp-to-edge and the page follows; the RSX's own blends the edge with the border colour, which
  would dim the glare along the screen's edges - see [The glare](docs/wave/postprocess.md#the-glare).
- **The music's blend clock.** Under RPCS3 the music's blend ran ahead of the lines' steps as it
  came in, where the code moves both by the same frame's time - see [How one set blends into
  another](docs/particles/day-cycle.md#how-one-set-blends-into-another).
- **A run from the reset.** What, beyond the cold boot's ramp of `PERTURBATION`, keeps a run from
  the reset from landing on a savestate - see [From the start](docs/wave/lines.md#from-the-start).


## Keeping these notes

The rules for the three sets of notes are in [CLAUDE.md](CLAUDE.md#keeping-the-notes). These notes
add one:

- **Leave upstream's notes alone.** `SPLINE_REVERSE_ENGINEER.md` is not edited. A topic that relies
  on one of its readings links to it. When this pass overturns one, the topic that covers it gives
  the right reading, and the old one gets a line under
  [Ruled out](docs/wave/history.md#ruled-out).
