# What the uniforms read

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md): what the scene hands the
backdrop's programs every frame - see [The programs](program.md) for what they do with them - and how
it works each one out of the time of day, the date and `BACKGROUND.mnu`'s parameters.

**Verified** in `custom_render_plugin`'s `0x52ad8`, which sets them, and against every capture and
savestate taken with the XMB on screen: the live values are read out of the fragment microcode, with
the frame's inline transfers laid over it - see [`tools/re/README.md`](../../tools/re/README.md#a-captures-frame).

## The clocks

t is the time of day, 0 at midnight to 1, clamped to that range (`+0x1d0` of the backdrop's object).

- **`_NightTime`** is 2400 × fract(t + 0.5): a hundred times the hours since noon.
- **`_DayTime`** is 2400 × f(t), f a cubic through 0 at midnight and 1 at the next with `DAYSPREAD`
  for its slope at both ends (`0x52a28`, a Hermite curve): f(t) = 3t² - 2t³ + `DAYSPREAD` (t - 3t² +
  2t³). So it runs fast through the night and slowly about noon: under the day's sets, `DAYSPREAD`
  2.68, it passes 600 at 02:48 and 1800 at 21:12, and goes from 1104 at 08:07 to 1348 at 16:54.

Both are 2400 times 0 to 1, so [the program](program.md)'s windows, 600 to 1800, are fractions of
its clock, and its glows go round once a day. Every capture's two clocks are these to 0.08, the
seconds the capture's own time is known to, and every savestate's to within the minute its time is
known to.

Under `COLOUR SHADER` 1 (`back_colours1`, the music's), `_DayTime` is t × 1000 / 24 instead
(`0x92e64`), and nothing else is read. The music holds the scene's clock, so it stays where the music
came in: 0.52662, 00:18:12, through the four captures taken during one track, 0.836227, 00:28:54,
through the three that caught the next coming in, and 0.493092, 11:50:03 on 3 October, in the one
taken 3.42 seconds into the music's way out, 20 seconds later.

## The day and the night

- **`_NightDayBlend`** is 1 - `NIGHT BLEND` × (1 - s₁ (1 - s₂)), s₁ the smoothstep from
  `NIGHT2DAY BEGIN` to `END` and s₂ the one from `DAY2NIGHT BEGIN` to `END`, all four in hours
  (`0x3e980`). Under the day's sets, `NIGHT BLEND` 0.499947 and the ramps 00:00 to 05:10 and 18:30
  to 20:20: 0.500053 at midnight, 1 from 05:10 to 18:30, and the savestates' 0.6057 at 01:32 and
  0.5343 at 20:02 to within the minute their times are known to.
- **`_NightBrightness`** is `NIGHT WHIT BIAS`, 0.486059 under the day's sets.

The base `BACKGROUND.mnu` carries none of these, so the code's defaults stand for them (from
`0x23844` on): `NIGHT BLEND` 1, the ramps 04:00 to 06:00 and 18:00 to 20:00, `NIGHT WHIT BIAS` 0.5,
and `DAYSPREAD` 0 - below its range, 1 to 3, which the scene holds it to as it sets it (`0x1dd78`),
so it reads 1 and f(t) is t itself; the backdrop's own copy starts at 1 too (`0x584b4`). The sets
that carry none either, the music's, `black` and `gameboot2`, keep those: the capture of the
music's way out reads `_DayTime` 2400 t and `_NightBrightness` 0.5, where the day's sets had them
at the Hermite of 2.68 and 0.486.

## The months

The backdrop's object keeps the month as a number, 0 for January to 12 (`+0x1d4`): this month's two
textures are its whole part's, next month's the one after, and **`_MonthTime`** is its fraction times
30. The scene works that number out as the month less one, plus the day less one over the month's
length (`0x10900`), from a table that gives February 28 days in every year (`0x91cb0`), the 29th
counting as the 28th: October's 23rd reads 21.2903, which is 22 × 30 / 31.

## Where the moment comes from

The scene hands the backdrop its time of day and its month through `0x10900`, which works both out
from a moment and passes them on with a blend time (through `0x1adc8` and `0x1b090`, to the
backdrop's `0x4fe04` and `0x4fe18`). The moment is the scene's clock's, which ticks every second and
hands it over a second, unless something holds the clock - see [Theme Settings' Colour stops the
clock](../particles/day-cycle.md#theme-settings-colour-stops-the-clock). Until something is handed,
the backdrop's clock stands at midnight in January (`0x4fc40`).

## The XMB's start

The XMB's start hands the backdrop 10:00 of the day: `anim_coldboot_BootBG2`'s handler (`0x110dc`)
gives `0x10900` the date with its time set to 10:00:00, over 7.5 seconds. The start then holds the
clock until `ShowGUI` lets go of it 5.5 seconds in, and the clock's next tick hands the hour over a
second. The captures taken in the cold boot's first seconds read `_NightTime` 2200 and `_DayTime`
1166, whatever the hour, on the date's own month: 10:00 3.9 seconds in, the hour 7.5 seconds in.
Their `_Alpha` is the 7.5-second ease's - see below: 0.0688 and 0.4314, 1.20 and 3.41 seconds into
it, where the wave's lines had stepped 73 and 205 times, 1.22 and 3.42 seconds of their 60 Hz.

## `_Alpha`

**Verified** in the code. The backdrop keeps a timer and an ease's length (`+0x1d8` and `+0x1dc`).
Handing it a time of day or a month (`0x4fe04`, `0x4fe18`) sets the length to the blend time handed
with it, a change of `COLOUR SHADER` (`0x4fdf0`) to 2 seconds, and both zero the timer. Each frame
(`0x52ef0`), if the timer is 0 the 64 × 32 buffer is first copied into another (`0x52784`); then that
copy is drawn into the buffer (draw 0, `Copy` from `0x2c02600`) and the program over it (draw 1),
blended by `_Alpha`, the smoothstep of the timer over the length (`0x453ac`); and the timer moves on
by the frame's time until it reaches one and a half lengths. That the copy is of the buffer as it
stands is read from the code's shape: no capture caught a frame with it.

So at rest, with the clock's tick every second over a second, `_Alpha` is the smoothstep of n / 60
at 60 frames a second, n a whole number: 20/27 is the smoothstep of 2/3, 0.104 of 1/5, 0.71825 of
13/20. In the 11 captures and 6 savestates taken at rest with `back_colours0`, n comes out whole (to
0.0001 in the captures), and 16 and 39 come up twice each. What the backdrop shows is the program's
output eased in over a second, which is why the screenshots match the program's output without
`_Alpha` in it. While the music holds the clock no tick comes, and `_Alpha` stays 1; as the music
came in, the capture of 00:28:55 caught the change of program's 2-second ease 0.574 seconds in, at
0.199624. On its way out the program goes back as the music stops: the screenshot of 11:50:20 on
3 October, under a second in, has `back_colours0`'s amber easing in, and the capture 3 seconds
later has the ease over, `_Alpha` 1, under the base's colours 68% of the way in.
