# The implementation in `ps3xmbwave/`

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md), whose
[Status](../../PARTICLES_REVERSE_ENGINEER.md#status) table says, file by file, what is ported as
verified and what is modelled. This is the detail.

The implementation ports what is verified as it is and models the rest, marked as modelled in the
code. It steps at 60 Hz, as the XMB runs - 60 fps under RPCS3, as its overlay shows, and as the
scene's constants assume: the block's default time step is (1/60, 1/60, 1/60, 1) (`0x5d510`), and
both the PPU (`0x5d7b0`) and the task divide `spin time scale` by 60 a frame. The PPU side is ported
as far as it is traced - how the block is filled, the flow grid's decay and wind, the noise's
formula and spring, the wind, the emitter, the controller's response - and what it needs from the
XMB is modelled: where the console's wave mesh falls on the spline layer's wave, where the icons go
when the selection moves, and the input itself.

The pool holds 2049 particles, the size read out of the savestate. Like the original it
runs full, so emission waits on a free slot; the `welcome` set, which asks for 70 births
on each frame that passes its draw, simply keeps it that way.

## Modelled choices

- **Where the wave is.** The spline layer draws in clip space with no camera.
  - A wave point goes on the camera ray through its screen position, at a depth from 7.77
    to 9.47 set by its row. That range is the one that puts new particles where the
    console's pool has them, matching the median and the width of its just-born band; it
    replaced the captured wave's own 5th to 95th percentile, 6.8 to 10.6, which was more
    than twice as thick.
  - The console's mesh reaches past the screen edges, and its 128 columns are spread 1.55
    times past them. 15.1% of births then land outside the life box and 35% off screen,
    against 14% and 28 to 30% in the captures.
- **Emission.** Ported - see [The emitter](emitter.md#the-emitter) - with these modelled parts:
  - The console's 128 lines are the spline layer's rows, and its columns run across the
    surface from the right edge. A row the spline layer clips has no vertex there, and a
    birth picked on it is lost.
  - A vertex's velocity is the wave's own there, over `delta time`, rather than how far it
    moved since it was picked, since the page's frames need not match the steps.
  - **The spline layer's wave moves more slowly than the console's.** Its vertices move at
    a median 0.113 in the emitter's units, where the pool's newborns need about 0.4, so the
    emitter reads them 3.5 times faster (`WAVE_SPEED_GAIN`). That brings late life in line -
    0.081 / 0.258 / 0.491 in xy against the console's 0.081 / 0.262 / 0.517 - but leaves the
    newborns at a median 0.232 against 0.276; 4.5 brings the newborns to 0.263 and late life
    to 0.299. No one factor fits both, because the wave's speeds are distributed differently.
  - The generator starts its counter at the seed; the console's is shared by all that draw
    from it. The pool starts with random orientations, which births then pass on, and it is
    filled on the second frame, once the wave has moved. The console builds its pool with
    every orientation the identity (`0x5ef0c`, `0x5b74c`) and then marks every slot free
    (`0x597bc`), but the spin depends on life alone, so a first generation born from the
    identity turns in step. After many generations the savestates' orientations are uniform -
    each component's square averages 0.24 to 0.27 against 0.25, and the rotation angle 2.16
    to 2.21 rad against 2.207 - which the random start gives from the first frame.
- **Parameter block.** Ported from the PPU's code - see
  [How the block is filled](parameter-block.md#how-the-block-is-filled): the force is `gravity` alone, the drag
  `friction`, the time step (`delta time` × 3, 1), the spin rate `spin time scale`, the flow
  strength 1, and the field turns about the origin. The wind goes in as the noise offset,
  `wind dir` normalised × (`wind scale` + 10 × `wind scale 10`), which only `gameboot3/4` and
  `welcome_1/2` turn on. The noise scale is `brownian scale` + level × `brownian` + motion ×
  `rshake brw`, with the level's spring, and what drives it and the motion, as traced - see
  [The controller](controller.md#the-controller).
- **`PARTICLES_SPE.mnu`.** Applied every frame the way `0x31f44` applies it, clamps included,
  to what the simulation runs on and the shaders draw with. The video output's factor comes
  from `videoOutput`, 1080p by default as in every capture. The event factor runs the
  firmware's animation, towards 1 while `whatsNewBoard` is open and towards 0 while it is
  closed, as events 11 would take it; closed is the default, as in every capture. Headless,
  opening and closing the board, and reopening it halfway down, the factor stays within 1e-15
  of the firmware's curve, and each frame's parameters carry the factor of the frame before.
- **The particles' fade.** `_Color` runs the scene's fade: `themeBrightness` stands for Theme
  Settings' Brightness, and `xmbBackground` for the XMB's background given away and taken back,
  over `backgroundFadeMs`, the page's choice where the console's callers use 0 to 1000 ms.
  Headless it stays within 1e-15 of the firmware's curve, and in the browser the particles'
  light scales with it, to nothing when hidden. The wave does not fade: that part is not ported.
- **Boot sequences.** `sequence` plays the XMB's start, a game's launch or another content's,
  as [What puts each set in](parameter-sets.md#what-puts-each-set-in) reads them: each step blends from wherever
  the parameters stand, and the start hands over to the theme at 11.5 seconds, once its blend
  into the cycle is done. What is modelled:
  - a blend's curve, which runs in `qglbase`: the day cycle's smoothstep;
  - what follows a launch: the content takes the screen, and the page brings the XMB back
    through its start at once, as the console does when the content quits;
  - the pool. The XMB's start builds it again, empty and with every orientation the identity,
    as the console's scene does, and the page does not pre-warm it. But the page's fills in
    about five seconds, where the console's held 492 particles with its blend into the cycle
    46 per cent done - its wave may come up still, which the spline layer's does not (not
    followed). Only the particle side changes: the backdrop and the wave keep their settings.
- **Flow grid.** Ported: 32 × 16 cells of signed bytes, sampled the way the task samples them,
  decayed by 0.98 a frame, and written by every icon that moves - see
  [The flow grid](flow-grid.md#the-flow-grid). At rest it stays empty, as the console's does. What is
  modelled is what writes it: the icons' motion.
- **Icons.** A modelled XMB of 10 categories with 8 items each, starting as the resting capture
  does, with four categories to the left of the selection and two items above it. Where each
  icon sits is the captures' - see [Where the icons are](flow-grid.md#where-the-icons-are). How they get
  there is not measured:
  - on a step every icon eases towards its new place, and every category icon towards its new
    height, with a time constant of `iconEaseSec`. At its 0.065 s, the first frame of a step
    writes 58 into the category row, the captures' strongest byte there being 59.
  - Only the selected category's column is drawn, and a newly selected one appears in place.
    The console also draws the columns it is leaving, moving sideways with the row, which
    writes zero bytes wherever they pass.
  - Within a frame the grid decays first and the icons write after it; the console's order is
    not known.
  - A step to the right writes the category row as the captures show it, negative on the
    left of the selection and positive on its right, the shrinking icon's side and the
    growing one's. A step down writes the item column at +127, since items travel up to a
    third of the screen's height in a few frames.
- **Input.** The response is ported - see [The controller](controller.md#the-controller). What stands in
  for the controller is modelled, in `xmb-input.js`:
  - Steps are D-pad presses: the arrow keys, and the pointer crossing a virtual grid of 7 × 7
    icons. They reach the system one a frame, the way the XMB sends them. A key the browser
    starts repeating is held, and the system repeats it every 8 frames of its own, the rate the
    captures' turn implies. Held for ten seconds, the turn settles between 0.1745 and 0.2010
    times `dpad rot max`, where the four captures read 0.176 to 0.191.
  - Every step also moves the modelled icons, whose wind goes through the flow grid, above.
    Sideways steps raise wind as well as turning the field, as on the console: `icon wind
    scl x` being 0 means the wind has no x, not that sideways moves raise none.
  - Dragging with the mouse moves a virtual Sixaxis. The drag's acceleration reads on the
    accelerometer's x and y, through `mouseAccelToG` and 1 g = 112 of the PPU's units, and its
    sideways speed reads on the gyro, through `mouseYawGain`. z stays at zero.
  - **Which way the field turns is measured.** Four captures, two taken holding right and two
    holding left, carry the rotation at +2.09e-5 and +2.16e-5 against -2.05e-5 and -2.23e-5:
    right is positive. With the particles six and a half units beyond the centre of the turn,
    that sweeps them left - the way the icons go. It also dates the savestate taken while
    navigating: its +1.84e-5 was a step to the right.
  - Headless, holding a direction for two seconds - a step, then after 30 frames one every 8 -
    turns the field only from the fourth step on, and until 33 frames after the key is let
    go. A second after that, the drawn particles' mean has moved by -0.34 in x for right and
    +0.27 for left. A single tap does not turn the field at all. Down and up move the mean by
    +0.06 and -0.04 in y: the wind acts only where the icons move.
  - The vertical sign follows from the traced rule. `dpad scale y` is 0, so the field does not
    turn when the selection goes up or down; only the wind moves, and a cell takes the sign of
    the icon's own motion on screen, which M2 turns into a force pointing the same way. So the
    wind pushes particles the way the icons move, and since pressing down scrolls the items up
    (inferred from how the XMB scrolls), down pushes them up.
  - The same two seconds leave the noise at 3.16 times its rest as the key is let go, and 2.74
    times 0.4 s later; the savestate taken while navigating read 3.19. A tap raises it to 1.25
    times.
  - A synthetic shake of the accelerometer's x and the gyro, ±0.4 of the PPU's units at 3 Hz,
    holds the noise at 6.3 times its rest, against the shaking savestate's 6.63, and turns the
    field for 20 frames as it starts, against the gyro's reading at that moment. At ±0.05
    nothing is detected, and the motion alone raises the noise by a third.

## Against the console

`tools/bench/particles.js` runs the simulation on the spline layer's own wave and prints
this. Three 30-second runs, seeds 1 to 3. The pool's column is the resting savestate's, the
drawn column the two frame captures':

| The pool | Simulation | Console |
|---|---|---|
| Alive | 2014 to 2044 of 2049 | 2033 of 2049 |
| Aging rate, min / median / max | 0.001446 / 0.002491 / 0.004257 | 0.001447 / 0.002435 / 0.004256 |
| Just born, view depth | 7.81 / 8.81 / 9.31 | 7.57 / 8.55 / 9.07 |
| Just born, velocity z | -0.0063 / -0.0000 / 0.0080 | -0.0112 / 0.0001 / 0.0078 |
| Just born, speed in xy | 0.135 / 0.232 / 0.335 | 0.156 / 0.276 / 0.348 |
| Late in life, view depth | 7.74 / 8.53 / 9.48 | 7.41 / 8.40 / 9.32 |
| Late in life, velocity z | -0.2017 / -0.0107 / 0.2198 | -0.2501 / -0.0014 / 0.2337 |
| Late in life, speed in xy | 0.081 / 0.258 / 0.491 | 0.081 / 0.262 / 0.517 |

| What is drawn | Simulation | Capture 1 | Capture 2 |
|---|---|---|---|
| On screen | 1552 to 1572 | 1437 | 1417 |
| Opacity exactly 1 | 91.4 to 91.9% | 92% | 92% |
| View depth, median | 8.63 to 8.66 | 8.92 | 8.49 |
| Distance outside the wave band, 90th percentile (NDC) | 0.157 to 0.173 | 0.096 | 0.114 |
| Same, 99th percentile | 0.351 to 0.387 | 0.38 | 0.39 |

Known differences:

- **The spline layer's wave is flatter on screen.** Its band is 0.25 NDC tall (5th to 95th
  percentile), against 0.57 captured. Relative to the band, the particles look more spread
  out - which is also why the last two rows cannot be read cleanly: the distance is measured
  against a band that is wrong to begin with.
- **The newborns are slow**, 0.232 against 0.276 at the median, because the spline layer's
  wave moves more slowly than the console's and the emitter's speeds follow it - see
  [Modelled choices](#modelled-choices).
- **About a tenth too many on screen**, and the emitter's count was not it: the traced one,
  7.67 a frame in bursts, leaves it where it was.
- **The captured particles are denser on the left.** The captured wave runs further left
  than right, while the spline layer's wave is centred.

**The noise's drift was the emitter's count.** For as long as the emitter was modelled, the
particles moved too fast late in life - 0.369 in xy against 0.262 - and spread twice as far in
z, and the noise was the only thing that could do it: with the noise at zero the median fell to
the console's, and the z spread vanished. With the traced emitter both match, and the median
|vz| by life, which only the noise produces, matches at every age:

| Life | Simulation | Before the emitter was traced | Console |
|---|---|---|---|
| 0.00-0.05 | 0.004 | 0.004 | 0.004 |
| 0.05-0.15 | 0.012 | 0.025 | 0.011 |
| 0.15-0.30 | 0.023 | 0.049 | 0.020 |
| 0.30-0.50 | 0.045 | 0.097 | 0.049 |
| 0.50-0.70 | 0.069 | 0.146 | 0.069 |
| 0.70-0.90 | 0.089 | 0.178 | 0.095 |
| 0.90-1.01 | 0.101 | 0.206 | 0.110 |

How the count does it, and the six other causes ruled out on the way, is in
[history](history.md#the-noises-drift).
