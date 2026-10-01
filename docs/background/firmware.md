# The firmware: the textures and the programs

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md): what `lines.qrc` holds for the
backdrop, which way up the console draws it, and which of it the RSX holds at once.

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

## The textures are drawn upside down

`night/10` runs from (216, 146, 0) along its top edge to (5, 0, 0) along its bottom, and the
console puts that bright band along the **bottom** of the screen: the screenshots of 23 September
at 21:07, 23 October at 01:31 and 24 September at 22:00 all show black at the top warming to an
orange glow at the bottom. psdevwiki's `Lines.qrc` page says the same. The day textures are nearly
uniform top to bottom - `rgb/09` goes 202 to 207 - which is why only the night ones give it away.

`background-gradients-day.js` therefore mirrors every fitted record's vertical component as it
builds the presets, so the tables stay as the `dds/` tool fitted them and what the page draws is
what the screen shows.

## Two months are resident, never one

The RSX frame capture of 21 September holds exactly `rgb/09`, `rgb/10`, `night/09` and `night/10`
of the twenty-four, and nothing else. (Searched by two-pixel, eight-byte signatures: Morton
swizzling keeps neighbouring x pairs together, so those survive it.) Texture 1 is the running
month, texture 2 the next one.
