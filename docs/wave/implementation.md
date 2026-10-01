# The implementation in `ps3xmbwave/`

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md), whose
[Status](../../WAVE_REVERSE_ENGINEER.md#status) table says, file by file, what is ported as verified
and what is modelled. This is the detail.

## What it models

The whole wave, so far. `spline-reverse.js` ports upstream's reading of `spline.elf`,
[`SPLINE_REVERSE_ENGINEER.md`](../../SPLINE_REVERSE_ENGINEER.md), and `spline.js` draws what it
makes:

- **The inputs are synthesised.** The console fills `b300` and `b380` every frame. Here they are
  made up from the settings, and the result is cross-faded with a hand-tuned sum of travelling
  waves (`rePipelineBlend`).
- **The wave has no camera.** A 100 × 100 grid covers the screen in clip space, and the pipeline's
  256 × 64 texture and a sum of sines move it up and down. The console's mesh is 128 × 128,
  projected by the scene's camera - see [What the console draws](output.md#the-mesh).
- **The look is the page's own.** The wave blends with `SRC_ALPHA / ONE_MINUS_SRC_ALPHA` where the
  console blends additively. Its glow is a fresnel term from screen-space derivatives, without
  `lines1.fpo`'s stripes.
- **`LINE1.mnu` is borrowed by name.** Some settings carry its names and some of its values, in
  roles of the page's own.

## Against the console

`tools/bench/wave.js` measures the spline layer's wave against [what the console
draws](output.md). Both waves are measured on a 16:9 screen in normalised device coordinates, and
in the XMB's camera space:

- The console's vertices come projected, so they give both.
- The spline layer draws with no camera, so the bench gives its wave the depth the particles give
  it, `WAVE_DEPTH_NEAR` to `WAVE_DEPTH_FAR`.
- The console's column is the resting XMB under the day cycle: 10 captures and 8 savestates, 26
  frames in all, plus the 8 pairs of frames the savestates hold for its motion.
- A frame is taken as 1/60 s.
- Boot sequences and the music's set move the wave. Their captures are left out, and so is the
  savestate taken with a track playing.

The bench runs 120 seconds of the spline layer and measures a frame every 2 seconds; 600 seconds,
a frame every 5, give the same column. On screen, each figure is worked out per frame and given as
its range over the frames:

| On screen | Spline layer | Console |
|---|---|---|
| Share of the mesh on screen | 1.00 | 0.56 to 0.61 |
| Middle of the band (median y) | -0.039 to 0.124 | -0.191 to 0.166 |
| Height of the band (5th to 95th percentile of y) | 0.197 to 0.311 | 0.312 to 0.652 |
| Rise, the right quarter's middle less the left's | -0.209 to 0.228 | -0.416 to 0.406 |
| Left quarter: middle, height | -0.06 to 0.14, 0.13 to 0.27 | -0.30 to 0.24, 0.27 to 0.54 |
| Centre-left quarter | -0.13 to 0.21, 0.12 to 0.28 | -0.28 to 0.27, 0.20 to 0.43 |
| Centre-right quarter | -0.10 to 0.22, 0.13 to 0.29 | -0.16 to 0.23, 0.25 to 0.43 |
| Right quarter | -0.07 to 0.17, 0.15 to 0.27 | -0.20 to 0.23, 0.22 to 0.39 |
| Reach of the mesh in x, left / right | -1.00 / 1.00 | -3.21 to -1.91 / 1.43 to 1.88 |

In space and in motion, each figure is pooled over every frame, or every pair of frames:

| Pooled (percentiles) | Spline layer | Console |
|---|---|---|
| View depth on screen, 5th / 50th / 95th | 7.85 / 8.62 / 9.39 | 7.45 / 8.65 / 9.95 |
| On screen, NDC per frame, 50th / 95th | 0.00022 / 0.00049 | 0.00064 / 0.00119 |
| Share of that sideways, median | 0.00 | 0.39 |
| In space, per frame, 50th / 95th | 0.0010 / 0.0021 | 0.0032 / 0.0060 |
| The same over `delta time`, the emitter's units | 0.108 / 0.237 | 0.365 / 0.678 |

Known differences:

- **The console's mesh runs far past the screen.** Only 56 to 61% of its vertices are on screen.
  It reaches 1.4 to 1.9 to the right and -1.9 to -3.2 to the left. The spline layer's wave covers
  the screen exactly.
- **The console's band is about twice as tall and tilts about twice as far** in either direction.
  Each quarter of the screen shows the same.
- **The console's wave moves three times as fast,** on screen and in space, and 39% of its motion
  on screen is sideways. The spline layer's vertices only move up and down, since their x is the
  grid's.
- **The depths agree at the middle,** since the particles' depth band was fitted to the pool. From
  the 5th to the 95th percentile the console's wave spans 2.5 in depth, against 1.5.

The emitter reads the spline layer's wave 3.5 times faster (`WAVE_SPEED_GAIN`). That makes 0.38 at
the median, against the console wave's own 0.365, and 0.83 at the 95th percentile, against 0.678.
It is the same mismatch [the particle notes](../particles/implementation.md#modelled-choices) found
from the pool's side.
