# The programs: what back_colours0 and back_colours1 do

Part of the [backdrop notes](../../BACKGROUND_REVERSE_ENGINEER.md): the 538 instructions of
`lib/moyou/back_colours0.fpo`, which draw the backdrop into its 64 × 32 buffer every frame, and the 79
of `back_colours1.fpo`, which draw it instead under the music and on the welcome screens - see [What
the firmware has](firmware.md#what-the-firmware-has) for their textures and uniforms, and [What the
uniforms read](uniforms.md) for where the scene gets them.

**Verified** from RPCS3's decompilation, with its constants filled in from the microcode: re-authored
the way below, it gives the decompiled program's output to float precision (4e-7) for any month and
any value of its uniforms. Fed what the console fed it in a capture, and put through the composite
after the wave - see [The passes after the wave](../wave/postprocess.md) - it gives RPCS3's screenshots
of the backdrop to a level or two of 255, at 22:00 on 24 September and at 17:09 on 23 September.

uv is the buffer's own, u across and v from the bottom of the screen up, which is where the textures'
first rows land - see [The textures are drawn upside down](firmware.md#the-textures-are-drawn-upside-down).

## The textures

Each of the four is read at the same point, through a quintic step across its texels: for t = 64 u
+ 0.5 (and 32 v + 0.5), the point read is floor(t) + s(fract(t)) - 0.5 texels in, with s(f) =
f³ (6 f² - 15 f + 10). Linear filtering between texels then gives a surface with no corners at them,
smoother than plain bilinear filtering of a 64 × 32 image stretched over the screen.

## The day's two months

The day's textures, this month's and next month's, each go through hue, saturation and value and
back, the hue untouched:

- the value is multiplied by the day's light, w(D; 0.005, 0.01), by e^(-6.4 v (1 - w(D; 0.005,
  0.005))), which darkens the top of the screen outside the day's window, and by the day's glows
  plus 0.6;
- the saturation is multiplied by (2 - e^(-6.4 v (1 - w(D; 0.01, 0.01))) - g / 4)(0.9 - the day's
  glows), with g = e^(-0.01 (`_MonthTime` - 15)²): pushed up where the light is low, a little less in
  the middle of the month, and down in the glows. It can pass 1, and the channels that would go
  below 0 are clamped.

D is `_DayTime`, and a window is

    w(c; a, b) = (1 + tanh(a (c - 600))) / 2 × (1 + tanh(b (1800 - c))) / 2,

each tanh's argument held within ±10: 1 between 600 and 1800 on the clock, soft or sharp at the
edges. The glows of a clock c, at angle θ = (c - 600) π / 1200:

    0.2 e^(-4 (4 (v - 0.05)² + (u - 0.5 - 0.4 cos θ)² / (1 + e^(-0.008 (c - 1200)²))))
    + 0.19 e^(-8 (1.25 (v - 0.99 sin θ)² + (u - 0.5 + 0.8 cos θ)²))

- a broad glow low in the middle of the screen, which drifts across with the clock and spreads
  twice as wide about 1200, and a small one that goes round an ellipse as the clock does, crossing
  the top of the screen at 1200.

## Next month

The two months are mixed by a wipe up the screen: next month's share is (1 - tanh(z)) / 2, with

    z = (v + 1 - m / 10)(0.1 + 0.0444 (m - 15)²),    m = _MonthTime,

z held within ±10. Next month comes in from the bottom of the screen and climbs it as the month goes
on; its edge is soft in the middle of the month (at m = 15 the two are half and half, 52.5% next
month at the bottom of the screen and 47.5% at the top) and sharp near its ends, where the factor
grows. On the 24th of September, m = 23, next month is 99.9% of the bottom of the screen and 85% of
its top.

## The night

The night's two textures are mixed by the same wipe and multiplied by the night's level: N =
`_NightTime`, w(N; 0.005, 0.01) × e^(-6.4 v (1 - w(N; 0.005, 0.005))) × (the night's glows + 0.6),
never below `_NightBrightness` and clamped to 1. Its hue and saturation are the textures' own.

## The two together

    colour = night + (day - night) × _NightDayBlend,    alpha = _Alpha

and the draw blends it over what the buffer held by that alpha - see [What the uniforms
read](uniforms.md#_alpha).

## back_colours1, the music's

`COLOUR SHADER` 1 picks it: the music's set and the two welcome screens'. **Verified** the same way:
RPCS3 decompiled it out of its cache as the XMB booted, and re-authored as below it gives the
decompiled program's output to 1.2e-7. It reads no texture, only `_DayTime` and `_Alpha`. With

    far = e^(-((u - 1.5)² + (v - 1.5)²) / 2),    low = (u - 0.4)² / 6 + (v - 0.1)²,

- red = 0.4 e^(-0.4 (1 - v)) + 0.6 e^(-16 (1 + cos(_DayTime) / 2) low) + 0.375 far,
- green = 0.3 e^(-0.2 (1 - v)) + 0.25 e^(-12 low) + 0.3 far,
- blue = 0.5 e^(-0.1 (1 - v)) + 0.45 e^(-8 low) + 0.6 far,

all three times 0.4 (1 + tanh(2.5 (v - 0.2 u - 0.4))), the tanh's argument held within ±10, and alpha
`_Alpha`: a light fading down the screen in each channel, a broad glow from beyond the top right
corner, a small one low on the left, and a soft edge below which it all darkens, from 0.4 up the
screen at the left to 0.6 at the right. It comes out lavender, (0.48, 0.37, 0.67) at the top right.
The music's colours turn it into the screenshots' purple, colour 1 pink at the top and colour 2
black at the bottom - which also takes away the low glow, the only part `_DayTime` moves.

Put through the composite after the wave with the music's set, it gives the top of the screen in
the screenshots of 23:34 and 23:44 on 23 September to 3 levels on average - see [The
implementation](implementation.md).
