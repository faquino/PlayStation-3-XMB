# The XMB background gradient

Notes on the coloured backdrop behind the wave, traced on the `particles-reeng` branch from
firmware 4.93 and from RPCS3 savestates. `SPLINE_REVERSE_ENGINEER.md` covers the wave itself and
`PARTICLES_REVERSE_ENGINEER.md` the sparkles.

This started from a plain observation: on 23 September the console draws an **amber** backdrop,
while every published table - psdevwiki's `Lines.qrc` page, the month presets in this repository -
says September is **magenta**. Neither is wrong. The XMB does not hold one colour per month, it
walks from one month's colour to the next across the month, and by the 23rd September has mostly
become October.

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

## Two months are resident, never one

The RSX frame capture of 21 September holds exactly `rgb/09`, `rgb/10`, `night/09` and `night/10`
of the twenty-four, and nothing else. (Searched by two-pixel, eight-byte signatures: Morton
swizzling keeps neighbouring x pairs together, so those survive it.) Texture 1 is the running
month, texture 2 the next one.

## What the uniforms read

Read live out of the savestates, with the fragment microcode found in main memory and its patched
constant slots decoded (halves swapped, as always in fragment microcode):

| When | `_MonthTime` | `_NightDayBlend` | `_DayTime` | `_NightTime` |
|---|---|---|---|---|
| 17 Sep, ~19:28 (shader cache) | 16 | 1 | 1168.77 | 2200 |
| 22 Sep 22:55 | 21 | 0.500053 | 2136.53 | 1093.00 |
| 22 Sep 23:03 | 21 | 0.500053 | 2165.29 | 1105.64 |
| 23 Sep 07:52 | 22 | 1 | 1093.38 | 1988.06 |
| 23 Sep 08:07 | 22 | 1 | 1103.95 | 2012.08 |
| 23 Sep 16:54 | 22 | 1 | 1347.52 | 490.97 |
| 23 Sep 20:02 | 22 | 0.534256 | 1631.51 | 803.83 |
| 23 Sep 20:11 | 22 | 0.508853 | 1651.01 | 818.69 |

- **`_MonthTime` is the day of the month minus one**: 16 on the 17th, 21 on the 22nd, 22 on the
  23rd. Three separate days agree.
- **`_NightDayBlend` spans [0.5, 1]**, 1 in daylight and 0.500053 at night, so the daylight share
  it carries is `2 x - 1`. That share was 0.0685 at 20:02 and 0.0177 at 20:11, nine minutes apart:
  a straight line through those two reaches zero at **20:14** and one at **17:17**, and 16:54 still
  reading exactly 1 is consistent with it. Both night samples sit on the floor to six digits.
- **`_DayTime` and `_NightTime` are animation clocks.** They advance with emulated time, at rates
  that move with the emulator's speed (`_DayTime` gained 0.012/s over one interval and 0.036/s over
  another), and they do not encode the wall clock.
- `_NightBrightness` held 0.486059 in every savestate.

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

Modelled, not traced:

- **The shape of the walk.** Linear in `(day - 1) / days in month`. Only the uniform is measured;
  how the shader spends it is not. There is a Gaussian in it - `exp(-0.01 (m - 15)^2)`, built from
  literals -15 and -0.0144269 at `fc[95]` and `fc[96]` - centred on the middle of the month, but it
  feeds something else in those 538 instructions and has not been followed to the end.
- **The dawn ramp.** The dusk one is measured (17:17 to 20:14, rounded to 17:15 and 20:15 in the
  code); dawn is that one mirrored about noon. All that is actually known is that it is over by
  07:52, where a savestate reads full daylight.
- Our backdrop is the raw gradient. The console tone maps it, which is why the screen looks less
  saturated and more washed towards white than the textures do.

## Still open

- What the PPU puts in `_NightDayBlend`, and whether the ramp is the same every day of the year.
  A savestate between 01:00 and 05:00 would pin the dawn end the same way two at dusk pinned the
  evening.
- Whether the walk really is linear, or the Gaussian above shapes it.
- The remaining uniforms of the 538-instruction program, which do more than blend four textures.

## How to repeat the readings

```bash
python tools/re/cgbin.py re-work/lines/lib/moyou/back_colours0.fpo --find-in <raw shader dir>
python tools/re/cgbin.py re-work/lines/lib/moyou/back_colours0.fpo --fc-table <raw>/<hash>.fp
```

and, for the live values, find that microcode in a decompressed savestate by a stretch of it that
holds no constant slots, then read the slots at the offsets the parameter table gives.
`tools/re/README.md` describes the technique.
