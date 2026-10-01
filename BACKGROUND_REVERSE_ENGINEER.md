# PlayStation 3 XMB backdrop: reverse engineering notes

The goal is a faithful reimplementation of the coloured backdrop behind the wave: the colour it
shows at any date and hour, and how it gets there. What is still open is listed under
[Still missing](#still-missing).

Everything here comes from firmware 4.93 as installed in RPCS3, and from its savestates and frame
captures, read during the particle pass with the tools in [`tools/re/`](tools/re/README.md).
**Verified** means checked against the firmware files or against what RPCS3 recorded while running
the XMB; anything else is marked as inferred. **Modelled** marks what the implementation in
`ps3xmbwave/` supplies until the code is found. [`WAVE_REVERSE_ENGINEER.md`](WAVE_REVERSE_ENGINEER.md)
covers the wave itself and [`PARTICLES_REVERSE_ENGINEER.md`](PARTICLES_REVERSE_ENGINEER.md) the
sparkles.

The XMB does not show one colour per month. It walks from one month's colour to the next across
the month, and mixes a day and a night texture by the hour - see
[What the uniforms read](docs/background/uniforms.md).

The notes are split by topic under [`docs/background/`](docs/background/), and this file is their
index. Read it first, then only the topics the task needs - see [Keeping these
notes](#keeping-these-notes).

## Topics

| File | What it covers |
|---|---|
| [`firmware.md`](docs/background/firmware.md) | The 24 textures in `lines.qrc` and the three programs that draw them, `BACKGROUND.mnu` and its `COLOUR SHADER`, which way up the textures go, the two months the RSX holds |
| [`uniforms.md`](docs/background/uniforms.md) | The live uniforms: the walk across the month, the day and night ramps, the animation clocks, `_Alpha` |
| [`implementation.md`](docs/background/implementation.md) | What `ps3xmbwave/` does with it, and what stays modelled |
| [`history.md`](docs/background/history.md) | Why the 23rd of September is amber, and what was ruled out |

## Status

What `ps3xmbwave/` ports as verified and what it models, file by file;
[`implementation.md`](docs/background/implementation.md) has the detail.

| File | Verified | Modelled |
|---|---|---|
| `background-gradients-day.js` | `bgGradientForDate`'s walk towards next month's colour, `(day - 1) / days in month`, and the two ramps that mix the night tables into the day ones, as measured. Every fitted record mirrored the way the screen shows it. | Each month as one linear gradient fitted to its texture by the `dds/` tool, two blended where the console blends four textures, and the walk spent linearly. That the walk reads the scene's clock, `xmbSceneDate`, which Theme Settings' Colour stops (inferred). |
| `background-gradients-night.js` | | The night tables, fitted the same way. |
| `spline.js` | | The backdrop's pass: the gradient drawn raw, at full alpha, with neither `BACKGROUND.mnu`'s corner colours nor the console's tone map. |

## Still missing

The implementation models all of these. They are listed roughly by how much each one changes the
backdrop on screen:

- What animates `_Alpha`, which decides how bright the backdrop actually lands.
- How `BACKGROUND.mnu`'s four corner colours modulate the textures, and `back_colours1`, which the
  music's set draws with the corners alone - see [What the firmware
  has](docs/background/firmware.md#what-the-firmware-has). The recreation draws neither.
- The remaining uniforms of the 538-instruction program, which do more than blend four textures.
- Whether the walk really is linear, or the Gaussian `back_colours0.fpo` applies to `_MonthTime`
  shapes it - see [What the recreation does](docs/background/implementation.md#what-the-recreation-does).
- Whether the ramps are straight. `custom_render_plugin`'s `0x52ad8`, which sets the month's
  textures and `_MonthTime`, also builds a value from two smoothsteps (`0x3e980`) of the time of
  day, between edges it keeps at +0x2dc to +0x2e8 of an object - most likely `_NightDayBlend`,
  which would make the ramps eased rather than straight. Not followed.
- Whether the two ramps sit at the same hours all year. Every reading of the evening one is from
  late September and the only one of the morning from late October, so a pair a season apart would
  settle it.
- Whether `_MonthTime` is the position in the month that `custom_render_plugin` works out in
  `0x10900`. The law is the same, but there February has 28 days in every year, where
  `bgGradientForDate` counts leap years, and Theme Settings' Colour stops that date at noon on the
  1st of a month - see
  [the particle notes](docs/particles/day-cycle.md#theme-settings-colour-stops-the-clock). A
  capture with a colour set, and one on the 29th of February of a leap year, would settle it.

## Keeping these notes

The rules for the three sets of notes are in [CLAUDE.md](CLAUDE.md#keeping-the-notes); these notes
add none of their own.
