# The shading: how the wave is lit

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): how the RSX lights the mesh `spline.elf`
writes - see [What the console draws](output.md) - with `lines1.vpo`, `lines1.fpo` and three
textures. What comes after is in [The passes after the wave](postprocess.md).

## The draw

**Verified** from the captures. The wave is the frame's fifth draw. It goes into a buffer of its own,
1920 × 1080 and cleared to black, and writes its red and green only, blending `ONE, ONE` with no
depth test - so where the wave folds over itself its light adds up. It binds three textures:

| Unit | Uniform | Texture |
|---|---|---|
| 0 | `_Stripes` | 16 × 4, made at run time |
| 1 | `_FresLUT` | 512 × 1, `textures/TGA/freslut1.tga` |
| 2 | `_Encode` | 4096 × 1, made at run time |

All three are A8R8G8B8: `_Stripes` filtered linearly and repeating across, `_FresLUT` filtered
linearly and clamped, `_Encode` read from the nearest texel and clamped. The composite that follows
reads the buffer back and lays it over the backdrop - see [The composite](postprocess.md#the-composite).

## The draw's uniforms

**Verified** from the captures and from RPCS3's decompilation of the program, the one vertex program
in its shader log that reads attributes 0, 8 and 9.

| Uniform | Register | Parameter |
|---|---|---|
| internal constant 2 | c[464] | none |
| `_MipmapBias` | c[465] | `LINE1.mnu: MIPMAP BIAS` |
| `_Brightness` | c[466] | `LINE1.mnu: BRIGHTNESS` |
| `_Fresnel` | c[467] | `LINE1.mnu: FRESNEL` |

The three values move with the parameter sets, by the same factor as the particles' - see [Themes
blend over hours](../particles/day-cycle.md#themes-blend-over-hours).

The renderer sends `FALLOFF` too, as `_Falloff` (`0x4c94c`), but `lines1.vpo` does not declare it.
Of the three programs `SHADER` picks between, `lines0`, `lines1` and `lines2`, only `lines2.vpo`
does, and `SHADER` is 1 in every set. A uniform its program lacks is never sent: the renderer looks
each one up by name (`cellGcmCgGetNamedParameter`, through `qgl_base`) and sends only those the
program uses (`0x4c5d8`). So `FALLOFF` changes nothing, and no capture's wave draw holds its value,
by day (1.00318), by night (0.048) or between.

The program passes the position and u through. Let e be the position normalised and n the normal
normalised. The program works out:

- m = |e · normal| / |position| × `_MipmapBias`, with the normal as it comes, so m grows with the
  cell's size on screen;
- TEXCOORD0 = (u, m), and TEXCOORD1 = (`_Fresnel` m, `_Brightness` m, |e · n| m, v);
- e reflected about n (using c[464]), written to an output the fragment program does not read.

## The fragment program

**Verified** from RPCS3's decompilation, its embedded constants read live in the captures, where
`_Spacing` is `SPACING` and `_Thinness` is `THINNESS`. Of what the vertex program hands it:

- x = clamp(fract(u × `_Spacing`) - `_Thinness`, 0, 1) / (1 - `_Thinness`) is where the fragment
  sits across a stripe, past the stripe's dark part. The stripes run along the lines, `SPACING`
  of them over the 128;
- s = `_Stripes` at (x, m);
- f and b are `_FresLUT`'s red and green at (|e · n| m, v);
- the light is (`_Fresnel` m f + `_Brightness` m b s) × v,
- and the colour is `_Encode` at (light, 0.5).

`THINNESS` is 1 in every set, which makes x 0 / 0: the stripes are off. RPCS3 computes NaN there.
The page reads it as 0, `_Stripes`' column at the edge of a stripe, which leaves the even light
`_Brightness` m b times half for m up to an eighth, falling to a fiftieth at three eighths and to
nothing past them (inferred).

## The textures

**Verified** from the captures and `custom_render_plugin`:

- **`_FresLUT`.** `0x4eb40` loads the file, whose path the renderer hands it (`0x56d08`), and copies
  its texels in as red, green, blue and 255, which the sampler's remap (`0xaa93`) reads back as the
  file's own colours. Red is f, the rim light's weight: nothing up to texel 14, a peak of 252 at
  texel 29, and gone by texel 115. Green, b, is 255 throughout. Blue falls from 255 to nothing by
  texel 270 and is not read. On the console |e · n| m runs 0.0004 / 0.034 / 0.143 (5th, 50th and
  95th percentile, the capture of 18:21), and m 0.006 / 0.075 / 0.204, so the rim light falls on
  the folds the surface turns edge-on at (inferred).
- **`_Stripes`.** A stripe's profile, 16 texels across, one row per step of m, which the lines
  renderer makes at start-up (`0x4bad0`): texel c of row r is 255 min(1, (1.01 - 4 (c/15 - ½)²) ^
  (20 (r/3)³) × (1 + r/3) / 2), cut to a whole number, in single precision but for the power,
  taken in double. The width is powf(2, 4), set by a static initialiser (`0x14fc`). The first row
  is flat at 127, the others peak at 170, 219 and 255, each narrower than the last, and the column
  at a stripe's edge holds 127, 5, 0 and 0. All four channels are equal. Every capture's texture
  is this to the byte, kept swizzled, as the RSX keeps small textures.
- **`_Encode`.** 4096 texels over the light from 0 to 1, which the lines renderer makes at start-up
  (`0x4b928`): texel n splits v = 128 n / 4095 into its whole part w and its fraction q (`modf`),
  and holds a fine part, 255 q / 4, and a coarse one, 255 min(1, w / 64), both cut to whole
  numbers, as fine, coarse, fine, coarse - every capture's table to the byte. Through the
  sampler's remap the program reads the fine part in red and blue, 2 (n mod 32) for texel n but
  2n - 1 in the first 32 texels, and one more or less here and there, from 0 to 63; and the coarse
  part in green and alpha, 4 ⌊n/32⌋ - 1 from texel 32 on, saturating at 255 from texel 2048. The
  composite reads the buffer back as red / 32 + green / 2, so a fragment's light stops at 0.5 and
  the buffer's at 0.53, its two channels saturating at 8 bits; the fine part has room for four
  layers of the wave to add up before it does. That keeps the light the wave adds up more
  precisely than 8 bits would (inferred).
