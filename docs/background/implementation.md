# The implementation in `ps3xmbwave/`

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md), whose
[Status](../../BACKGROUND_REVERSE_ENGINEER.md#status) table says, file by file, what is ported as
verified and what is modelled. This is the detail.

## What the recreation does

On `auto`, the gradient dropdown's default, `backdrop.js` draws what the console draws, into the 64 ×
32 buffer the passes after the wave read - see [The passes after the
wave](../wave/postprocess.md):

- [the programs](program.md), `back_colours0` and `back_colours1`, re-authored, as `COLOUR SHADER`
  picks, each eased in from a copy of the buffer by `_Alpha`, as the console's are - see
  [`_Alpha`](uniforms.md#_alpha);
- their uniforms worked out the way the scene does - see [What the uniforms read](uniforms.md) - from
  the moment `scene-themes.js` hands over (`xmbBackdropMoment`): the scene's clock on each of its
  ticks, a second apart, over a second, but none while the XMB's start, a content's boot or the
  music holds it; Theme Settings' Colour's noon on the 1st of its month; and 10:00 of the day over
  7.5 seconds as the XMB's start begins;
- `BACKGROUND.mnu`'s parameters as settings, which `scene-themes.js` moves with the rest of each set,
  `COLOUR SHADER` at once, as a whole number, a change of it easing in over 2 seconds;
- the scene's fade, Theme Settings' Brightness or the background given away, which dims the
  backdrop in the composite with the wave's light - see [The
  fade](../particles/scene-events.md#the-fade).

Fed the console's own wave mesh, the page's frame at 22:00 on 24 September is RPCS3's screenshot of
that moment, its backdrop to a level or two of 255 and its wave with the same golden fringes; at
17:09 on 23 September its backdrop is the screenshot's to two levels, five in the top left corner.
Under the music, with the page's own wave, the top of the screen is the screenshots' of 23:34 and
23:44 on 23 September to 3 levels on average and 9 at most, what is left being the glare of a wave
that is not the console's of the moment. At Theme Settings' Brightness -3, at 11:37 on 3 October,
the page's backdrop is the screenshot's wherever it shows alone, to a level on average and 3 at
most, over 445 patches; without the fade it would be 72 to 91 levels brighter in red. Under a
second into the music's way out, at 11:50:20 on 3 October, the top of the screen is the
screenshot's to 6 levels (rms), the program's ease and the colours' crossfade both under way.

The other presets, a month's gradient or the RGB sliders, draw that gradient into the same buffer as
they are, and the passes after the wave go over them all the same.

## What stays modelled

- **The month textures are cubic fits.** The firmware's are left out of the repository;
  `background-months.js` holds, for each of the 24 and each channel, the ten coefficients of the
  cubic in u and v that fits it best, written by `tools/re/month-fits.py` from the user's own
  `textures/month_bg`. They leave 0.4 to 3.2 levels of 255 (rms) of the textures, and the backdrop
  drawn from them is 0.3 to 1.5 levels (rms) from the one drawn from the textures, 11 at most.
- **The page's first frame.** The console's backdrop starts at midnight in January, with the
  months' program, and eases into what it is first handed; the page's first frame takes the moment
  and the program as they are, as if the XMB had been running.
- **The ticks' phase.** The scene's clock ticks on the page's whole seconds; the console's counts
  from its own start-up.
