# Parameter sets: the overrides and what puts them in

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the sets the particles'
parameters come from, what puts each one in, and how to tell them apart in a capture. The day
cycle's windows, and the clock that walks them, are in [the day
cycle](day-cycle.md#themes-blend-over-hours).

## Theme overrides

Each `override/<theme>/PARTICLES.mnu` is a complete parameter set. Differences from the base:

| Theme | Changes |
|---|---|
| `night` | `far focus_dist` 4.09678 |
| `day` | `size middle` 0.0464771, `far focus` 12.2008, `far focus_dist` 4.02735, `glare` 0.201367 |
| `yoake` (dawn) | `far focus` 12.0064, `far focus_dist` 4.02735, `glare` 0.180536 |
| `higure` (dusk) | `size middle` 0.0464771, `far focus` 12.6869, `far focus_dist` 4.02735, `glare` 0.18748 |
| `black`, `music_1` | `size middle` 0.0464771, `far focus` 12.0064, `glare` 0.201367; `black` also `global alpha` 0 |
| `coldboot1/2` | as `black`, plus `emit vel mul` 3.7496 |
| `gameboot3/4` | 19 changes, including `delta time` 0.08; `gameboot4` also sets `global alpha` 0 |
| `welcome_1/2` | 31 changes, including `emit per frame` 70.5765 |

**The numbering is a sequence, not a duplicate.** `welcome_1` and `welcome_2` carry the same
`PARTICLES.mnu`, and so do `coldboot1` and `coldboot2`, which is why only one of each is in
`particles-themes.js` - but their other three files differ, so the console is walking a chain of
stages. `welcome_1` opens at a 158.7 degree field of view with a corner colour of (0.34, 1.16,
10); `welcome_2` closes at 81.24 with (0.12, 6.24, 8.93). Both run `EXPOSURE` 3.404 against the
base 1.05. `gameboot1` to `gameboot5` walk from a white corner through two black stages - the
third and fourth being the ones that touch the particles, the fourth with `global alpha` 0 -
and back out to white.

## What puts each set in

**Verified** in `custom_render_plugin` and its own `custom_render_plugin.rco`. The scene changes
set on animation events. Its `.rco` holds four animations whose steps fire `native:/anim_...`
events, and a table at `0x9cbc0` maps each event to a handler, which applies an
`override/<set>` to each of the scene's layers with a blend time (`0x39728`; the blend itself
runs in `qglbase`). Read from the `.rco`, with the fades of the logo left out:

| Animation | Started by | Steps |
|---|---|---|
| `anim_coldboot2` | event 1, sub-event 0, which `vsh.elf` sends | BootBG2 at 0; NormalBG2 at 4 s; ShowGUI at 5.5 s; Finished at 10 s |
| `anim_coldboot` | nothing in the code | BootBG1 and NormalBG at 0; ShowGUI at 5.5 s; Finished at 10 s |
| `anim_gameboot` | event 2 | BG2 at 0; BG3 at 0.5 s; Finished at 2.8 s |
| `anim_otherboot` | event 3 | BG3 at 0; BG4 at 0.2 s; Finished at 0.5 s |

And what the handlers apply:

| Event | Set | Blend |
|---|---|---|
| coldboot BootBG1 (`0xfa38`) | `coldboot1` | at once |
| coldboot BootBG2 (`0x110dc`) | `coldboot1` at once, then `coldboot2` | 3 s |
| coldboot NormalBG, NormalBG2 (`0x11bbc`, `0x11b20`) | the day cycle's set (`0x11600`) | 7.5 s |
| gameboot BG2 (`0xf440`) | `gameboot2` | 0.25 s |
| gameboot BG3 (`0xf210`) | `gameboot3` | 1.25 s |
| otherboot BG3 (`0xeb28`) | `gameboot3` | 0.2 s |
| otherboot BG4 (`0xe8f8`) | `gameboot4` | 0.3 s |

So:

