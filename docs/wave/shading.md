# The shading: how the wave is lit

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): how the RSX lights the mesh `spline.elf`
writes - see [What the console draws](output.md) - with `lines1.vpo`, `lines1.fpo` and three
textures, and what comes after.

## The draw

**Verified** from the captures. The wave is the frame's fifth draw. It blends `ONE, ONE`, adding its
light to the backdrop, with no depth test, and binds three textures:

| Unit | Uniform | Texture |
|---|---|---|
| 0 | `_Stripes` | 16 × 4, made at run time |
| 1 | `_FresLUT` | 512 × 1, `textures/TGA/freslut1.tga` |
| 2 | `_Encode` | 4096 × 1, made at run time |

All three are A8R8G8B8: `_Stripes` filtered linearly and repeating across, `_FresLUT` filtered
linearly and clamped, `_Encode` read from the nearest texel and clamped.
About thirty full-screen passes follow before the particles' two - draws 5 to 34 in the capture of
24 September at 18:21 - and what they do with the wave's light is not followed.

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
`_Brightness` m b times half for small m, falling to nothing as m grows (inferred).

## The textures

**Verified** from the captures and `custom_render_plugin`:

- **`_FresLUT`.** `0x4eb40` loads the file, whose path the renderer hands it (`0x56d08`), and copies
  its texels in as red, green, blue and 255, which the sampler's remap (`0xaa93`) reads back as the
  file's own colours. Red is f, the rim light's weight: nothing up to texel 14, a peak of 252 at
  texel 29, and gone by texel 115. Green, b, is 255 throughout. Blue falls from 255 to nothing by
  texel 270 and is not read. On the console |e · n| m runs 0.0004 / 0.034 / 0.143 (5th, 50th and
  95th percentile, the capture of 18:21), and m 0.006 / 0.075 / 0.204, so the rim light falls on
  the folds the surface turns edge-on at (inferred).
- **`_Stripes`.** A stripe's profile, 16 texels across, one row per step of m: the first flat at
  127, the others peaking at 170, 219 and 255, each narrower than the last. All four channels are
  equal. Where it is made is not followed.
- **`_Encode`.** 4096 texels over the light from 0 to 1. Two channels hold a coarse part,
  4 ⌊n/32⌋ - 1 for texel n from 32 on, saturating at 255 from texel 2048, a light of 0.5. The
  other two hold a fine part, about 2 (n mod 32), from 0 to 62, with room for four layers of the
  wave to add up before it carries. That keeps the light the wave adds up more precisely than 8
  bits would (inferred). Where it is made, and what reads the sums back, is not followed.
