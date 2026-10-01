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
  shading](shading.md);
- the sets: `scene-themes.js` holds every override's `LINE1.mnu` and writes it into the wave's
  settings as it writes the particles' - the day cycle, the boot sequences, the music - see
  [Parameter sets](../particles/parameter-sets.md); and the XMB's start resets the lines, as the
  cold boot's handlers do - see [The start](lines.md#the-start).

Each piece was checked against the savestates, fed what the console held: the surface gives the
newer wave buffer from the local store's grid to 3e-5; the matrix rebuilds `b300` to 1e-5 from the
turn and move read out of it; the lattice gives `b380` to 1e-6 at the clock two steps back; the
deformation and the matrix give the local store's grid to 5e-5 from A0 a frame back; the shaping
gives A0 to 5e-7; and a step gives A6 to the precision of [the one-step
check](lines.md#a-step). The sets give the uniforms of every capture, through the day and the cold
boot - see [How one set blends into
another](../particles/day-cycle.md#how-one-set-blends-into-another).

## What it models

- **The lines' start.** The console resets them to a state baked into its module, a snapshot of the
  lines running, which is firmware data and stays out of the repository. `wave-reverse.js` makes
  its own the same way, once: a sheet at rest, each line straight out from its anchor, settled
  for 600 steps at a hundred times `DAMPING` and then run for 1200 at the day cycle's values.
  Started from rest without settling, the springs across the lines, squeezed near the anchors,
  throw the sheet about for minutes. The start made this way is wider and slower than the
  console's: across a column its lines spread 0.29 in y, where the console's spread 0.19, they
  reach 5.15 from their anchors where the console's reach 5.37, and their median speed is 2.8
  where the console's is 4.
- **At most four steps a frame.** The console runs as many as the frame's time gives.
- **The deformation divides exactly.** The SPU's reciprocal estimate is about 1e-4 off - see [The
  deformation](spu-task.md#the-deformation).
- **The textures are fitted.** The firmware's are left out of the repository. `_Stripes`' rows are
  peak × (1 - (d / reach)²)^power, d being the distance from the stripe's middle; `_FresLUT`'s red
  is a curve through 19 points, within 1.6% of the file's. At `THINNESS` 1 the stripe coordinate,
  0 / 0 on the console, is read as 0.
- **`_Encode` and the passes after the wave.** The light is added to the backdrop times
  `exposure`, 1.5, set by eye against a video of the console. `HDR.mnu`'s sets, which drive the
  passes (inferred), are not applied.
- **The sets' clock.** The blends run on the page's seconds, and blend mode 1's frames at 60 a
  second - see [How one set blends into
  another](../particles/day-cycle.md#how-one-set-blends-into-another). The fade, `_Color`, is not
  ported.

## Against the console

`tools/bench/wave.js` measures the wave `wave-reverse.js` builds against [what the console
draws](output.md), both the same way, from their meshes in clip space: on a 16:9 screen in
normalised device coordinates, and in the XMB's camera space. A frame is taken as 1/60 s.

Each of the console's sources is matched rather than pooled blind. The page's scene plays the XMB's
start at the moment the source was taken, under the sets the console ran then, and the wave runs
from the reset until its lattice's time reaches the source's, `ffd_shader1`'s `_Time` - see [The
time](ffd.md#the-time) - so both have run as long since the cold boot. There it is measured, and
every 2 seconds for 10 more. The two captures that caught the music coming in are left out.

At rest under the day cycle, the console's 10 captures and 8 savestates - 26 frames, and the 8
pairs the savestates hold for its motion - against 108 frames of the page's. On screen, each figure
is worked out per frame and given as its range over the frames:

| On screen | `wave-reverse.js` | Console |
|---|---|---|
| Share of the mesh on screen | 0.53 to 0.67 | 0.56 to 0.61 |
| Middle of the band (median y) | -0.379 to 0.101 | -0.191 to 0.166 |
| Height of the band (5th to 95th percentile of y) | 0.328 to 0.739 | 0.312 to 0.652 |
| Rise, the right quarter's middle less the left's | -0.299 to 0.503 | -0.416 to 0.406 |
| Left quarter: middle, height | -0.48 to 0.14, 0.27 to 0.45 | -0.30 to 0.24, 0.27 to 0.54 |
| Centre-left quarter | -0.46 to 0.20, 0.22 to 0.43 | -0.28 to 0.27, 0.20 to 0.43 |
| Centre-right quarter | -0.41 to 0.19, 0.18 to 0.48 | -0.16 to 0.23, 0.25 to 0.43 |
| Right quarter | -0.33 to 0.21, 0.18 to 0.52 | -0.20 to 0.23, 0.22 to 0.39 |
| Reach of the mesh in x, left / right | -2.51 to -1.53 / 1.37 to 1.95 | -3.21 to -1.91 / 1.43 to 1.88 |

In space and in motion, each figure is pooled over every frame, or every pair of frames:

| Pooled (percentiles) | `wave-reverse.js` | Console |
|---|---|---|
| View depth on screen, 5th / 50th / 95th | 7.72 / 9.18 / 10.60 | 7.45 / 8.65 / 9.95 |
| On screen, NDC per frame, 50th / 95th | 0.00054 / 0.00104 | 0.00064 / 0.00119 |
| Share of that sideways, median | 0.28 | 0.39 |
| In space, per frame, 50th / 95th | 0.0029 / 0.0054 | 0.0032 / 0.0060 |
| The same over `delta time`, the emitter's units | 0.326 / 0.607 | 0.365 / 0.678 |

With a track playing, under `music_1`, the console's 5 captures and a savestate, 7 frames, against
36 of the page's:

| Under `music_1` | `wave-reverse.js` | Console |
|---|---|---|
| Middle of the band (median y) | 0.007 to 0.259 | 0.075 to 0.376 |
| Height of the band | 0.289 to 0.706 | 0.333 to 0.600 |
| Rise | -0.184 to 0.461 | -0.150 to 0.416 |
| Reach of the mesh in x, left / right | -3.51 to -1.83 / 1.39 to 2.02 | -4.36 to -2.16 / 1.39 to 1.86 |
| View depth on screen, 5th / 50th / 95th | 6.83 / 8.78 / 11.08 | 6.22 / 8.20 / 10.53 |
| In space, per frame, 50th / 95th | 0.0048 / 0.0090 | 0.0045 / 0.0079 |

At the XMB's start, capture by capture, at the same lattice time - 0.138 to 0.902, 69 to 451
steps after the reset:

| Capture | On screen | Middle | Height | Rise | Median depth |
|---|---|---|---|---|---|
| 18:21:00, page | 0.66 | -0.047 | 0.573 | -0.298 | 9.05 |
| console | 0.64 | -0.103 | 0.456 | -0.306 | 9.25 |
| 18:21:07, page | 0.61 | 0.023 | 0.511 | -0.177 | 8.97 |
| console | 0.60 | -0.022 | 0.358 | -0.205 | 9.11 |
| 18:22:52, page | 0.61 | 0.004 | 0.508 | 0.169 | 9.01 |
| console | 0.60 | -0.012 | 0.363 | 0.139 | 9.05 |
| 19:34:37, page | 0.66 | -0.050 | 0.573 | -0.299 | 9.05 |
| console | 0.63 | -0.105 | 0.459 | -0.308 | 9.24 |
| 19:34:45, page | 0.61 | 0.032 | 0.487 | -0.128 | 8.98 |
| console | 0.60 | -0.012 | 0.337 | -0.159 | 9.11 |
| 19:34:54, page | 0.61 | -0.014 | 0.530 | 0.227 | 8.98 |
| console | 0.60 | -0.019 | 0.387 | 0.189 | 9.02 |

Known differences:

- **At the XMB's start the band is a third taller**, where its place, rise and depth match: the
  start the page makes spreads its lines wider than the console's - see [What it
  models](#what-it-models).
- **At rest and under the music, the wave sits lower and deeper and reaches less far to the
  left**, and at rest it moves at about 85% of the console's speed. With the sets matched, the
  lines account for it. Run from the reset to each resting savestate's step count under its sets,
  the page's lines reach 5.1 to 5.2 from their anchors where the console's reach 4.6 to 5.1, sit
  0.1 to 0.2 lower in z on average, and move at a median of 3.8 to 4.7 where the console's move at
  5.4 to 6.2. Their start is part of it, `DAMPING` being slow to forget it - a fifth of the speed
  goes in about 1100 steps. But run from rest under day's set, the page's lines settle at a median
  of about 5, short of the console's within 2000 steps of its reset (not followed).