- **`black` is where the scene starts.** Its start-up (`0x11d68`, in the plugin's vtable after
  `0x4050`) applies `override/black` at once, and right after it puts the cycle's set in over 5
  seconds - see [Theme Settings' Colour stops the
  clock](day-cycle.md#theme-settings-colour-stops-the-clock); how the two combine runs in `qglbase`.
  The cold boot then takes it to `coldboot1` at once and, 4 seconds in, over 7.5 seconds into the
  cycle - the opening the captures show, since `coldboot1` and `coldboot2` carry the same
  `PARTICLES.mnu`. Event 10's code names `black` too.
- **Launching a game** takes the particles to `gameboot2` in a quarter of a second and, half a
  second in, to `gameboot3` over 1.25 seconds - `delta time` 0.08, nine times the base - until the
  game takes the screen at 2.8 seconds. **Other content** goes to `gameboot3` in 0.2 seconds and to
  `gameboot4`, with `global alpha` 0, in 0.3 more.
- **Nothing applies `bright`, `welcome_1`, `welcome_2` or `initial_setting` in 4.93**: they are
  loaded with the rest (`0x388b8`) and named nowhere else. Neither does anything fire the handlers
  for gameboot BG1, BG4, BG5 and MoyouZoom (`0xf6c8`, `0xefe0`, `0xedb0`, `0xf8f8`), which apply
  `gameboot1`, `gameboot4` and `gameboot5` over 0, 0.5 and 0.5 seconds: an older sequence the table
  still carries.
- `music_1` is event 4 - see [Where the events come
  from](scene-events.md#where-the-events-come-from).

`particles-themes.js` plays the three sequences on the particle side, on top of the theme, as
`sequence` names them - see [Modelled choices](implementation.md#modelled-choices).

## The XMB starts by fading out of `coldboot1`

Five captures taken during start-up, across two boots, say what the opening transition is - and
it is not `welcome`. Fitting each capture's twelve corner channels against every pair of sets
lands on the same answer three times, to within 6e-7, which is float noise:

| Capture | Blend | Factor | Particles alive |
|---|---|---|---|
| 18:21:00 | `coldboot1` into the cycle's set | 0.458315 | 492 |
| 18:21:07 | same | 0.842647 | 1317 |
| 18:22:52 | same | 0.996244 | 2019 |
| 18:23:04 | settled | 1 | 2022 |
| 18:23:18 | settled | 1 | 2004 |

The particles' `glare` agrees on where it comes from: 0.201367 in the first two, which is
`coldboot1`'s value where the cycle at that hour would be holding `higure`'s 0.18748 - and
0.18748 exactly in the last two. But it does not agree on when: it was still sitting on the
coldboot value with the backdrop 84 per cent of the way across, and read 0.188132, 95 per cent,
where the backdrop was at 99.6. At boot the particle side trails the backdrop by much more than
the twentieth of a second it trailed by during the music change.

**And the pool fills from empty.** The draws carry 492 particles, then 1317, then 2019 and
about 2020 from there on. The console opens the XMB with nothing in the air and lets emission
fill it; `ps3xmbwave/` instead pre-warms 300 steps on its first frame, so the page opens full.
That is a deliberate difference, not a missing piece.

RPCS3 boots `vsh.self` directly, so what these captures see is the tail of the console's own
boot: the XMB coming up out of the `coldboot` sequence. Nothing in 4.93 applies `welcome_1` and
`welcome_2` - see [What puts each set in](#what-puts-each-set-in).

**The `gameboot` path is closed under RPCS3**, which cannot launch a game from the XMB, so
neither the boot sequence nor the return from it can be captured there. Every value of those
sets is already read out of the `.mnu` files, and the order and timing are now read out of the
scene's `.rco` - see [What puts each set in](#what-puts-each-set-in).

**Two other screens leave the set alone.** The first-run wizard does not run this scene at all, and
the XMB that comes up after it opens from `coldboot1` like any other; the saved-data utility keeps
the running set, so the way it dims the icons and defocuses the backdrop happens outside
`lines.qrc`. The captures that show it are in
[history](history.md#the-first-run-wizard-the-saved-data-utility-and-the-welcome-sets).

`tools/re/whichset.py` does this matching, for any capture: it fits the four corner colours
against every pair of sets and reads the particles' `glare` beside them.

## Telling the sets apart in a capture

Since a capture carries the corner colours as vertex constants and the particles' `glare` inside
the microcode, these four numbers name the set on screen, or the pair being crossfaded:

| Set | corner 1 | corner 4 | `FOVY` | `COLOUR SHADER` | `EXPOSURE` | `glare` |
|---|---|---|---|---|---|---|
| base | 1, 1, 1 | 0.925, 0.923, 0.923 | 71.85 | 0 | 1.05 | 0.159705 |
| `yoake` | = base | = base | 71.85 | 0 | 1.1 | 0.180536 |
| `day` | = base | = base | 71.85 | 0 | 1.05 | 0.201367 |
| `higure` | = base | = base | 71.85 | 0 | 1.2 | 0.18748 |
| `night` | = base | = base | 71.85 | 0 | 1.41 | 0.159705 |
| `music_1` | 0.579, 0.435, 0.472 | 0.5, 0, 0.5 | 83.2 | 1 | 1.51 | 0.201367 |
| `black` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1.41 | 0.201367 |
| `bright` | = base | 0.925, 0.924, 0.924 | 71.85 | 0 | 1.356 | - |
| `initial_setting` | 0, 0, 0 | 1, 0.9995, 0.9995 | 72 | 0 | 1.41 | - |
| `coldboot1` | 0.0021 grey | 0, 0, 0 | 71.8 | 0 | 1.64 | 0.201367 |
| `coldboot2` | = base | = base | 71.85 | 0 | 1.05 | 0.201367 |
| `gameboot1` | 0.0021, 0.0022, 0.0023 | 1.012, 0.952, 0.968 | 71.93 | 0 | 1.392 | - |
| `gameboot2` | 0.8, 0.8, 0.8 | 0, 0, 0 | 72 | 0 | 1.41 | - |
| `gameboot3` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1 | 0.423566 |
| `gameboot4` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1.41 | 0.423566 |
| `gameboot5` | 0, 0, 0 | 1, 0.9995, 0.9995 | 72 | 0 | 1.41 | - |
| `welcome_1` | 0.343, 1.157, 10 | 0.775, 1.814, 0.697 | 158.7 | 1 | 3.404 | 0.222198 |
| `welcome_2` | 0.123, 6.237, 8.927 | 0.228, 2.143, 10 | 81.24 | 1 | 3.404 | 0.222198 |

The day-cycle sets share the base backdrop, so only `glare` separates them - which is what the
cycle was measured with. Everything else has a corner colour of its own, and the two `welcome`
stages are unmistakable: no other set puts a colour above 1, let alone at 10.

**Verified: overrides apply at run time.** The glare value the XMB fed `particles_second`
was 0.201367, an override value rather than the base 0.159705.

## The music set

**Measured: `music_1` is playback, not the column.** Two savestates taken with the cursor
resting on the Music column, at 20:02 and 20:11, hold neither of the set's markers - `far
focus` 12.0064 occurs nowhere in either image, nor does `glare` 0.201367 - while the values
the running dusk-into-night blend was passing through occur in the hundreds. A savestate taken
later with a track actually playing settles it: the live `_Glare` reads **0.201367 exactly**,
the set's own value, at 23:34, where the day cycle would be holding night's 0.159705. So the
set replaces the cycle outright rather than blending with it.

**And the set reaches the whole scene, not just the particles.** `override/music_1/` carries
four files, and all four differ from the base:

| File | What changes |
|---|---|
| `PARTICLES.mnu` | the three values above |
| `LINE1.mnu` | 11 of 35: the wave rises and comes forward (`POS Y` -1.08844 to 0, `POS Z` -6.40287 to -5.2), turns (`ANG Y` 0.0867576 to 0.796751, `ANG ROT` 18.1208 to 13.1208), slows (`TIMESTEP` 4 to 3.72102), and its free-form deformation is rescaled |
| `HDR.mnu` | 10 of 17: `EXPOSURE` 1.05 to 1.51, `GLARE LEVEL` 1.10245 to 2.46, `GLARE THRESH` 0.738857 to 0.260814, wider Gaussian radii - the whole image blooms harder, which is why the wave reads as lit more strongly |
| `BACKGROUND.mnu` | all 14: the four corner colours go dark and magenta (corner 2 to black, corner 4 to 0.5, 0, 0.5), `FOVY` 71.846 to 83.2002, and `COLOUR SHADER` 0 to 1 |

**The GPU side of that table, from four frame captures taken with a track playing.** All four
read a live `_Glare` of 0.201367, the set's own value and steady across the 47 seconds they
span, so the transition was over before the first. The backdrop's four corner colours arrive
as vertex constants and are the set's, exactly: `c[464]` (0.5, 0, 0.5), `c[465]` (1.2, 1, 1.1),
`c[466]` (0.579004, 0.435001, 0.472), `c[467]` (0, 0, 0) - corner 4's magenta and corner 2's
black, which is the screen. The wave's own draw (`lines1`, 16384 vertices) carries only its
shading parameters, `MIPMAP BIAS` 1.86707, `BRIGHTNESS` 0.701917 and `FRESNEL` 0.638971, all
three the base values that this set does not touch, and its transform is the identity with z
flipped. So the wave's move is not in a matrix: the vertices arrive already placed. Comparing
the two buffers, over all 16384 vertices:

| | 21 September, no music | 24 September, playing |
|---|---|---|
| mean y | 0.536 | 2.406 |
| mean z | 8.080 | 6.965 |

It comes forward by 1.115, against the 1.203 that `POS Z` moves in the file, and rises by 1.87,
more than `POS Y`'s 1.088 on its own - the rest is `ANG Y` turning the whole band.

**Changing set is one crossfade, about eight seconds long.** Three more captures, seven and
eight seconds apart, caught it running. The backdrop's corner colours give the factor twelve
times over - four corners, three channels each - and they agree:

| | blend factor from the twelve channels | particle `glare` | as a factor |
|---|---|---|---|
| 00:28:55 | 0.146767 to 0.146771 | 0.165444 | 0.137751 |
| 00:29:02 | 0.999433 to 0.999448 | 0.201307 | 0.998560 |
| 00:29:10 | 1 | 0.201367 | 1 |

So the whole set is walked by a single number, the same shape as the day cycle. Its length is
only bounded: Alt+C freezes the emulation until the pad resumes it, so the seven and eight
seconds between the captures' timestamps are wall clock and include the freezes. A straight
line through the two interior points gives 8.2 seconds and a smoothstep 9.4, and the truth is
shorter than that by however long the machine stood still.

**The curve looks eased rather than straight**, on this argument: the particles trail the
backdrop by 0.009017 in the first capture and 0.000875 in the second, a ratio of ten. A
constant lag - the parameter block reaching the SPU a frame or two late, about a twentieth of
a second here - opens a gap proportional to how fast the factor is moving, so on a straight
line both gaps would be equal. A smoothstep's slope at those two points differs by 13.7 times.
The argument rests on the lag being a constant time, so it is a lean, not a proof.

The wave moves in the same window, and its geometry says so: mean y over the 16384 vertices
runs 0.536 with no music, 0.701 at the 15 per cent point, then 2.432 and 2.400 at the end -
against 2.406 in a capture taken ten minutes later with everything settled.

`ps3xmbwave/` applies only the particle column of that table. The rest - the wave's place and
tilt, the tone mapper, the backdrop without a month in it - waits for the wave's own pass,
where an override mechanism for `LINE1.mnu`, `HDR.mnu` and `BACKGROUND.mnu` would carry all
the hidden sets at once, not just this one.
