# The implementation in `ps3xmbwave/`

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md), whose
[Status](../../WAVE_REVERSE_ENGINEER.md#status) table says, file by file, what is ported as verified
and what is modelled. This is the detail.

## What it ports

`wave-reverse.js` builds the wave each frame the way the console does, and `spline.js` draws it:

- the lines - see [The lines](lines.md): the 60 Hz steps, springs, noise, integration and ends,
  the accumulator, and the shaping of what the task receives;
- the lattice, from `ffd_shader1`'s formula at ten times the clock the frame began with - see
  [The lattice](ffd.md);
- the deformation, the matrix and the surface, into 128 × 128 vertices in clip space with their
  normals, laid out as `spline.elf` writes them - see [The SPU task](spu-task.md);
- the mesh's texture coordinates and its index buffer - see [The mesh](output.md#the-mesh);
- `lines1.vpo` and `lines1.fpo`, re-authored, with the additive blend - see [The
  shading](shading.md).

Each piece was checked against the savestates, fed what the console held: the surface gives the
newer wave buffer from the local store's grid to 3e-5; the matrix rebuilds `b300` to 1e-5 from the
turn and move read out of it; the lattice gives `b380` to 1e-6 at the clock two steps back; the
deformation and the matrix give the local store's grid to 5e-5 from A0 a frame back; the shaping
gives A0 to 5e-7; and a step gives A6 to the precision of [the one-step
check](lines.md#a-step).

## What it models

- **The lines' start.** The console resets them to a state baked into its module, a snapshot of the
  lines running, which is firmware data and stays out of the repository. `wave-reverse.js` makes
  its own the same way, once: a sheet at rest, each line straight out from its anchor, settled
  for 600 steps at a hundred times `DAMPING` and then run for 1200 at the day cycle's values.
  Started from rest without settling, the springs across the lines, squeezed near the anchors,
  throw the sheet about for minutes. The start made this way has a median speed of 3, where the
  console's has 4.
- **At most four steps a frame.** The console runs as many as the frame's time gives.
- **The deformation divides exactly.** The SPU's reciprocal estimate is about 1e-4 off - see [The
  deformation](spu-task.md#the-deformation).
- **The textures are fitted.** The firmware's are left out of the repository. `_Stripes`' rows are
  peak × (1 - (d / reach)²)^power, d being the distance from the stripe's middle; `_FresLUT`'s red
  is a curve through 19 points, within 1.6% of the file's. At `THINNESS` 1 the stripe coordinate,
  0 / 0 on the console, is read as 0.
- **`_Encode` and the passes after the wave.** The light is added to the backdrop times
  `exposure`, 1.5, set by eye against a video of the console.
- **The sets.** The page runs `LINE1.mnu`'s base set. The day cycle's sets, the cold boot's reset
  and its ramp of `PERTURBATION` - see [From the start](lines.md#from-the-start) - and the music's
  set are not applied, and the fade, `_Color`, is not ported.

## Against the console

`tools/bench/wave.js` measures the wave `wave-reverse.js` builds against [what the console
draws](output.md), both the same way, from their meshes in clip space: on a 16:9 screen in
normalised device coordinates, and in the XMB's camera space.

- The console's column is the resting XMB under the day cycle: 10 captures and 8 savestates, 26
  frames in all, plus the 8 pairs of frames the savestates hold for its motion. A frame is taken as
  1/60 s.
- Boot sequences and the music's set move the wave. Their captures are left out, and so is the
  savestate taken with a track playing.
- The bench runs the wave under one of the day cycle's sets, night's by default
  (`tools/bench/line-sets.js`), for 120 seconds, and measures a frame every 2 seconds. Under day's
  the figures move by a few hundredths.

On screen, each figure is worked out per frame and given as its range over the frames:

| On screen | `wave-reverse.js` | Console |
|---|---|---|
| Share of the mesh on screen | 0.55 to 0.65 | 0.56 to 0.61 |
| Middle of the band (median y) | -0.298 to 0.093 | -0.191 to 0.166 |
| Height of the band (5th to 95th percentile of y) | 0.331 to 0.623 | 0.312 to 0.652 |
| Rise, the right quarter's middle less the left's | -0.299 to 0.441 | -0.416 to 0.406 |
| Left quarter: middle, height | -0.40 to 0.13, 0.26 to 0.41 | -0.30 to 0.24, 0.27 to 0.54 |
| Centre-left quarter | -0.36 to 0.19, 0.21 to 0.44 | -0.28 to 0.27, 0.20 to 0.43 |
| Centre-right quarter | -0.36 to 0.19, 0.21 to 0.46 | -0.16 to 0.23, 0.25 to 0.43 |
| Right quarter | -0.35 to 0.21, 0.20 to 0.49 | -0.20 to 0.23, 0.22 to 0.39 |
| Reach of the mesh in x, left / right | -2.62 to -1.56 / 1.48 to 1.93 | -3.21 to -1.91 / 1.43 to 1.88 |

In space and in motion, each figure is pooled over every frame, or every pair of frames:

| Pooled (percentiles) | `wave-reverse.js` | Console |
|---|---|---|
| View depth on screen, 5th / 50th / 95th | 7.48 / 9.03 / 10.41 | 7.45 / 8.65 / 9.95 |
| On screen, NDC per frame, 50th / 95th | 0.00055 / 0.00107 | 0.00064 / 0.00119 |
| Share of that sideways, median | 0.27 | 0.39 |
| In space, per frame, 50th / 95th | 0.0029 / 0.0053 | 0.0032 / 0.0060 |
| The same over `delta time`, the emitter's units | 0.321 / 0.599 | 0.365 / 0.678 |

Known differences:

- **The wave sits a tenth lower and 0.4 deeper,** and reaches less far to the left.
- **It moves at about 85% of the console's speed,** with less of its motion sideways.

Both may come from what the bench cannot match (inferred). The console's column mixes the day
cycle's sets, `ANG ROT` running from 10 to 18, where the bench runs one. And the savestates were
taken 20 to 90 seconds after a cold boot, the lines started from the console's own state with
their noise held back by the boot's ramp, where the bench's start from the one made above.
