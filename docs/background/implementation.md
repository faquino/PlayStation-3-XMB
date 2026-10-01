# The implementation in `ps3xmbwave/`

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md), whose
[Status](../../BACKGROUND_REVERSE_ENGINEER.md#status) table says, file by file, what is ported as
verified and what is modelled. This is the detail.

## What the recreation does

`bgGradientForDate` in `ps3xmbwave/background-gradients-day.js`, selected by the `auto` entry of
the gradient dropdown, walks this month's fitted gradient towards next month's, in the day tables
and in the night ones, and mixes those two by the time of day. Angles take the shorter way round.
It reads the moment the scene's clock shows, which Theme Settings' Colour (`themeColor`) stops at
noon on the 1st of a month, so a colour puts it on that month's own daytime gradient - inferred, see
`0x10900` under [Still missing](../../BACKGROUND_REVERSE_ENGINEER.md#still-missing).

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
