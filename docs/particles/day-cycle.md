# The day cycle: its schedule, the blend between sets, and the clock

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md). What each set carries, and how to
tell them apart in a capture, is in [Parameter
sets](parameter-sets.md#telling-the-sets-apart-in-a-capture).

## Themes blend over hours

**Verified** in `custom_render_plugin`, and measured. The cycle's four sets - `yoake` (dawn),
`day`, `higure` (dusk) and `night` - follow the hour, each blending into the next along a
smoothstep. The scene keeps the schedule as a table of times and sets (`0x9c98c`): night at 00:00
and 01:00, `yoake` at 05:00 and 07:00, `day` at 11:00 and 13:00, `higure` at 17:00 and 19:00, night
at 23:00 and 24:00. `0x11600` finds the stretch the moment falls in and how far into it the moment
is, a straight line; where the stretch's two sets differ it blends them by that much with the
smoothstep below (`0x39d6c`), and where they are the same it puts that set in.

The transitions start at 07:00, 13:00 and 19:00, four hours each, **every six hours**,
with two hours of one set in between, which puts the fourth at 01:00 and gives the holds it
implies: dawn from 05:00, day from 11:00, dusk from 17:00, night from 23:00.

| Window | Blend | How it is known |
|---|---|---|
| 01:00-05:00 | night into `yoake` | one savestate, `glare` |
| 07:00-11:00 | `yoake` into `day` | two savestates, `size middle` and `glare` |
| 13:00-17:00 | `day` into `higure` | one savestate, `glare` |
| 19:00-23:00 | `higure` into night | two frame captures, `size middle` and `far focus` |

All four windows are measured, and against the six measured moments the cycle lands within
0.07%.

**The wave's set moves by the same factor.** The wave's draw carries three of `LINE1.mnu`'s
values - see [The draw's uniforms](../wave/shading.md#the-draws-uniforms). In each of the ten
resting captures they fit a blend of two of the cycle's sets to within 7e-8, by the factor the
particles' `glare` gives in the same capture, to four decimals. 21 September at 20:18 is `higure`
0.2527 of the way to night by both, and 24 September at 22:00 is 0.8464 by both.

How each window was measured is in [history](history.md#how-the-day-cycle-was-measured).

## How one set blends into another

**Verified** in `custom_render_plugin` and `qglbase`. Each parameter of a set is an object of the
scene's own (`0x225a4` makes the floats) that keeps five values: its default, where it stands, its
target, where its blend started, and a spare. Putting a set in with a blend time (`0x39728`)
hands the parameters the set's values as targets, copies where each stands to where its blend
starts (`0x38304`, through `qgl_base`'s `b95a43ec`), and opens a window on the layer's clock from
now to now plus the blend time. Every frame the clock moves on by the frame's time (`0x3a06c`,
from `paf`'s `873c6688`), and `qgl_base` hands each parameter the window and the clock, whose
blend (`0x1e8c8`) puts it at, with t how far through the window the clock is:

- `from + (target - from) × (3t² - 2t³)` under mode 2;
- `from + (target - from) × t` under mode 0;
- 1% more of the way to its target each frame, whatever the window, under mode 1;
- its target at once under any other.

The mode is a variable `qgl_base` exports (`ce5d9f19`), which starts at 2, and mode 1's 1% is
another (`202298a3`). Only the cold boot moves it: `BootBG1` and `BootBG2` set 1, and `NormalBG`
and `NormalBG2`, 4 seconds in, set 2 back; the day's blend of two sets (`0x39d6c`) sets 2 for its
own sake and puts the mode back. So every change of set is a smoothstep over its time from
wherever the parameters stand, bar the cold boot's first 4 seconds, where `coldboot2` comes in by
the exponential approach - its particles are `coldboot1`'s.

Every file of a set blends this way, `HDR.mnu` and `BACKGROUND.mnu` with the rest: in the captures,
the passes after the wave run on the sets blended by the factor `BACKGROUND.mnu`'s colours give,
`WHITE LEVEL` itself rather than the 1 / W² the program takes - see [The passes after the
wave](../wave/postprocess.md#what-hdrmnu-drives). A parameter a set's file leaves out takes the base file's value,
and one the base file leaves out too the code's default: so `BACKGROUND.mnu`'s day and night
parameters, which only the day's sets and a few others carry - see [What the uniforms
read](../background/uniforms.md#the-day-and-the-night). Each blend then holds the parameter to the
range it was registered with beside its default (`0x225a4` and `0x22a50` register the floats,
`0x1dd78`, which the blend calls, holds them). Of the six files' parameters, only `DAYSPREAD` can be
put outside its range, by a set that leaves it out: its default, 0, lies below its 1 to 3, so a
blend towards it stops at 1. Every value the base and override files carry lies within its range,
the welcome sets' `HDR.mnu` at the top of theirs (`WHITE LEVEL` 1000, `GLARE LEVEL`, `GLARE THRESH`
and `GLARE SUM POW` 100, `GAUSSIAN RAD` 2.9), and `THINNESS`'s default, 10, above its 0 to 1, never
counts, since the base file carries it. A name a file carries and the scene does not register -
`GAMMA` in music's `HDR.mnu`, `NEUTRINOS X` in `gameboot2`'s `BACKGROUND.mnu` - is not read.

A set put in at once resets each parameter to its default and hands its values over as where the
blend starts rather than as targets (`0x5245c`), which mode 1 does not read. **`coldboot1` takes
hold at once all the same, measured.** Mode 1 moves a parameter by (target - where it stands) ×
0.01 each time it is blended, and puts it on the target once that move is small enough
(`0x1ea04`). In the four captures taken in the cold boot's first 4 seconds, the wave's
`BRIGHTNESS`, `MIPMAP BIAS` and `FRESNEL`, which differ between the two sets, are `coldboot1`'s
with 0.99^n of the way to `coldboot2`'s still to go: n is 61 and 184 in one boot, 64 and 220 in
another, whole numbers to within 0.001 and the same for the three, and `BACKGROUND.mnu`'s colours
give the same factor. In the capture of 18:22:52 they agree again, on `NormalBG2` having come 228
frames in, and on the parameters being 96.286 per cent of the way from there to the cycle's set.

**The clock's first tick ends the XMB's start.** `NormalBG2`'s 7.5 seconds are never run out:
once `ShowGUI` lets go of the scene's clock at 5.5 seconds, its next tick puts the cycle's set in
over a second (`0x11c58`, `0x11600`), and `0x39d6c`, which does it for each of the scene's layers,
stops the sequence playing, sets the layer's clock to 0 and opens the second's window from where
the parameters stand (`0x38158`, `0x38304`). The two boot captures taken after `ShowGUI` agree:
at 18:22:52, 405 of the lines' steps after the reset, 96.3 per cent is where a tick at 5.87
seconds leaves the parameters, and at 19:34:54, 451 steps in, they are on the cycle's set, where
`NormalBG2`'s smoothstep alone would have them a third and not half of the way. From the
console's own start the page draws both to the thousandth - see [Against the
console](../wave/implementation.md#against-the-console).

**And the clocks keep step.** Every frame the scene hands a layer's update and the layer's clock
the same frame time, in one call (`0x14820`, and `0x143c4` for the layers in its list, then
`0x3a06c`), and the renderer passes it on unchanged to the lines' accumulator and the backdrop's
ease (`0x27d64`, `0x56f1c`, `0x53778`, `0x52ef0`). Under RPCS3 at rest that time is 1/60 of a
second exactly: the lines of all nine savestates hold their last frame's time × 60 as 1.0000001,
and every resting capture's backdrop `_Alpha` is the smoothstep of a whole number of sixtieths of
its ease. They keep step as the music comes in too, whose blend runs over 2 seconds rather than
5.5 - see [The music set](music.md).

## Theme Settings' Colour stops the clock

**Verified** in `custom_render_plugin` and `sysconf_plugin`. The scene keeps the day cycle on the
clock through `0x11c58`, which it calls three ways:

- every second, from a 1000 ms timer its start-up sets (`0x12128`, calling `0x12284`), over 1
  second;
- once from the start-up itself, right after `black` goes in, over 5 seconds (`0x12138`);
- from event 0, sub-event 6, over 1 second.

It takes the clock's moment (`0x86b58`) or, while Theme Settings' Colour holds a month, noon on
the 1st of that month, and hands it on with the same blend time to `0x11600`, which puts in the
day cycle's set for that moment, and to `0x10900`. That one works out the time of day, as a
fraction of 86400 seconds, and how far the date is into its month, the day minus one over the
month's length from a table that gives February 28 days in every year, the 29th counting as the
28th, and hands both to the backdrop with that blend time (`0x1adc8`, `0x1b090`) - its clocks and
`_MonthTime`, see [What the uniforms read](../background/uniforms.md#where-the-moment-comes-from).

`0x11c58` does nothing while one of the scene's own states, all in the struct at `0xa03a8`, holds
the moment:

- the cold boot, from `BootBG1` or `BootBG2` until `ShowGUI` lets go at 5.5 seconds;
- a game's or another content's boot, events 2 and 3;
- a moment Date and Time Settings is showing - sub-event 4, below;
- a fade of sub-event 2 or 3, until it has run its time: each starts the same timer for its
  milliseconds (`0x15ad4`), whose callback (`0x2e60`) lets go;
- the music, event 4, while its set is in or on its way out - see [The music
  set](music.md);
- the first five seconds after the start-up, which the timer counts down (`+0x20`, set to 5).

The cold boot's own handlers read the clock whatever the colour (`BootBG2`, `NormalBG` and
`NormalBG2`), so a colour comes back only once `ShowGUI` has let go. `BootBG2` hands `0x10900` the
day's date at 10:00:00 over 7.5 seconds (`0x110dc`), which the backdrop shows until then.

**Sub-event 6 is Theme Settings' Colour.** The handler (`0x15b54`) keeps its argument at `+0x10`
and calls `0x11c58` over 1 second. Colour is Theme Settings' second item (`msg_color`,
`page_theme_config_color`), and its page (`0x11f50`) holds a value from 0 to 12: at 0 the scene
follows the clock, and 1 to 12 it reads as months. `sysconf_plugin` sends the entry under the
cursor half a second after it lands there (`0x12078` starts the timer again on every call, and
`0x12174` sends), the one chosen when it is confirmed (`0x135e0`, which also writes it to registry
key 0x5f), and the saved one again when the page is cancelled (`0x12474`). `system_plugin` sends
it as it applies the theme, beside the brightness (`0x9340`).

So any colour but 0 stops the scene's clock at noon on the 1st of its month, whatever the hour:
the particles hold the `day` set, which the cycle keeps from 11:00 to 13:00, and the backdrop sits
on that month's own daylight textures, with nothing of the next - `_MonthTime` 0 and
`_NightDayBlend` 1. No capture has been taken with a colour set.
Back at 0, the clock's moment comes in over a second. `themeColor` stands for the setting - see
[Modelled choices](implementation.md#modelled-choices).

**Sub-event 4 is Date and Time Settings.** `sysconf_plugin` sends it a pointer to the moment being
set, and 0 when it is done (`0x7fc64`). With a pointer the handler (`0x15b0c`) holds the clock
and, unless a colour is set, shows that moment over 1 second through `0x10900` and `0x11600`; with
0 it lets the clock go again.
