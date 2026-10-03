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
XMB is modelled: where the icons go when the selection moves, and the input itself. The wave it
emits on is the console's own mesh, which `wave-reverse.js` builds - see the wave notes'
[implementation](../wave/implementation.md).

The pool holds 2049 particles, the size read out of the savestate. Like the original it
runs full, so emission waits on a free slot; the `welcome` set, which asks for 70 births
on each frame that passes its draw, simply keeps it that way.

## Modelled choices

- **Emission.** Ported - see [The emitter](emitter.md#the-emitter) - with these modelled parts:
  - A vertex's velocity is how far it moved over the page's last frame, scaled to a sixtieth of
    a second, since the page's frames need not be the console's.
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
- **The fade.** `scene-themes.js` sends the scene's fade (`xmbSceneFade`): `themeBrightness`
  stands for Theme Settings' Brightness, and `xmbBackground` for the XMB's background given away
  and taken back, over `backgroundFadeMs`, the page's choice where the console's callers use 0 to
  1000 ms. `_Color` and the wave's renderer each run it, as the console's do - see [The
  fade](scene-events.md#the-fade). Headless both land on the firmware's curve to the bit, fades
  started halfway through others included, and in the browser the particles' light, the backdrop
  and the wave dim with it, to black when hidden. At -3 the capture of 11:38 on 3 October reads
  `_Color` (0.55, 0.55, 0.55, 0), as the page does.
- **Boot sequences.** `sequence` plays the XMB's start, a game's launch or another content's,
  on the particles and the wave, as [What puts each set in](parameter-sets.md#what-puts-each-set-in)
  reads them: each step blends from wherever the parameters stand, the cold boot's first 4
  seconds by mode 1's 1% a frame, which leaves the particles where `coldboot1` put them, and the
  start hands over to the theme on the clock's first tick after `ShowGUI`, which puts the cycle's
  set in over a second, as the console's does. What is modelled:
  - mode 1's frames, taken at 60 a second;
  - what follows a launch: the content takes the screen, and the page brings the XMB back
    through its start at once, as the console does when the content quits;
  - the pool. The XMB's start builds it again, empty and with every orientation the identity,
    as the console's scene does, and the page does not pre-warm it. It fills as the console's
    does - see [The XMB starts by fading out of
    `coldboot1`](parameter-sets.md#the-xmb-starts-by-fading-out-of-coldboot1). The wave's lines
    start afresh too, as the console's do - see [The start](../wave/lines.md#the-start); the
    backdrop keeps its settings.
- **The music and the scene's clock.** `musicPlayback` plays [the music's way in and
  out](music.md) on the particles and the wave, and `themeColor` stands for Theme
  Settings' Colour, which [stops the scene's
  clock](day-cycle.md#theme-settings-colour-stops-the-clock) for the `auto` theme and, through
  `xmbSceneDate`, the backdrop's Auto gradient. Headless, each step lands on the firmware's sets.
  What is modelled:
  - the clock's next tick, taken at once;
  - the backdrop: that `0x10900`'s moment is what `_MonthTime` and `_NightDayBlend` read, which
    puts it on the month's own daytime gradient, at once;
  - what holds the clock: only the music and a sequence, not a boot's tail, the fades or the first
    five seconds.
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

`tools/bench/particles.js` runs the simulation over the wave `wave-reverse.js` builds, under night's
`LINE1.mnu` as the resting savestate was, and prints this. Three 30-second runs, seeds 1 to 3. The
pool's column is the resting savestate's, its newborns those of the six savestates taken at rest
pooled, and the drawn column the two frame captures':

| The pool | Simulation | Console |
|---|---|---|
| Alive | 2012 to 2032 of 2049 | 2033 of 2049 |
| Aging rate, min / median / max | 0.001446 / 0.002442 / 0.004257 | 0.001447 / 0.002435 / 0.004256 |
| Just born, view depth | 7.24 / 8.27 / 9.24 | 7.08 / 8.42 / 9.86 |
| Just born, velocity z | -0.0087 / -0.0001 / 0.0082 | -0.0064 / -0.0001 / 0.0067 |
| Just born, speed in xy | 0.088 / 0.232 / 0.373 | 0.098 / 0.224 / 0.348 |
| Late in life, view depth | 7.15 / 8.28 / 9.53 | 7.41 / 8.40 / 9.32 |
| Late in life, velocity z | -0.2351 / -0.0109 / 0.2365 | -0.2501 / -0.0014 / 0.2337 |
| Late in life, speed in xy | 0.064 / 0.254 / 0.493 | 0.081 / 0.262 / 0.517 |

| What is drawn | Simulation | Capture 1 | Capture 2 |
|---|---|---|---|
| On screen | 1337 to 1353 | 1437 | 1417 |
| Opacity exactly 1 | 91.9 to 93.2% | 92% | 92% |
| View depth, median | 8.32 to 8.35 | 8.92 | 8.49 |
| Distance outside the wave band, 90th percentile (NDC) | 0.126 to 0.157 | 0.096 | 0.114 |
| Same, 99th percentile | 0.347 to 0.397 | 0.38 | 0.39 |

Known difference: **fewer are drawn,** 1337 to 1353 against 1437 and 1417, and a little nearer:
the bench's wave is its first 30 seconds from the start, when its lines draw in - see [What it
models](../wave/implementation.md#what-it-models).

**The newborns are the console's.** Against the resting savestate's alone they looked slow, 0.216
against 0.276 at the median, but a savestate holds some fifty, born on a few frames of one moment's
wave, and that one's wave was moving fast: run on each savestate's own two buffers, the emitter's
formula gives each one's median within 0.03 - 0.246 for that one, 0.191 to 0.232 for the other five
at rest. So the bench gathers its newborns over the runs, and pools the console's over the six.

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
