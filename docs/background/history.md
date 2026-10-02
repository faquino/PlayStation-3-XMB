# History: superseded readings, closed investigations and dead ends

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md). Nothing here is needed for
everyday work: the topics hold what is known now. Read it to reopen a question, or before following
a lead that may already be ruled out.

## Ruled out

- **A month showing its own colour throughout.** psdevwiki's `Lines.qrc` page and the month
  presets in this repository give one colour per month, but the console walks from one month's
  colour to the next across the month - see [Why the 23rd of September is
  amber](#why-the-23rd-of-september-is-amber) and [What the uniforms read](uniforms.md).
- **`BACKGROUND.mnu`'s four colours as the backdrop's corners**, white at the top and grey at the
  bottom. Two of them are the ends of a gradient the backdrop is multiplied by, top to bottom, and
  the other two of one the wave's light is, left to right - see [The
  composite](../wave/postprocess.md#the-composite).
- **The walk across the month spent linearly**, next month's colour a straight (day - 1) / days of
  the way. The program wipes next month in up the screen, from the bottom - see [Next
  month](program.md#next-month).
- **`_DayTime` and `_NightTime` as animation clocks running at the emulator's speed.** Both are the
  time of day: `_NightTime` a hundred times the hours since noon, `_DayTime` a cubic of the hour that
  runs fast at night and slowly by day, which is why it seemed to change speed - see [The
  clocks](uniforms.md#the-clocks).
- **The two ramps as straight lines** from midnight to 07:00 and from 17:15 to 20:15: they are
  smoothsteps between hours `BACKGROUND.mnu` sets, 00:00 to 05:10 and 18:30 to 20:20 in the day's
  sets - see [The day and the night](uniforms.md#the-day-and-the-night).
- **`_Alpha` as what decides how bright the backdrop lands**, the reading that was to explain why
  the page's backdrop came out four times too bright. It eases the program in from a copy of the
  backdrop, each second at rest, and the brightness was the program's own work - see
  [`_Alpha`](uniforms.md#_alpha) and [The programs](program.md).
- **The XMB's start's 10:00 as the backdrop's own default.** Its clock starts at midnight
  (`0x4fc40`); `BootBG2` hands it the 10:00 - see [The XMB's start](uniforms.md#the-xmbs-start).

## Why the 23rd of September is amber

This started from a plain observation: on 23 September the console draws an **amber** backdrop,
while every published table - psdevwiki's `Lines.qrc` page, the month presets in this repository -
says September is **magenta**. Neither is wrong. The XMB does not hold one colour per month, it
walks from one month's colour to the next across the month, and by the 23rd September has mostly
become October: the walk is `(day - 1) / days in month`, so that day is 73 per cent of the way
there.

The screenshot's backdrop runs about (125, 102, 47) at the top to (191, 154, 71) at the bottom.
Fitting `screen = a * texture + b` - one gain and one additive haze, which is what the wave's glow
and the HDR pass amount to - September's texture needs a negative gain and cannot produce it at
all, while October's fits with a = 0.37 and b = 41, reproducing the green channel to within five
levels. A September-to-October mix of about 0.7 fits the channel ratios best, and `_MonthTime` 22
of a 30-day month is 0.73. The program, read since, does it otherwise - next month wiped in up the
screen, under a hue-saturation-value treatment - see [The program](program.md).
