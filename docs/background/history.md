# History: superseded readings, closed investigations and dead ends

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md). Nothing here is needed for
everyday work: the topics hold what is known now. Read it to reopen a question, or before following
a lead that may already be ruled out.

## Ruled out

- **A month showing its own colour throughout.** psdevwiki's `Lines.qrc` page and the month
  presets in this repository give one colour per month, but the console walks from one month's
  colour to the next across the month - see [Why the 23rd of September is
  amber](#why-the-23rd-of-september-is-amber) and [What the uniforms read](uniforms.md).

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
of a 30-day month is 0.73.
