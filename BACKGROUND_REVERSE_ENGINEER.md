# The XMB background gradient

Notes on the coloured backdrop behind the wave, traced on the `particles-reeng` branch from
firmware 4.93 and from RPCS3 savestates. `SPLINE_REVERSE_ENGINEER.md` covers the wave itself and
`PARTICLES_REVERSE_ENGINEER.md` the sparkles.

This started from a plain observation: on 23 September the console draws an **amber** backdrop,
while every published table - psdevwiki's `Lines.qrc` page, the month presets in this repository -
says September is **magenta**. Neither is wrong. The XMB does not hold one colour per month, it
walks from one month's colour to the next across the month, and by the 23rd September has mostly
become October: the walk is `(day - 1) / days in month`, so that day is 73 per cent of the way
there.

## What the firmware has

`lines.qrc` carries twenty-four backdrop textures, `textures/month_bg/rgb/01..12.dds` and
`textures/month_bg/night/01..12.dds`, all 64 x 32 BGRA8888 with five mips. `09.dds` really is the
magenta one and `10.dds` really is the amber one, so the month naming is what everyone assumed.

They are drawn by `lib/moyou/back_colours0.fpo`, 538 instructions, whose parameter table names
everything that matters:

| Parameter | Kind | |
|---|---|---|
| `_MonthlyTex1Day` | sampler | TEXUNIT0 |
| `_MonthlyTex2Day` | sampler | TEXUNIT1 |
| `_MonthlyTex1Night` | sampler | TEXUNIT2 |
| `_MonthlyTex2Night` | sampler | TEXUNIT3 |
| `_MonthTime` | float | embedded at 0x13e0 |
| `_NightDayBlend` | float | embedded at 0x2190 |
| `_DayTime` | float | embedded at 0x3a0 |
| `_NightTime` | float | embedded at 0x10 |
| `_NightBrightness` | float | embedded at 0x1680 |
| `_Alpha` | float | embedded at 0x2020 |

Four textures at once, and the "1" and "2" of those names are two months, not two halves of one.
`back_colours1.fpo` (79 instructions, `_DayTime` and `_Alpha`) and `back_colours2.fpo` (2
instructions, `_Alpha`) are the cheap paths for when there is nothing to blend.

`BACKGROUND.mnu` modulates the result with four corner colours - white at the top, 0.847 and 0.925
grey at the bottom - a `FOVY` of 71.846 and a `COLOUR SHADER` flag.

**`COLOUR SHADER` picks which of the three runs, and the music player proves it.** Its
`override/music_1/BACKGROUND.mnu` flips the flag to 1 and repaints all four corners, corner 2 to
black and corner 4 to (0.5, 0, 0.5). A savestate taken with a track playing has `back_colours1`
live and patched, `_Alpha` 1, and the screen is magenta fading to black - not the amber the month
walk was on that evening. So in that screen the backdrop has no month texture in it at all; the
colour is the corner colours. `back_colours0` keeps being fed fresh uniforms in the same
savestate, so memory alone does not say it stopped running - the screen does.

## Two months are resident, never one

The RSX frame capture of 21 September holds exactly `rgb/09`, `rgb/10`, `night/09` and `night/10`
of the twenty-four, and nothing else. (Searched by two-pixel, eight-byte signatures: Morton
swizzling keeps neighbouring x pairs together, so those survive it.) Texture 1 is the running
month, texture 2 the next one.

## What the uniforms read

Read live out of the savestates, with the fragment microcode found in main memory and its patched
constant slots decoded (halves swapped, as always in fragment microcode):

Console clock, not host clock: the last row was taken with RPCS3's *Console time offset* moved
forward a month.

| When | `_MonthTime` | `_NightDayBlend` | `_DayTime` | `_NightTime` |
|---|---|---|---|---|
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

## Why the 23rd of September is amber

The screenshot's backdrop runs about (125, 102, 47) at the top to (191, 154, 71) at the bottom.
Fitting `screen = a * texture + b` - one gain and one additive haze, which is what the wave's glow
and the HDR pass amount to - September's texture needs a negative gain and cannot produce it at
all, while October's fits with a = 0.37 and b = 41, reproducing the green channel to within five
levels. A September-to-October mix of about 0.7 fits the channel ratios best, and `_MonthTime` 22
of a 30-day month is 0.73.

## What the recreation does

`bgGradientForDate` in `ps3xmbwave/background-gradients-day.js`, selected by the `auto` entry of
the gradient dropdown, walks this month's fitted gradient towards next month's, in the day tables
and in the night ones, and mixes those two by the time of day. Angles take the shorter way round.

The walk and the two ramps are the measured ones. What stays modelled:

- **That the shader spends `_MonthTime` linearly.** The uniform is measured exactly, but those 538
  instructions have not been followed to the end, and one of the things they do with it is a
  Gaussian - `exp(-0.01 (m - 15)^2)`, from the literals -15 and -0.0144269 at `fc[95]` and `fc[96]`
  - which may shape the walk rather than something else.
- **Blending two fitted gradients rather than four textures.** Each month is stored here as one
  linear gradient fitted to its texture, so a blend of two with different angles is an
  approximation of blending the textures themselves.
- Our backdrop is the raw gradient, at full alpha and without the console's tone map, which is why
  it comes out brighter and more saturated than the screen.

## Still open

- Whether the two ramps sit at the same hours all year. Every reading of the evening one is from
  late September and the only one of the morning from late October, so a pair a season apart would
  settle it.
- Whether the walk really is linear, or the Gaussian above shapes it.
- What animates `_Alpha`, which decides how bright the backdrop actually lands.
- The remaining uniforms of the 538-instruction program, which do more than blend four textures.

## How to repeat the readings

```bash
python tools/re/cgbin.py re-work/lines/lib/moyou/back_colours0.fpo --find-in <raw shader dir>
python tools/re/cgbin.py re-work/lines/lib/moyou/back_colours0.fpo --fc-table <raw>/<hash>.fp
```

and, for the live values, find that microcode in a decompressed savestate by a stretch of it that
holds no constant slots, then read the slots at the offsets the parameter table gives.
`tools/re/README.md` describes the technique.
