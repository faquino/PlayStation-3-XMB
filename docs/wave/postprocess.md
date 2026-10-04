# The passes after the wave: composite, tone curve and glare

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): what the console does with the wave's light
and the backdrop between the wave's draw and the particles' - see [The draw](shading.md#the-draw) -
and what `HDR.mnu` and `BACKGROUND.mnu` do there.

**Verified** from the frame captures: the programs from RPCS3's decompilation, the order of the
draws, their targets and their textures from the captured state (`rrc.py frame`), the uniforms from
the microcode with the frame's inline transfers laid over it, and the tables and the noise the
composite reads from the captured memory - see
[`tools/re/README.md`](../../tools/re/README.md#a-captures-frame).
And from `custom_render_plugin`, whose HDR renderer, built with the scene (`0x7140c`), makes the
tables, the noise and the glare's weights - see [The HDR renderer](#the-hdr-renderer).

## The frame

The capture of 24 September at 22:36:48; every capture with a scene has the same draws.

| Draws | Program | Target | What it does |
|---|---|---|---|
| 0, 1 | `Copy`, `back_colours0` | the backdrop, 64 × 32, RGBA16F | see the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md) |
| 2, 3 | `ffd_shader1`, `ffd_alpha_blend` | 128 × 1 | the [lattice](ffd.md) |
| 4 | `lines1` | its own 1920 × 1080, A8R8G8B8, cleared | the wave's light in `_Encode`'s two channels, red and green only, added (`ONE, ONE`) |
| 5 | `LinesController` | the screen, A8R8G8B8 | the composite and the tone curve |
| 6 | `GlareSourcePre` | 128 × 540, RGBA16F | the glare's source |
| 7 to 13 | `Copy` | 128 × 64 and its five halvings | the source shrunk, then halved level by level |
| 14 to 25 | `Gaussian` | one per level and axis | each level blurred across, then down |
| 26 to 32 | (a fill), `AccGlare` | 128 × 64 | the six levels added up, weighted |
| 33 | `Copy` | 32 × 32 | the 128 × 64 level, which the CPU fetches with a blit (to `0x2ba4380`) - see [The HDR renderer](#the-hdr-renderer) |
| 34 | `ToneApplyDisplay` | the screen, `ONE, ONE` | the glare added |
| 35, 36 | `particles_quads`, `particles_second` | the screen, `ONE, ONE` | the [particles](../particles/shaders.md) |

The particles and the XMB's icons and text come after the glare, so they neither feed it nor go
through the tone curve. Up to them, the page's frame is RPCS3's: drawn from the console's own wave
mesh of 22:00:36 on 24 September and its backdrop's uniforms, it gives the screenshot taken 4 seconds
before to a level or two of 255 wherever the backdrop shows, and the same golden fringes on the
wave - see the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md). Under the music, whose glare is
the strongest of the sets, the top of the screen in the screenshots of 23:34 and 23:44 on 23
September is the page's to 3 levels on average, the rest being the glare of a wave that is not the
console's of the moment. At Theme Settings' Brightness -3, the fade's 0.55 going through the tone
curve with the rest, the screenshot of 11:37 on 3 October is the page's to a level wherever only
the backdrop shows. The backdrop and the wave both do: the composite lays them together, and
the glare is drawn out of the two and added back over the whole screen.

## The composite

`LinesController.vpo` draws a grid of 64 × 32 vertices over the screen, u from the left and v from the
bottom, and hands the fragment program two gradients made of `BACKGROUND.mnu`'s four colours, which
reach it as `c[464]` to `c[467]`, each times the scene's fade and with 1 for its fourth component
(`0x4fec8` to `0x50000`, from the composite's draw, `0x57d00`) - see [The
fade](../particles/scene-events.md#the-fade). At Theme Settings' Brightness Normal the fade stands
at 1, so the captures hold the set's own values, in the music's to the digit; the one taken at -3
holds them times 0.55, which the page gives to 5e-7:

| `BACKGROUND.mnu` | Register | Program | Where |
|---|---|---|---|
| `1` | `c[466]` | `_Colour2` | the backdrop's gradient at the top |
| `2` | `c[467]` | `_Colour1` | the backdrop's gradient at the bottom |
| `3` | `c[465]` | `_Colour3` | the wave's gradient at the left |
| `4` | `c[464]` | `_Colour4` | the wave's gradient at the right |

They are no corners: the backdrop is multiplied by one gradient, top to bottom, and the wave's light
by the other, left to right. In the day's sets the backdrop's is white and the wave's runs from
0.847 to 0.925, so the wave is a tenth brighter at the right. `coldboot1`'s put the backdrop at a
five-hundredth and the wave at nothing, which is how the XMB's start comes up out of black;
`gameboot2` dims the backdrop to 0.8 and takes the wave away, `gameboot3` and `gameboot4` take
both; `music_1` fades the backdrop to black at the bottom and tints the wave magenta at the right.

`LinesController.fpo` then works out, per pixel, with the wave's buffer read at the pixel a quarter
of a pixel up and right (`_ScreenOffset`, through the texture's convolution filter):

- the light, red / 32 + green / 2 of the wave's buffer - [`_Encode`](shading.md#the-textures) read
  back;
- L = backdrop × the backdrop's gradient + light × the wave's gradient, the backdrop read between
  its 64 × 32 texels;
- red, green and blue each through the preexpose tables, with noise of 0 to 7 eighths of a step
  added (`preexpose_Noise`, 32 × 32 texels, drawn afresh every frame - see [The noise](#the-noise));
- alpha, the glare's mask, from the same tables for the brightest of the three.

## The preexpose tables

Two RG16F tables of 128 × 128 texels, read unnormalised with linear filtering. The first is read at
(8 R, 8 G) and gives red and green, the second at (8 B, 8 max(R, G)) and gives blue and the mask.
The HDR renderer works them out every frame in single precision (`0x71794`), texel i of each
holding:

- the tone curve, y = x (1 + x / W²) / (1 + x), at x = `EXPOSURE` × 16 i / 127, W being
  `WHITE LEVEL`, times `_Gamma`;
- the mask, (y - `GLARE THRESH`) y / (8 min(y, 1)), y without `_Gamma`, at the larger of its two
  coordinates - 0 / 0 at texel 0.

`_Gamma` is the value the scene picks by a system setting and sends the particles too (`0x1b128`,
`0x70bf8`) - see [Uniform values at run time](../particles/shaders.md#uniform-values-at-run-time).
It is 1 in every savestate, and the curve fits every capture's tables to a step of half precision
(three in two taken mid-blend), the cold boot's included, where W runs from 0.90 to 1, and the mask
to a few, most where it crosses 0. In yoake's, higure's and night's sets W is 0.999878, which makes
the curve a straight line: the composite just multiplies by `EXPOSURE`. In the base set, which is
day's, W = 0.899 and the curve brightens what is already bright.

**The tables are read half a texel short.** They hold the curve at 16 i / 127 for texel i and are
read at 8 L, and a texel's middle is half a texel in: what comes out is the curve at
`EXPOSURE` × (1.0079 L - 1/16). So the composite takes 1/16 off the light before it exposes it,
and anything darker stays black. The screenshots show it. At 22:00 on 24 September, at x = 1850,
the backdrop above the wave is (10, 0, 0) and the wave's top edge is (23, 10, 0): red and green
rise by 13 and 10 while blue stays at 0, and inside the wave blue only leaves 0 once red is past
35. The wave's light is grey, so added after the exposure it would raise blue with the others; with
the 1/16 off, a faint light only shows in the channels where the backdrop has some already, and
the wave's thin parts come out the backdrop's colour - the golden wave of the console's nights.
Where every channel is clear of 1/16 the light adds evenly: at 17:09 on 23 September the wave's
brightest part adds 93, 92 and 87 to the backdrop.

## The noise

`preexpose_Noise` is drawn afresh every frame, with the tables (`0x71794`). Each of its 32 × 32
texels holds one byte, in red, green and blue alike. Texel i takes n = c + i + 1, c being the
renderer's counter, 0 when it is built and 1024 more each frame; then x = (n << 13) xor n, h = (x
(15731 x² + 789221) + 1376312589) mod 2³¹ and u = (1 - h / 2³⁰) / 2 + 1/2, from 0 to 1, in single
precision; and the byte is 255 min(1, 8 `DITHER` u), cut to a whole number. At `DITHER`'s 1/255 it
runs from 0 to 7, which the composite adds as eighths of a step and `ToneApplyDisplay` takes off the
glare again.

**Every capture's noise is one frame's, to the texel:** the frame since the renderer was built -
3004 and 5707 in the two of 21 September, taken 50 and 96 seconds after a cold boot. Its parity
picks one of two copies of the tables and the noise: those at `0x2b60000`, `0x2b80000` and
`0x2ba8380` when it is odd, those at `0x2b70000`, `0x2b90000` and `0x2ba9380` when it is even.

## The glare

- **`GlareSourcePre`.** The screen, read between texels into 128 × 540 - so between columns 7 and 8
  of every 15, and rows 2j and 2j + 1 - times its mask, times 8. Its alpha, the luminance (0.27,
  0.67, 0.06) of the light undone through the curve and `EXPOSURE` (`_Exposure`, `_WhiteSqrRcp`),
  is not drawn: it reaches only the 32 × 32 copy.
- **The levels.** That, read between texels into 128 × 64, then halved five times down to 4 × 2,
  each texel the mean of four.
- **`Gaussian`.** Each level blurred across and then down, the texel and up to seven on either
  side, a texel of the level apart (`_Offset`, from `Gaussian.vpo`). Each channel has its own
  weights, exp(-k² / 2 σ²) normalised over |k| ≤ floor(3 σ - 1), σ being `GAUSSIAN RAD` R, G or B:
  at σ = 2 five texels, at 1.99949 four. The renderer works them out when those change (`0x71384`,
  `0x71260`).
- **`AccGlare`.** The six blurred levels, each read between texels into 128 × 64 and added, the
  finest weighing `GLARE LEVEL`² / (1 + p + p² + ... + p⁵) and each coarser one p times the one
  before, p being `GLARE SUM POW` - weights patched into the program between its draws by inline
  transfers (0.0278 to 0.890 in the capture above, halving). The renderer works out `GLARE LEVEL`
  pˡ / Σ pᵏ each frame (`0x7b188`), and each level's draw sends it times `GLARE LEVEL` again
  (`0x7c544`).
- **`ToneApplyDisplay`.** The sum, read between texels over the screen, times `_GlareWeight`, 1 in
  every capture, less the same noise, added to the screen.

The chain's textures are set to CLAMP, which RPCS3 runs as clamp-to-edge (`vk_wrap_mode`, in its
`VKFormats.cpp`): a tap or a read past an edge repeats the edge's texel. Its screenshots under the
music show it: the backdrop's own glare, brightest at the top right, reaches that corner whole,
where a black border leaves it 27 to 33 levels short. The RSX's own CLAMP blends the edge with the
border colour, which only real hardware could show. The mask is 0 below the threshold and reaches 1, where it stays,
at y = 3.2 for a threshold of 0.7, so the glare's source is at most 8 times the screen.

## The HDR renderer

The scene's HDR renderer copies `HDR.mnu` in when a parameter changes (`0x25c0c`). Each frame its
start (`0x71cc4`) flips to the other copy of the tables and the noise, binds them to units 15, 14
and 13 and fills them - see [The noise](#the-noise).

Before that it hands a controller `EXPOSURE` and `WHITE LEVEL`, with the luminance statistics
worked out the frame before, to change as it will (`0x70b54`): the hook of an automatic exposure.
The only controller the module has, built in with the renderer, does nothing (`0x70ca0`, a bare
return), so the two stand at the sets' values, as every capture's uniforms show; nor does any code
use the names `MIN EXPOSURE`, `MAX EXPOSURE` and `EXPOSURE SLIDER` the module holds. The statistics
are what the CPU fetches the 32 × 32 copy for (`0x722fc`): from its alpha, the luminance
`GlareSourcePre` wrote, the least, the most, the log-average, and the spread about it, above and
below.

The scene also hands the composite `EXPOSURE`, 1 / W², `_Gamma` and `GLARE THRESH` in one vector
(`0x70c44`), which its draw sends as `_HDRParams` (`0x58284`). `LinesController.fpo` declares no
such uniform, so it goes nowhere, as `FALLOFF` does - see [The draw's
uniforms](shading.md#the-draws-uniforms).

## What `HDR.mnu` drives

| `HDR.mnu` | Where it goes |
|---|---|
| `EXPOSURE` | the tables; `GlareSourcePre` `_Exposure` |
| `WHITE LEVEL` | the tables; `GlareSourcePre` `_WhiteSqrRcp`, 1 / W² |
| `GLARE THRESH` | the tables' mask |
| `GLARE LEVEL`, `GLARE SUM POW` | `AccGlare` `_Weight` |
| `GAUSSIAN RAD R`, `G`, `B` | `Gaussian` `_Weights0` to `_Weights7` |
| `DITHER` | the noise |

They blend from set to set with the rest of the scene's parameters, by the same factor as the
backdrop's colours - see [How one set blends into
another](../particles/day-cycle.md#how-one-set-blends-into-another) - W itself, not 1 / W²: from the
blended sets, the page's uniforms give those of seven captures to 5e-5, through the evening, the
night, the cold boot and the music. The flags (`ENABLED`, `TEX SIZE`, `TEX MAX MIP`, `GLARE`, `GLARE_ONLY`, `TONEBEFORE`,
`BLUR`) are the same in every set but the two welcome ones, and their effect is not followed. The
base file leaves `DITHER` out, and the code's default, 1/255, is what music's and the welcome's
files set it to. `GAMMA`, in music's file, is no parameter `HDR.mnu` registers, so the scene does not
read it.
