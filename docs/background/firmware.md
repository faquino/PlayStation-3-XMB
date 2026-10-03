# The firmware: the textures and the programs

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md): what `lines.qrc` holds for the
backdrop, which way up the console draws it, and which of it the RSX holds at once.

## What the firmware has

`lines.qrc` carries twenty-four backdrop textures, `textures/month_bg/rgb/01..12.dds` and
`textures/month_bg/night/01..12.dds`, all 64 x 32 BGRA8888 with five mips. `09.dds` really is the
magenta one and `10.dds` really is the amber one, so the month naming is what everyone assumed.

They are drawn by `lib/moyou/back_colours0.fpo`, 538 instructions - see [The program](program.md) -
whose parameter table names everything that matters:

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
`back_colours1.fpo` (79 instructions, `_DayTime` and `_Alpha`) draws the backdrop instead under the
music and on the welcome screens, from no texture - see [The
programs](program.md#back_colours1-the-musics) - and `back_colours2.fpo` (2 instructions, `_Alpha`)
is one no set picks.

`BACKGROUND.mnu` holds four colours, a `FOVY` of 71.846 and a `COLOUR SHADER` flag. `FOVY` moves
nothing: registered with a default of 53, the camera's own field of view, it is turned into radians
as it changes and handed to a function that returns at once (`0x219b0`, `0x23ed4`), and nothing else
reads it - so the music's 83.2 changes nothing on screen. The colours are
not corners: the composite after the wave multiplies the backdrop by a gradient from colour 2 at
the bottom of the screen to colour 1 at the top, both white in the day's sets, and the wave's light
by one from colour 3 at the left to colour 4 at the right - see [The
composite](../wave/postprocess.md#the-composite). The day's sets' files carry seven more, which the
base file does not: `NIGHT BLEND`, `NIGHT2DAY BEGIN` and `END` (0 and 5.17), `DAY2NIGHT BEGIN` and
`END` (18.5 and 20.33), `DAYSPREAD` and `NIGHT WHIT BIAS` - the clocks' and the ramps' parameters,
see [What the uniforms read](uniforms.md).

## `COLOUR SHADER`

**It picks which of the three programs runs, and the music player proves it.** Its
`override/music_1/BACKGROUND.mnu` flips the flag to 1 and repaints all four colours: the backdrop's
gradient runs from pink at the top (colour 1, (0.579, 0.435, 0.472)) to black at the bottom (colour
2), and the wave's light turns magenta towards the right (colour 4, (0.5, 0, 0.5)). A savestate
taken with a track playing has `back_colours1` live and patched, `_Alpha` 1, and the screen is
magenta fading to black - not the amber the month walk was on that evening. So in that screen the
backdrop has no month texture in it at all; the colour is `back_colours1`'s under the set's
gradient. `back_colours0` keeps being fed fresh uniforms in the same
savestate, so memory alone does not say it stopped running - the screen does.

**It is a whole number, which a set puts in at once.** The files give it as `COLOUR SHADER:int:1`,
and the scene's whole-number parameters take a set's value as the set goes in: their own blend does
nothing (`0x1de90`). Its change reaches the backdrop as a program and a 2-second ease (`0x21a4c`,
`0x4fdf0`), and the program decides how `_DayTime` is worked out (`0x52ad8`) - see
[`_Alpha`](uniforms.md#_alpha). The capture of 00:28:55 on 24 September, 15% of the way into the
music's crossfade, already draws with `back_colours1`, 0.574 seconds into its ease. On the way out
the base set puts 0 back as the music stops: the screenshot of 11:50:20 on 3 October, taken under a
second in, already has `back_colours0`'s amber easing in, and fits the page's frame best with the
program changed within a quarter of a second of the stop, to 6 levels (rms) where only the backdrop
shows; the capture 3.42 seconds in draws with `back_colours0`, its ease over.

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
