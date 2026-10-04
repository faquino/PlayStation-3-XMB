# The music set

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): `music_1`, the set the music
player puts in, what it changes across the scene, and how it comes in and goes out. The other sets,
and what puts each one in, are in [Parameter sets](parameter-sets.md).

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
| `BACKGROUND.mnu` | all 14: the backdrop fades to black at the bottom (colour 2) and the wave's light goes magenta at the right (colour 4, 0.5, 0, 0.5), `FOVY` 71.846 to 83.2002, which nothing reads - see [`COLOUR SHADER`](../background/firmware.md#colour-shader) - and `COLOUR SHADER` 0 to 1 |

**The GPU side of that table, from four frame captures taken with a track playing.** All four
read a live `_Glare` of 0.201367, the set's own value and steady across the 47 seconds they
span, so the transition was over before the first. `BACKGROUND.mnu`'s four colours arrive as
vertex constants and are the set's, exactly: `c[464]` (0.5, 0, 0.5), `c[465]` (1.2, 1, 1.1),
`c[466]` (0.579004, 0.435001, 0.472), `c[467]` (0, 0, 0) - colour 4's magenta and colour 2's
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

**Coming in takes 2 seconds, going out 5.5.** Three more captures, seven and eight seconds
apart, caught the music coming in. `BACKGROUND.mnu`'s colours give the factor twelve times
over - four colours, three channels each - and they agree:

| | blend factor from the twelve channels | particle `glare` | as a factor |
|---|---|---|---|
| 00:28:55 | 0.146767 to 0.146771 | 0.165444 | 0.137751 |
| 00:29:02 | 0.999433 to 0.999448 | 0.201307 | 0.998560 |
| 00:29:10 | 1 | 0.201367 | 1 |

So the whole set is walked by a single number, the same shape as the day cycle. **Verified** in
`custom_render_plugin` and `soundvisualizer_plugin`: the music player's visualizer starts and stops
the music through an interface the scene builds for it - see [Where the events come
from](scene-events.md#where-the-events-come-from) - and

- starting has the scene send itself event 4's sub-event 2, which puts `music_1` into each layer
  over 5.5 seconds (`0x16198`, through `0x39728`), unless it is in already;
- right after, the visualizer hands the scene its view, 0 for the XMB's own scene, and a view that
  differs from the last puts `music_1` in again over 2 seconds (`0x16a68`), from where the
  parameters stand;
- stopping sends sub-event 3, which puts in the set with an empty name - the base files, no
  override, as the name reads - over 5.5 seconds (`0x15694`), and 5.5 seconds later a timer lets go
  of the clock (`0x10658`), whose next tick puts the day cycle's set back over 1 second - see
  [Theme Settings' Colour stops the clock](day-cycle.md#theme-settings-colour-stops-the-clock). It
  also forgets the view (`0x1672c`), so the next start takes the 2 seconds again. A capture taken
  3.42 seconds into the way out, at 11:50:23 on 3 October, gives one factor, 0.678256, from the
  twelve colour channels, `EXPOSURE` and `WHITE LEVEL` alike, between `music_1`'s values and the
  base's, and `NIGHT WHIT BIAS` stays at the base's 0.5, where day's set would have moved it;
- starting again before then puts `music_1` back, and the timer does nothing.

**The 2 seconds are measured too.** The savestate taken with a track playing at 23:34 holds both
layers' windows from 0 to 2 seconds, their clocks stopped just past 3, one and a half times the end
(`0x3a06c`), `music_1` their current set and 0 the view (`0x9c930`). In the two captures of the
music coming in, 80 frames apart by [the noise's counter](../wave/postprocess.md#the-noise), the
particles trail the backdrop by the same 0.0083 of the window, one frame at 2 seconds, as they
trail it by a frame on the way out, 0.0043 of the factor at 5.5; and the 1.49 seconds between the
captures are the wave's lines' 90 steps. The backdrop's `_Alpha`, 0.199624 in the first, has run
0.574 seconds of its 2-second ease, 0.09 more than the window: the program changed with the
5.5-second put-in, 0.09 seconds before the visualizer's.

While the set is in or on its way out, the clock is held, so the hour does not move the scene: the
capture of the way out still reads the moment the music came in, 20 seconds before.

The wave moves in the same window, and its geometry says so: mean y over the 16384 vertices
runs 0.536 with no music, 0.701 at the 15 per cent point, then 2.432 and 2.400 at the end -
against 2.406 in a capture taken ten minutes later with everything settled.

`ps3xmbwave/` applies the particle and the wave columns of that table, as `musicPlayback` starts
and stops the music, the visualizer's view reaching the scene the capture's 0.09 seconds after
the start - see [Modelled choices](implementation.md#modelled-choices) - and every
other set's `LINE1.mnu`, `HDR.mnu` and `BACKGROUND.mnu` with its `PARTICLES.mnu`. The music's
backdrop program, `back_colours1`, is in the [backdrop notes](../background/program.md#back_colours1-the-musics).
