# The day cycle: four windows, and the clock that walks them

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md). What each set carries, and how to
tell them apart in a capture, is in [Parameter
sets](parameter-sets.md#telling-the-sets-apart-in-a-capture).

## Themes blend over hours

**Measured.** The cycle's four sets - `yoake` (dawn), `day`, `higure` (dusk) and `night` - follow
the hour, each blending into the next along a smoothstep.

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

How each window was measured is in [history](history.md#how-the-day-cycle-was-measured).

## Theme Settings' Colour stops the clock

**Verified** in `custom_render_plugin` and `sysconf_plugin`. The scene keeps the day cycle on the
clock through `0x11c58`, which it calls three ways:

- every second, from a 1000 ms timer its start-up sets (`0x12128`, calling `0x12284`), over 1
  second;
- once from the start-up itself, right after `black` goes in, over 5 seconds (`0x12138`);
- from event 0, sub-event 6, over 1 second.

It takes the clock's moment (`0x86b58`) or, while Theme Settings' Colour holds a month, noon on
the 1st of that month, and hands it on with the same blend time to `0x11600`, which puts in the
day cycle's set for that moment, and to `0x10900`. That one gives the particle object the time of
day, as a fraction of 86400 seconds (`0x1adc8`), and works out how far the date is into its month,
the day minus one over the month's length - the law the backdrop's `_MonthTime` follows, see
`BACKGROUND_REVERSE_ENGINEER.md` - except that its table gives February 28 days in every year and
the 29th counts as the 28th. Where that goes from there is not followed.

`0x11c58` does nothing while one of the scene's own states, all in the struct at `0xa03a8`, holds
the moment:

- the cold boot, from `BootBG1` or `BootBG2` until `ShowGUI` lets go at 5.5 seconds;
- a game's or another content's boot, events 2 and 3;
- a moment Date and Time Settings is showing - sub-event 4, below;
- a fade of sub-event 2 or 3, until a fade back has run its time: sub-event 2 sets a timer for it,
  whose callback (`0x2e60`) lets go;
- the music, event 4, while its set is in or on its way out - see [The music
  set](parameter-sets.md#the-music-set);
- the first five seconds after the start-up, which the timer counts down (`+0x20`, set to 5).

The cold boot's own handlers read the clock whatever the colour (`BootBG2`, `NormalBG` and
`NormalBG2`), so a colour comes back only once `ShowGUI` has let go.

**Sub-event 6 is Theme Settings' Colour.** The handler (`0x15b54`) keeps its argument at `+0x10`
and calls `0x11c58` over 1 second. Colour is Theme Settings' second item (`msg_color`,
`page_theme_config_color`), and its page (`0x11f50`) holds a value from 0 to 12: at 0 the scene
follows the clock, and 1 to 12 it reads as months. `sysconf_plugin` sends the entry under the
cursor half a second after it lands there (`0x12078` starts the timer again on every call, and
`0x12174` sends), the one chosen when it is confirmed (`0x135e0`, which also writes it to registry
key 0x5f), and the saved one again when the page is cancelled (`0x12474`). `system_plugin` sends
it as it applies the theme, beside the brightness (`0x9340`).

So any colour but 0 stops the scene's clock at noon on the 1st of its month, whatever the hour:
the particles hold the `day` set, which the cycle keeps from 11:00 to 13:00. By the law above the
backdrop should sit on that month's own daylight textures, with nothing of the next -
`_MonthTime` 0 and `_NightDayBlend` 1 - which a capture taken with a colour set would confirm.
Back at 0, the clock's moment comes in over a second. `themeColor` stands for the setting - see
[Modelled choices](implementation.md#modelled-choices).

**Sub-event 4 is Date and Time Settings.** `sysconf_plugin` sends it a pointer to the moment being
set, and 0 when it is done (`0x7fc64`). With a pointer the handler (`0x15b0c`) holds the clock
and, unless a colour is set, shows that moment over 1 second through `0x10900` and `0x11600`; with
0 it lets the clock go again.
