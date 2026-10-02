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
- `lines1.vpo` and `lines1.fpo`, re-authored, with the additive blend, into a buffer of the
  wave's own in `_Encode`'s two channels - see [The shading](shading.md);
- the passes after the wave, in `postprocess.js`: the backdrop drawn into its 64 × 32 buffer, the
  composite with `BACKGROUND.mnu`'s colours, the tone curve as the preexpose tables hold it, read
  half a texel short, the noise, and the glare - its source, its six levels, the Gaussians, their
  weights and its addition to the screen - see [The passes after the wave](postprocess.md);
- the sets: `scene-themes.js` holds every override's `LINE1.mnu`, `HDR.mnu` and `BACKGROUND.mnu`
  and writes them into the wave's settings as it writes the particles' - the day cycle, the boot
  sequences, the music - see [Parameter sets](../particles/parameter-sets.md); and the XMB's start
  resets the lines, as the cold boot's handlers do - see [The start](lines.md#the-start).

Each piece was checked against the savestates, fed what the console held: the surface gives the
newer wave buffer from the local store's grid to 3e-5; the matrix rebuilds `b300` to 1e-5 from the
turn and move read out of it; the lattice gives `b380` to 1e-6 at the clock two steps back; the
deformation and the matrix give the local store's grid to 5e-5 from A0 a frame back; the shaping
gives A0 to 5e-7; and a step gives A6 to the precision of [the one-step
check](lines.md#a-step). The sets give the uniforms of every capture, through the day and the cold
boot - see [How one set blends into
another](../particles/day-cycle.md#how-one-set-blends-into-another) - and, through
`PS3PostProcess.uniforms`, those of the passes after the wave in seven captures to 5e-5.

## What it models

- **The lines' start.** The console resets them to a state baked into its module, which is
  firmware data and stays out of the repository - see [The start](lines.md#the-start).
  `wave-reverse.js` makes its own the way that state was made, once: a sheet at rest, each line
  straight out from its anchor, settled for 600 steps at a hundred times `DAMPING`, then run under
  `LINE1.mnu`'s base values at a `TIMESTEP` of 7.4 until its smoothed clock is the console's
  state's, 4.37234 - 5918 steps, 150 ms when the page loads. It is finished as the console's is:
  its first and last lines averaged into one, and its mean place and velocity over the 361 points
  set to the console's, six numbers. Which run of the noise it is was picked: of two dozen, the
  one whose lines, run from the reset, come closest to the savestates'. Started from rest without
  settling, the springs across the lines, squeezed near the anchors, throw the sheet about for
  minutes. A start made under the day cycle's values, as the page's was before, keeps its lines
  long and slow: a third under the console's speed for minutes after the reset.
- **At most four steps a frame.** The console runs as many as the frame's time gives.
- **The deformation divides exactly.** The SPU's reciprocal estimate is about 1e-4 off - see [The
  deformation](spu-task.md#the-deformation).
- **The textures are fitted.** The firmware's are left out of the repository. `_Stripes`' rows are
  peak × (1 - (d / reach)²)^power, d being the distance from the stripe's middle; `_FresLUT`'s red
  is a curve through 19 points, within 1.6% of the file's. At `THINNESS` 1 the stripe coordinate,
  0 / 0 on the console, is read as 0.
- **The passes after the wave, in their details.** The wave's buffer is read through a bilinear
  filter where the console's texture unit applies a convolution; `_Encode`'s fine part is 2 (n mod
  32), without the table's odd step of one; the six levels of the glare are added in one pass, not
  six, and its textures are clamped to their edge, as RPCS3 runs their CLAMP; the luminance the
  glare's source carries, and the copy the CPU fetches, are left out; and the noise is the page's
  own. `HDR.mnu`'s flags are not applied - only the welcome sets change
  them. The backdrop that goes into the passes is the console's program over fits of its month
  textures - see the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md).
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

**From the console's own start the page draws the console's wave.** The bench's `--start` runs the
lines from a start of one's own, and fed the console's, read out of its module into `re-work/`,
the page's wave lands on every source's band to the hundredth - middle, height, its four quarters'
heights and depth - up to a lattice time of 6, some 50 seconds after the cold boot, and on the
pooled figures at rest from there on: a median depth of 8.69 against 8.65, and 0.00064 a frame on
screen against 0.00064. What is left below is the start's.

At rest under the day cycle, the console's 10 captures and 8 savestates - 26 frames, and the 8
pairs the savestates hold for its motion - against 108 frames of the page's. On screen, each figure
is worked out per frame and given as its range over the frames:

| On screen | `wave-reverse.js` | Console |
|---|---|---|
| Share of the mesh on screen | 0.56 to 0.63 | 0.56 to 0.61 |
| Middle of the band (median y) | -0.395 to 0.222 | -0.191 to 0.166 |
| Height of the band (5th to 95th percentile of y) | 0.263 to 0.642 | 0.312 to 0.652 |
| Rise, the right quarter's middle less the left's | -0.383 to 0.477 | -0.416 to 0.406 |
| Left quarter: middle, height | -0.47 to 0.24, 0.18 to 0.46 | -0.30 to 0.24, 0.27 to 0.54 |
| Centre-left quarter | -0.51 to 0.31, 0.20 to 0.40 | -0.28 to 0.27, 0.20 to 0.43 |
| Centre-right quarter | -0.46 to 0.33, 0.20 to 0.48 | -0.16 to 0.23, 0.25 to 0.43 |
| Right quarter | -0.27 to 0.35, 0.20 to 0.46 | -0.20 to 0.23, 0.22 to 0.39 |
| Reach of the mesh in x, left / right | -2.41 to -1.59 / 1.52 to 2.01 | -3.21 to -1.91 / 1.43 to 1.88 |

In space and in motion, each figure is pooled over every frame, or every pair of frames:

| Pooled (percentiles) | `wave-reverse.js` | Console |
|---|---|---|
| View depth on screen, 5th / 50th / 95th | 7.48 / 8.56 / 9.68 | 7.45 / 8.65 / 9.95 |
| On screen, NDC per frame, 50th / 95th | 0.00063 / 0.00120 | 0.00064 / 0.00119 |
| Share of that sideways, median | 0.39 | 0.39 |
| In space, per frame, 50th / 95th | 0.0033 / 0.0062 | 0.0032 / 0.0060 |
| The same over `delta time`, the emitter's units | 0.372 / 0.701 | 0.365 / 0.678 |

With a track playing, under `music_1`, the console's 5 captures and a savestate, 7 frames, against
36 of the page's:

| Under `music_1` | `wave-reverse.js` | Console |
|---|---|---|
| Middle of the band (median y) | -0.004 to 0.395 | 0.075 to 0.376 |
| Height of the band | 0.265 to 0.581 | 0.333 to 0.600 |
| Rise | -0.183 to 0.384 | -0.150 to 0.416 |
| Reach of the mesh in x, left / right | -2.80 to -1.93 / 1.47 to 1.77 | -4.36 to -2.16 / 1.39 to 1.86 |
| View depth on screen, 5th / 50th / 95th | 6.51 / 8.06 / 9.88 | 6.22 / 8.20 / 10.53 |
| In space, per frame, 50th / 95th | 0.0054 / 0.0099 | 0.0045 / 0.0079 |

At the XMB's start, capture by capture, at the same lattice time - 0.138 to 0.902, 69 to 451
steps after the reset:

| Capture | On screen | Middle | Height | Rise | Median depth |
|---|---|---|---|---|---|
| 18:21:00, page | 0.63 | -0.042 | 0.418 | -0.279 | 8.97 |
| console | 0.64 | -0.103 | 0.456 | -0.306 | 9.25 |
| 18:21:07, page | 0.60 | 0.016 | 0.345 | -0.159 | 8.83 |
| console | 0.60 | -0.022 | 0.358 | -0.205 | 9.11 |
| 18:22:52, page | 0.61 | 0.029 | 0.365 | 0.170 | 8.67 |
| console | 0.60 | -0.012 | 0.363 | 0.139 | 9.05 |
| 19:34:37, page | 0.63 | -0.045 | 0.419 | -0.281 | 8.98 |
| console | 0.63 | -0.105 | 0.459 | -0.308 | 9.24 |
| 19:34:45, page | 0.60 | 0.024 | 0.318 | -0.114 | 8.82 |
| console | 0.60 | -0.012 | 0.337 | -0.159 | 9.11 |
| 19:34:54, page | 0.60 | 0.022 | 0.391 | 0.227 | 8.62 |
| console | 0.60 | -0.019 | 0.387 | 0.189 | 9.02 |

Known differences, all of them the start's:

- **The band is about a tenth thinner, and at first nearer** - 0.3 nearer at the XMB's start and
  for some forty seconds after. The console's lines fan out in y in the minutes after the reset,
  their spread across a column going from 0.19 to 0.37, along a slow mode its own start sets
  going; the made start has the console's energy and stretch but not that mode's phase. Laying the
  console's state's mean place and velocity line by line onto the made start brings the band's
  height back, but strains the springs across the lines, and the wave then moves 15% too fast at
  rest.
- **Its far end reaches less far to the left on screen**, -2.41 at most against -3.21.
- **Under the music it moves faster than the console's**, 0.0054 a frame against 0.0045. The page
  puts the music on as its start ends, where the console's had run its lines for minutes under the
  cycle first; the console's own start gives the same, 0.0056.

The level the lines settle at is the same for both, the steps being the same: under the day
cycle's sets, a median speed of about 5. The savestates' 5.4 to 6.2, within 2000 steps of a reset,
is the console's start still spending the stretch it was made with.
