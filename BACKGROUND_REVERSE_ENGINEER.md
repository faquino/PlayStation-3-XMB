# PlayStation 3 XMB backdrop: reverse engineering notes

The goal is a faithful reimplementation of the coloured backdrop behind the wave: the colour it
shows at any date and hour, and how it gets there. What is still open is listed under
[Still missing](#still-missing).

Everything here comes from firmware 4.93 as installed in RPCS3, and from its savestates, frame
captures and screenshots, read with the tools in [`tools/re/`](tools/re/README.md). **Verified**
means checked against the firmware files or against what RPCS3 recorded while running the XMB;
anything else is marked as inferred. **Modelled** marks what the implementation in `ps3xmbwave/`
supplies until the code is found. [`WAVE_REVERSE_ENGINEER.md`](WAVE_REVERSE_ENGINEER.md) covers the
wave itself and the passes after it, which the backdrop goes through too, and
[`PARTICLES_REVERSE_ENGINEER.md`](PARTICLES_REVERSE_ENGINEER.md) the sparkles.

The XMB does not show one colour per month. Its program takes this month's and next month's day
textures through hue, saturation and value, lights them by a clock that runs through the day with
two glows that go round with it, wipes next month in up the screen as the month goes on, and mixes
in the night's textures by the hour - see [The programs](docs/background/program.md) and [What the
uniforms read](docs/background/uniforms.md). Under the music and on the welcome screens a second
program draws it from no texture at all, and a change of program, like each tick of the scene's
clock, eases in from a copy of the backdrop.

The notes are split by topic under [`docs/background/`](docs/background/), and this file is their
index. Read it first, then only the topics the task needs - see [Keeping these
notes](#keeping-these-notes).

## Topics

| File | What it covers |
|---|---|
| [`firmware.md`](docs/background/firmware.md) | The 24 textures in `lines.qrc` and the three programs that draw them, `BACKGROUND.mnu` and its `COLOUR SHADER`, a whole number, which way up the textures go, the two months the RSX holds |
| [`program.md`](docs/background/program.md) | What `back_colours0` does: the smoothed texture reads, the hue-saturation-value round trip, the clocks' windows and glows, next month's wipe, the night's level; and `back_colours1`, the music's |
| [`uniforms.md`](docs/background/uniforms.md) | How the scene works out the programs' uniforms: the two clocks, the day and night ramps, the months, where the moment comes from, the XMB's start, `_Alpha` and its ease |
| [`implementation.md`](docs/background/implementation.md) | What `ps3xmbwave/` does with it, and what stays modelled |
| [`history.md`](docs/background/history.md) | Why the 23rd of September is amber, and what was ruled out |

## Status

What `ps3xmbwave/` ports as verified and what it models, file by file;
[`implementation.md`](docs/background/implementation.md) has the detail.

| File | Verified | Modelled |
|---|---|---|
| `backdrop.js` | `back_colours0` and `back_colours1`, re-authored, to float precision; their uniforms from the time of day, the date and `BACKGROUND.mnu`, as `0x52ad8` works them out, against every capture and savestate; the ease from a copy of the backdrop, as `0x52ef0` runs it; with the passes after the wave, RPCS3's screenshots to a level or two, and under the music to three. | The page's first frame, taken as it is. |
| `background-months.js` | | The 24 month textures as cubic fits, from 0.4 to 3.2 levels of 255 off them (rms). |
| `scene-themes.js` | `BACKGROUND.mnu`'s parameters in each set, the code's defaults where a set leaves them out, `DAYSPREAD` held to its range, `COLOUR SHADER` put in at once - the music's way in and out included; the moments the backdrop is handed - the clock's ticks, what holds them, the XMB's start's 10:00 over 7.5 seconds. | The ticks on the page's whole seconds. |
| `background-gradients-day.js`, `-night.js` | | The presets other than `auto`: each month as one linear gradient fitted to its texture by the `dds/` tool, drawn as it is. |

## Still missing

The implementation models all of these. They are listed roughly by how much each one changes the
backdrop on screen:

- **The copy the ease starts from.** That `0x52784` copies the backdrop as it stands is read from
  the code's shape; no capture caught a frame with that copy in it - see
  [`_Alpha`](docs/background/uniforms.md#_alpha).
- What `FOVY` does: neither program takes a field of view.

## Keeping these notes

The rules for the three sets of notes are in [CLAUDE.md](CLAUDE.md#keeping-the-notes); these notes
add none of their own.
