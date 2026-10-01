# What the uniforms read

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md): the values `back_colours0.fpo`
is fed while it runs, and what they say about the month's walk and the hour.

Read live out of the savestates, with the fragment microcode found in main memory and its patched
constant slots decoded (halves swapped, as always in fragment microcode):

Console clock, not host clock: the last row was taken with RPCS3's *Console time offset* moved
forward a month. Every row but the first is a savestate; the first is an RSX frame capture, which
carries the same patched microcode and is far less trouble to take.

| When | `_MonthTime` | `_NightDayBlend` | `_DayTime` | `_NightTime` |
|---|---|---|---|---|
| 21 Sep 20:18 (frame capture) | 20 | 0.500186 | 1668.16 | 831.39 |
| 22 Sep 22:55 | 21 | 0.500053 | 2136.53 | 1093.00 |
| 22 Sep 23:03 | 21 | 0.500053 | 2165.29 | 1105.64 |
| 23 Sep 07:52 | 22 | 1 | 1093.38 | 1988.06 |
| 23 Sep 08:07 | 22 | 1 | 1103.95 | 2012.08 |
| 23 Sep 16:54 | 22 | 1 | 1347.52 | 490.97 |
| 23 Sep 20:02 | 22 | 0.534256 | 1631.51 | 803.83 |
| 23 Sep 20:11 | 22 | 0.508853 | 1651.01 | 818.69 |
| 23 Oct 01:32 | 21.2903 | 0.605699 | 363.13 | 1353.06 |

- **`_MonthTime` is the walk itself, on a thirty-day scale**: `(day - 1) * 30 / days in month`. In
  September, a thirty-day month, that is the day of the month minus one, which is what the first
  seven rows read. October gives the law away: 21.2903 on the 23rd is exactly `22 * 30 / 31`. So
  the share of the next month's colour is `_MonthTime / 30`, that is `(day - 1) / days in month`,
  and it steps once a day - there is no time-of-day term in it, or 01:32 would have added 0.06.
  The shader's own `exp(-0.01 (m - 15)^2)` is centred on 15, the middle of that same scale.
- **`_NightDayBlend` spans [0.5, 1]**, 1 in daylight and 0.500053 at its floor, so the daylight
  share it carries is `2 x - 1`: 0 at 22:55 and 23:03, 0.211 at 01:32, 1 at 07:52, 08:07 and 16:54,
  0.069 at 20:02 and 0.018 at 20:11. Two straight lines hold all eight to within 0.008 - **up from
  nothing at midnight to full daylight at 07:00, and down again between 17:15 and 20:15**. The
  floor is midnight, not the small hours: by half past one the backdrop is already a fifth of the
  way back towards its daylight colour, which the screenshot of that moment shows as a warm glow
  along the bottom of an otherwise black screen.
- **`_DayTime` and `_NightTime` are animation clocks.** They advance with emulated time, at rates
  that move with the emulator's speed (`_DayTime` gained 0.012/s over one interval and 0.036/s over
  another), and they do not encode the wall clock.
- `_NightBrightness` held 0.486059 in every savestate. `_Alpha` did not hold still at all - 0.038,
  0.939, 0.926, 0.550, 0.911, 0.352 across the eight - so it is animated by something else and is
  the reason our backdrop comes out about four times brighter than the console's.

RPCS3's shader cache carries an older copy of the same uniforms, from the first frame the program
was ever compiled for: `_Alpha` 0, `_MonthTime` 16 on 17 September (the day minus one again) and
`_NightDayBlend` 1. Only the date-driven one is worth reading there; the rest is start-up state.
